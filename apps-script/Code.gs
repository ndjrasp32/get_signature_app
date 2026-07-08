var SHEET_NAMES = {
  DOCUMENTS: "documents",
  TARGETS: "targets",
  AUDIT_LOGS: "audit_logs"
};

var HEADERS = {};
HEADERS[SHEET_NAMES.DOCUMENTS] = [
  "document_id",
  "public_token",
  "title",
  "school_name",
  "event_date",
  "retention_until",
  "status",
  "created_at"
];
HEADERS[SHEET_NAMES.TARGETS] = [
  "target_id",
  "document_id",
  "school_name",
  "student_number",
  "name",
  "status",
  "signed_at",
  "signature_data",
  "user_agent",
  "created_at",
  "updated_at"
];
HEADERS[SHEET_NAMES.AUDIT_LOGS] = [
  "log_id",
  "actor_type",
  "action",
  "document_id",
  "target_id",
  "details_json",
  "user_agent",
  "created_at"
];

var ADMIN_SESSION_TTL_SECONDS = 6 * 60 * 60;
var TARGET_TOKEN_TTL_SECONDS = 15 * 60;
var MAX_SIGNATURE_DATA_URL_CHARS = 45000;
var MIN_SIGNATURE_DATA_URL_CHARS = 800;

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || "health";
    if (action === "health") {
      return jsonOutput_({
        ok: true,
        service: "signature-app",
        time: now_()
      });
    }

    return jsonOutput_({
      ok: false,
      error: "지원하지 않는 요청입니다."
    });
  } catch (error) {
    console.error(error);
    return jsonOutput_({
      ok: false,
      error: "요청 처리 중 오류가 발생했습니다."
    });
  }
}

function doPost(e) {
  try {
    var payload = parsePayload_(e);
    var action = payload.action || (e && e.parameter && e.parameter.action);

    switch (action) {
      case "verifyTarget":
        return jsonOutput_(handleVerifyTarget_(payload));
      case "submitSignature":
        return jsonOutput_(handleSubmitSignature_(payload));
      case "adminLogin":
        return jsonOutput_(handleAdminLogin_(payload));
      case "adminListDocuments":
        return jsonOutput_(handleAdminListDocuments_(payload));
      case "adminGetDocument":
        return jsonOutput_(handleAdminGetDocument_(payload));
      case "adminCreateDocument":
        return jsonOutput_(handleAdminCreateDocument_(payload));
      case "adminUpsertTargets":
        return jsonOutput_(handleAdminUpsertTargets_(payload));
      default:
        return jsonOutput_({
          ok: false,
          error: "지원하지 않는 요청입니다."
        });
    }
  } catch (error) {
    console.error(error);
    return jsonOutput_({
      ok: false,
      error: error && error.message ? error.message : "요청 처리 중 오류가 발생했습니다."
    });
  }
}

function initializeSignatureSheets() {
  var ss = getSpreadsheet_();
  ensureSheet_(ss, SHEET_NAMES.DOCUMENTS, HEADERS[SHEET_NAMES.DOCUMENTS]);
  ensureSheet_(ss, SHEET_NAMES.TARGETS, HEADERS[SHEET_NAMES.TARGETS]);
  ensureSheet_(ss, SHEET_NAMES.AUDIT_LOGS, HEADERS[SHEET_NAMES.AUDIT_LOGS]);

  ss.getSheetByName(SHEET_NAMES.DOCUMENTS).getRange("A:H").setNumberFormat("@");
  ss.getSheetByName(SHEET_NAMES.TARGETS).getRange("A:K").setNumberFormat("@");
  ss.getSheetByName(SHEET_NAMES.AUDIT_LOGS).getRange("A:H").setNumberFormat("@");

  var result = {
    ok: true,
    spreadsheet_id: ss.getId(),
    spreadsheet_name: ss.getName(),
    spreadsheet_url: ss.getUrl(),
    sheets: ss.getSheets().map(function (sheet) {
      return sheet.getName();
    })
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function diagnoseSignatureAppSetup() {
  var props = PropertiesService.getScriptProperties();
  var result = {
    ok: true,
    spreadsheet_id_property: props.getProperty("SPREADSHEET_ID") || "",
    active_spreadsheet_id: "",
    active_spreadsheet_name: "",
    target_spreadsheet_id: "",
    target_spreadsheet_name: "",
    target_spreadsheet_url: "",
    sheets: []
  };

  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) {
      result.active_spreadsheet_id = active.getId();
      result.active_spreadsheet_name = active.getName();
    }
  } catch (error) {
    result.active_spreadsheet_error = error && error.message ? error.message : String(error);
  }

  try {
    var ss = getSpreadsheet_();
    result.target_spreadsheet_id = ss.getId();
    result.target_spreadsheet_name = ss.getName();
    result.target_spreadsheet_url = ss.getUrl();
    result.sheets = ss.getSheets().map(function (sheet) {
      return sheet.getName();
    });
  } catch (error2) {
    result.ok = false;
    result.error = error2 && error2.message ? error2.message : String(error2);
  }

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function diagnoseTargetMatchFromTemporaryProperties() {
  var props = PropertiesService.getScriptProperties();
  var publicToken = normalize_(props.getProperty("DEBUG_PUBLIC_TOKEN"));
  var schoolName = normalize_(props.getProperty("DEBUG_SCHOOL_NAME"));
  var studentNumber = normalize_(props.getProperty("DEBUG_STUDENT_NUMBER"));
  var name = normalize_(props.getProperty("DEBUG_NAME"));

  if (!publicToken || !schoolName || !studentNumber || !name) {
    throw new Error(
      "Script Properties에 DEBUG_PUBLIC_TOKEN, DEBUG_SCHOOL_NAME, DEBUG_STUDENT_NUMBER, DEBUG_NAME을 모두 설정하세요."
    );
  }

  var document = findDocumentByPublicToken_(publicToken);
  var result = {
    ok: true,
    input: {
      public_token: publicToken,
      school_name: schoolName,
      student_number: studentNumber,
      name: name
    },
    document_found: Boolean(document),
    document: document
      ? {
          document_id: document.document_id,
          title: document.title,
          school_name: document.school_name,
          status: document.status
        }
      : null,
    target_count_for_document: 0,
    exact_match_count: 0,
    school_name_match_count: 0,
    student_number_match_count: 0,
    name_match_count: 0,
    likely_reason: ""
  };

  if (!document) {
    result.likely_reason = "public_token에 해당하는 documents 행을 찾을 수 없습니다.";
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  }

  var targets = getRows_(SHEET_NAMES.TARGETS).filter(function (target) {
    return target.document_id === document.document_id;
  });
  var inputKey = [schoolName, studentNumber, name].join("\u001f");

  result.target_count_for_document = targets.length;
  result.school_name_match_count = targets.filter(function (target) {
    return normalize_(target.school_name) === schoolName;
  }).length;
  result.student_number_match_count = targets.filter(function (target) {
    return normalize_(target.student_number) === studentNumber;
  }).length;
  result.name_match_count = targets.filter(function (target) {
    return normalize_(target.name) === name;
  }).length;
  result.exact_match_count = targets.filter(function (target) {
    return targetIdentityKey_(target) === inputKey;
  }).length;

  if (document.status !== "active") {
    result.likely_reason = "documents.status가 active가 아닙니다.";
  } else if (targets.length === 0) {
    result.likely_reason = "이 document_id로 등록된 targets 행이 없습니다.";
  } else if (result.exact_match_count === 0) {
    result.likely_reason =
      "학교명, 학번, 이름 3개가 동시에 일치하는 targets 행이 없습니다.";
  } else {
    result.likely_reason = "검증 입력값과 일치하는 대상자가 있습니다.";
  }

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function createSignatureSpreadsheet() {
  var ss = SpreadsheetApp.create("signature-app-data");
  PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", ss.getId());
  initializeSignatureSheets();

  var result = {
    ok: true,
    spreadsheet_id: ss.getId(),
    spreadsheet_name: ss.getName(),
    spreadsheet_url: ss.getUrl()
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function setAdminPasswordFromPrompt() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt(
    "관리자 비밀번호 설정",
    "GitHub나 Code.gs에 남기지 않을 비밀번호를 입력하세요.",
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  setAdminPassword_(result.getResponseText());
  ui.alert("관리자 비밀번호 해시가 Script Properties에 저장되었습니다.");
}

function setAdminPasswordFromTemporaryProperty() {
  var props = PropertiesService.getScriptProperties();
  var password = props.getProperty("TEMP_ADMIN_PASSWORD");

  if (!password) {
    throw new Error("Script Properties에 TEMP_ADMIN_PASSWORD를 먼저 저장하세요.");
  }

  setAdminPassword_(password);
  props.deleteProperty("TEMP_ADMIN_PASSWORD");
}

function handleVerifyTarget_(payload) {
  var publicToken = requiredString_(payload.public_token, "문서 토큰이 필요합니다.");
  var schoolName = normalize_(payload.school_name);
  var studentNumber = normalize_(payload.student_number);
  var name = normalize_(payload.name);
  var userAgent = normalize_(payload.user_agent);

  if (!schoolName || !studentNumber || !name) {
    return targetNotFoundResponse_();
  }

  var document = findDocumentByPublicToken_(publicToken);
  if (!document || document.status !== "active") {
    appendAudit_("signer", "verify_failed", "", "", { reason: "document_not_found" }, userAgent);
    return targetNotFoundResponse_();
  }

  var target = findTargetByIdentity_(
    document.document_id,
    schoolName,
    studentNumber,
    name
  );

  if (!target) {
    appendAudit_(
      "signer",
      "verify_failed",
      document.document_id,
      "",
      { reason: "target_not_found" },
      userAgent
    );
    return targetNotFoundResponse_();
  }

  if (isSigned_(target)) {
    appendAudit_(
      "signer",
      "verify_already_signed",
      document.document_id,
      target.target_id,
      {},
      userAgent
    );
    return {
      ok: true,
      already_signed: true,
      document: publicDocument_(document)
    };
  }

  var targetToken = makeToken_(64);
  CacheService.getScriptCache().put(
    "target_token:" + targetToken,
    JSON.stringify({
      document_id: document.document_id,
      public_token: publicToken,
      target_id: target.target_id,
      created_at: now_()
    }),
    TARGET_TOKEN_TTL_SECONDS
  );

  appendAudit_(
    "signer",
    "verify_success",
    document.document_id,
    target.target_id,
    {},
    userAgent
  );

  return {
    ok: true,
    already_signed: false,
    document: publicDocument_(document),
    target_token: targetToken
  };
}

function handleSubmitSignature_(payload) {
  var publicToken = requiredString_(payload.public_token, "문서 토큰이 필요합니다.");
  var targetToken = requiredString_(payload.target_token, "서명 세션이 필요합니다.");
  var signatureData = requiredString_(payload.signature_data, "서명 데이터가 필요합니다.");
  var userAgent = normalize_(payload.user_agent);

  validateSignatureData_(signatureData);

  var cached = CacheService.getScriptCache().get("target_token:" + targetToken);
  if (!cached) {
    return {
      ok: false,
      error: "서명 세션이 만료되었습니다. 다시 확인해 주세요."
    };
  }

  var tokenData = JSON.parse(cached);
  if (tokenData.public_token !== publicToken) {
    CacheService.getScriptCache().remove("target_token:" + targetToken);
    return {
      ok: false,
      error: "서명 세션이 올바르지 않습니다."
    };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var document = findDocumentByPublicToken_(publicToken);
    if (!document || document.document_id !== tokenData.document_id || document.status !== "active") {
      return {
        ok: false,
        error: "서명 문서를 확인할 수 없습니다."
      };
    }

    var target = findTargetById_(tokenData.document_id, tokenData.target_id);
    if (!target) {
      return {
        ok: false,
        error: "대상자 정보를 확인할 수 없습니다."
      };
    }

    if (isSigned_(target)) {
      CacheService.getScriptCache().remove("target_token:" + targetToken);
      return {
        ok: false,
        already_signed: true,
        error: "이미 제출된 서명입니다."
      };
    }

    var signedAt = now_();
    updateRow_(
      SHEET_NAMES.TARGETS,
      target._row,
      {
        status: "signed",
        signed_at: signedAt,
        signature_data: signatureData,
        user_agent: userAgent,
        updated_at: signedAt
      }
    );

    CacheService.getScriptCache().remove("target_token:" + targetToken);
    appendAudit_(
      "signer",
      "signature_submitted",
      document.document_id,
      target.target_id,
      { signature_length: signatureData.length, ip: "unavailable_in_apps_script" },
      userAgent
    );

    return {
      ok: true,
      signed_at: signedAt
    };
  } finally {
    lock.releaseLock();
  }
}

function handleAdminLogin_(payload) {
  var password = requiredString_(payload.password, "비밀번호가 필요합니다.");
  var userAgent = normalize_(payload.user_agent);
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty("ADMIN_PASSWORD_SALT");
  var storedHash = props.getProperty("ADMIN_PASSWORD_HASH");

  if (!salt || !storedHash) {
    return {
      ok: false,
      error: "관리자 비밀번호가 설정되지 않았습니다."
    };
  }

  var candidateHash = sha256Hex_(salt + "\n" + password);
  if (!safeEquals_(candidateHash, storedHash)) {
    appendAudit_("admin", "admin_login_failed", "", "", {}, userAgent);
    return {
      ok: false,
      error: "관리자 인증에 실패했습니다."
    };
  }

  var sessionToken = makeToken_(64);
  CacheService.getScriptCache().put(
    "admin_session:" + sessionToken,
    JSON.stringify({ created_at: now_() }),
    ADMIN_SESSION_TTL_SECONDS
  );

  appendAudit_("admin", "admin_login_success", "", "", {}, userAgent);

  return {
    ok: true,
    session_token: sessionToken,
    expires_in: ADMIN_SESSION_TTL_SECONDS
  };
}

function handleAdminListDocuments_(payload) {
  requireAdminSession_(payload.session_token);

  var documents = getRows_(SHEET_NAMES.DOCUMENTS);
  var targets = getRows_(SHEET_NAMES.TARGETS);
  var countMap = {};

  targets.forEach(function (target) {
    if (!countMap[target.document_id]) {
      countMap[target.document_id] = { total: 0, signed: 0 };
    }
    countMap[target.document_id].total += 1;
    if (isSigned_(target)) {
      countMap[target.document_id].signed += 1;
    }
  });

  var result = documents
    .map(function (document) {
      return adminDocumentSummary_(document, countMap[document.document_id]);
    })
    .sort(function (a, b) {
      return String(b.created_at).localeCompare(String(a.created_at));
    });

  return {
    ok: true,
    documents: result
  };
}

function handleAdminGetDocument_(payload) {
  requireAdminSession_(payload.session_token);
  var documentId = requiredString_(payload.document_id, "문서 ID가 필요합니다.");
  var document = findDocumentById_(documentId);

  if (!document) {
    return {
      ok: false,
      error: "문서를 찾을 수 없습니다."
    };
  }

  var targets = getRows_(SHEET_NAMES.TARGETS)
    .filter(function (target) {
      return target.document_id === documentId;
    })
    .sort(function (a, b) {
      return String(a.created_at).localeCompare(String(b.created_at));
    })
    .map(stripRowNumber_);

  var signed = targets.filter(isSigned_).length;
  var counts = {
    total: targets.length,
    signed: signed,
    pending: targets.length - signed
  };

  return {
    ok: true,
    document: adminDocumentSummary_(document, counts),
    targets: targets,
    counts: counts
  };
}

function handleAdminCreateDocument_(payload) {
  requireAdminSession_(payload.session_token);

  var title = requiredString_(payload.title, "문서명이 필요합니다.");
  var schoolName = requiredString_(payload.school_name, "학교명이 필요합니다.");
  var eventDate = requiredString_(payload.event_date, "행사 일자가 필요합니다.");
  var retentionUntil = requiredString_(payload.retention_until, "보관 기한이 필요합니다.");

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var documentId = makeId_("doc");
    var publicToken = makeToken_(48);
    var createdAt = now_();

    appendRow_(
      SHEET_NAMES.DOCUMENTS,
      {
        document_id: documentId,
        public_token: publicToken,
        title: title,
        school_name: schoolName,
        event_date: eventDate,
        retention_until: retentionUntil,
        status: "active",
        created_at: createdAt
      }
    );

    appendAudit_(
      "admin",
      "document_created",
      documentId,
      "",
      { title: title },
      normalize_(payload.user_agent)
    );

    return {
      ok: true,
      document_id: documentId,
      public_token: publicToken,
      public_url: makePublicUrl_(publicToken)
    };
  } finally {
    lock.releaseLock();
  }
}

function handleAdminUpsertTargets_(payload) {
  requireAdminSession_(payload.session_token);
  var documentId = requiredString_(payload.document_id, "문서 ID가 필요합니다.");
  var document = findDocumentById_(documentId);
  var inputTargets = payload.targets;

  if (!document) {
    return {
      ok: false,
      error: "문서를 찾을 수 없습니다."
    };
  }

  if (!Array.isArray(inputTargets)) {
    return {
      ok: false,
      error: "대상자 배열이 필요합니다."
    };
  }

  if (inputTargets.length > 1000) {
    return {
      ok: false,
      error: "한 번에 최대 1000명까지 등록할 수 있습니다."
    };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var existingTargets = getRows_(SHEET_NAMES.TARGETS).filter(function (target) {
      return target.document_id === documentId;
    });
    var existingKeys = {};
    existingTargets.forEach(function (target) {
      existingKeys[targetIdentityKey_(target)] = true;
    });

    var now = now_();
    var rowsToAppend = [];
    var seenInputKeys = {};
    var skipped = 0;
    var invalid = 0;

    inputTargets.forEach(function (target) {
      var schoolName = normalize_(target.school_name || document.school_name);
      var studentNumber = normalize_(target.student_number);
      var name = normalize_(target.name);

      if (!schoolName || !studentNumber || !name) {
        invalid += 1;
        return;
      }

      var key = [schoolName, studentNumber, name].join("\u001f");
      if (existingKeys[key] || seenInputKeys[key]) {
        skipped += 1;
        return;
      }

      seenInputKeys[key] = true;
      rowsToAppend.push({
        target_id: makeId_("tgt"),
        document_id: documentId,
        school_name: schoolName,
        student_number: studentNumber,
        name: name,
        status: "pending",
        signed_at: "",
        signature_data: "",
        user_agent: "",
        created_at: now,
        updated_at: now
      });
    });

    appendRows_(SHEET_NAMES.TARGETS, rowsToAppend);
    appendAudit_(
      "admin",
      "targets_upserted",
      documentId,
      "",
      { inserted: rowsToAppend.length, skipped: skipped, invalid: invalid },
      normalize_(payload.user_agent)
    );

    return {
      ok: true,
      inserted: rowsToAppend.length,
      skipped: skipped,
      invalid: invalid,
      total_received: inputTargets.length
    };
  } finally {
    lock.releaseLock();
  }
}

function setAdminPassword_(password) {
  password = String(password || "");
  if (password.length < 10) {
    throw new Error("관리자 비밀번호는 10자 이상으로 설정하세요.");
  }

  var salt = makeToken_(32);
  var hash = sha256Hex_(salt + "\n" + password);
  PropertiesService.getScriptProperties().setProperties({
    ADMIN_PASSWORD_SALT: salt,
    ADMIN_PASSWORD_HASH: hash
  });
}

function requireAdminSession_(sessionToken) {
  sessionToken = normalize_(sessionToken);
  if (!sessionToken) {
    throw new Error("관리자 로그인이 필요합니다.");
  }

  var cached = CacheService.getScriptCache().get("admin_session:" + sessionToken);
  if (!cached) {
    throw new Error("관리자 세션이 만료되었습니다.");
  }

  return JSON.parse(cached);
}

function validateSignatureData_(signatureData) {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signatureData)) {
    throw new Error("PNG data URL 형식만 제출할 수 있습니다.");
  }

  if (signatureData.length < MIN_SIGNATURE_DATA_URL_CHARS) {
    throw new Error("빈 서명은 제출할 수 없습니다.");
  }

  if (signatureData.length > MAX_SIGNATURE_DATA_URL_CHARS) {
    throw new Error("서명 이미지가 너무 큽니다.");
  }

  Utilities.base64Decode(signatureData.split(",")[1]);
}

function targetNotFoundResponse_() {
  return {
    ok: false,
    error: "대상자 정보를 확인할 수 없습니다."
  };
}

function publicDocument_(document) {
  return {
    document_id: document.document_id,
    title: document.title,
    school_name: document.school_name,
    event_date: document.event_date,
    retention_until: document.retention_until
  };
}

function adminDocumentSummary_(document, counts) {
  counts = counts || { total: 0, signed: 0, pending: 0 };
  var total = Number(counts.total || 0);
  var signed = Number(counts.signed || 0);
  var pending =
    counts.pending === undefined ? Math.max(0, total - signed) : Number(counts.pending || 0);

  return {
    document_id: document.document_id,
    public_token: document.public_token,
    title: document.title,
    school_name: document.school_name,
    event_date: document.event_date,
    retention_until: document.retention_until,
    status: document.status,
    created_at: document.created_at,
    total_count: total,
    signed_count: signed,
    pending_count: pending,
    public_url: makePublicUrl_(document.public_token)
  };
}

function findDocumentByPublicToken_(publicToken) {
  publicToken = normalize_(publicToken);
  var rows = getRows_(SHEET_NAMES.DOCUMENTS);
  for (var i = 0; i < rows.length; i += 1) {
    if (rows[i].public_token === publicToken) {
      return rows[i];
    }
  }
  return null;
}

function findDocumentById_(documentId) {
  documentId = normalize_(documentId);
  var rows = getRows_(SHEET_NAMES.DOCUMENTS);
  for (var i = 0; i < rows.length; i += 1) {
    if (rows[i].document_id === documentId) {
      return rows[i];
    }
  }
  return null;
}

function findTargetByIdentity_(documentId, schoolName, studentNumber, name) {
  var key = [normalize_(schoolName), normalize_(studentNumber), normalize_(name)].join("\u001f");
  var rows = getRows_(SHEET_NAMES.TARGETS);

  for (var i = 0; i < rows.length; i += 1) {
    if (rows[i].document_id === documentId && targetIdentityKey_(rows[i]) === key) {
      return rows[i];
    }
  }
  return null;
}

function findTargetById_(documentId, targetId) {
  var rows = getRows_(SHEET_NAMES.TARGETS);
  for (var i = 0; i < rows.length; i += 1) {
    if (rows[i].document_id === documentId && rows[i].target_id === targetId) {
      return rows[i];
    }
  }
  return null;
}

function targetIdentityKey_(target) {
  return [
    normalize_(target.school_name),
    normalize_(target.student_number),
    normalize_(target.name)
  ].join("\u001f");
}

function isSigned_(target) {
  return target.status === "signed" || Boolean(target.signed_at) || Boolean(target.signature_data);
}

function appendAudit_(actorType, action, documentId, targetId, details, userAgent) {
  try {
    appendRow_(
      SHEET_NAMES.AUDIT_LOGS,
      {
        log_id: makeId_("log"),
        actor_type: actorType,
        action: action,
        document_id: documentId || "",
        target_id: targetId || "",
        details_json: JSON.stringify(details || {}),
        user_agent: userAgent || "",
        created_at: now_()
      }
    );
  } catch (error) {
    console.error(error);
  }
}

function parsePayload_(e) {
  var raw = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error("JSON 요청 본문을 해석할 수 없습니다.");
  }
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function getSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty("SPREADSHEET_ID");

  if (spreadsheetId) {
    return SpreadsheetApp.openById(spreadsheetId);
  }

  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error("스프레드시트를 찾을 수 없습니다. SPREADSHEET_ID를 설정하세요.");
  }
  return active;
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
  return sheet;
}

function getSheet_(name) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ensureSheet_(ss, name, HEADERS[name]);
  }
  return sheet;
}

function getRows_(sheetName) {
  var sheet = getSheet_(sheetName);
  var values = sheet.getDataRange().getValues();
  var headers = HEADERS[sheetName];
  var rows = [];

  if (values.length <= 1) {
    return rows;
  }

  for (var r = 1; r < values.length; r += 1) {
    var rowValues = values[r];
    var empty = rowValues.every(function (value) {
      return value === "";
    });
    if (empty) continue;

    var row = { _row: r + 1 };
    headers.forEach(function (header, index) {
      row[header] = rowValues[index] === undefined ? "" : String(rowValues[index]);
    });
    rows.push(row);
  }

  return rows;
}

function appendRow_(sheetName, object) {
  appendRows_(sheetName, [object]);
}

function appendRows_(sheetName, objects) {
  if (!objects || objects.length === 0) {
    return;
  }

  var sheet = getSheet_(sheetName);
  var headers = HEADERS[sheetName];
  var values = objects.map(function (object) {
    return headers.map(function (header) {
      return object[header] === undefined || object[header] === null ? "" : String(object[header]);
    });
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
}

function updateRow_(sheetName, rowNumber, patch) {
  var sheet = getSheet_(sheetName);
  var headers = HEADERS[sheetName];

  Object.keys(patch).forEach(function (key) {
    var columnIndex = headers.indexOf(key) + 1;
    if (columnIndex > 0) {
      sheet.getRange(rowNumber, columnIndex).setValue(String(patch[key]));
    }
  });
}

function stripRowNumber_(row) {
  var copy = {};
  Object.keys(row).forEach(function (key) {
    if (key !== "_row") {
      copy[key] = row[key];
    }
  });
  return copy;
}

function requiredString_(value, message) {
  var normalized = normalize_(value);
  if (!normalized) {
    throw new Error(message);
  }
  return normalized;
}

function normalize_(value) {
  return String(value === undefined || value === null ? "" : value)
    .trim()
    .replace(/\s+/g, " ");
}

function makeId_(prefix) {
  return prefix + "_" + Utilities.getUuid().replace(/-/g, "");
}

function makeToken_(length) {
  var token = "";
  while (token.length < length) {
    token += Utilities.getUuid().replace(/-/g, "");
  }
  return token.slice(0, length);
}

function sha256Hex_(value) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    value,
    Utilities.Charset.UTF_8
  );
  return digest
    .map(function (byte) {
      var value = byte < 0 ? byte + 256 : byte;
      return ("0" + value.toString(16)).slice(-2);
    })
    .join("");
}

function safeEquals_(a, b) {
  a = String(a || "");
  b = String(b || "");
  var diff = a.length ^ b.length;
  var maxLength = Math.max(a.length, b.length);

  for (var i = 0; i < maxLength; i += 1) {
    diff |= a.charCodeAt(i % a.length) ^ b.charCodeAt(i % b.length);
  }

  return diff === 0;
}

function makePublicUrl_(publicToken) {
  var baseUrl = normalize_(PropertiesService.getScriptProperties().getProperty("FRONTEND_BASE_URL"));
  if (!baseUrl) {
    return "";
  }
  if (baseUrl.slice(-1) !== "/") {
    baseUrl += "/";
  }
  return baseUrl + "#/sign?doc=" + encodeURIComponent(publicToken);
}

function now_() {
  return new Date().toISOString();
}
