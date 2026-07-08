import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Clipboard,
  FilePlus2,
  LogOut,
  Printer,
  RefreshCw,
  Save,
  Search,
  Upload
} from "lucide-react";
import { api, getApiUrl } from "../api";
import type { AdminDocumentSummary, AdminTarget } from "../types";
import {
  composePublicUrl,
  formatDate,
  formatDateTime,
  isSignedTarget,
  parseTargetText,
  splitForPrint
} from "../utils";

const SESSION_STORAGE_KEY = "signature_app_admin_session";

export function AdminPage() {
  const [sessionToken, setSessionToken] = useState(
    () => localStorage.getItem(SESSION_STORAGE_KEY) || ""
  );
  const [password, setPassword] = useState("");
  const [documents, setDocuments] = useState<AdminDocumentSummary[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [selectedDocument, setSelectedDocument] =
    useState<AdminDocumentSummary | null>(null);
  const [targets, setTargets] = useState<AdminTarget[]>([]);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"error" | "success">("error");
  const [busy, setBusy] = useState(false);
  const [printedAt, setPrintedAt] = useState(() => new Date().toISOString());

  function clearMessage() {
    setMessage("");
  }

  function showError(messageText: string) {
    setMessageKind("error");
    setMessage(messageText);
  }

  function showSuccess(messageText: string) {
    setMessageKind("success");
    setMessage(messageText);
  }

  async function loadDocuments(token = sessionToken) {
    if (!token) return;
    setBusy(true);
    clearMessage();

    try {
      const result = await api.adminListDocuments(token);
      if (!result.ok) {
        showError(result.error || "문서 목록을 불러올 수 없습니다.");
        return;
      }
      const list = result.documents || [];
      setDocuments(list);
      if (!selectedDocumentId && list[0]) {
        setSelectedDocumentId(list[0].document_id);
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : "요청 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function loadDocument(documentId: string) {
    if (!sessionToken || !documentId) return;
    setBusy(true);
    clearMessage();

    try {
      const result = await api.adminGetDocument(sessionToken, documentId);
      if (!result.ok || !result.document) {
        showError(result.error || "문서를 불러올 수 없습니다.");
        return;
      }
      setSelectedDocument(result.document);
      setTargets(result.targets || []);
    } catch (error) {
      showError(error instanceof Error ? error.message : "요청 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (sessionToken) {
      void loadDocuments(sessionToken);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (selectedDocumentId) {
      void loadDocument(selectedDocumentId);
    }
  }, [selectedDocumentId, sessionToken]);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    clearMessage();

    try {
      const result = await api.adminLogin(password);
      if (!result.ok || !result.session_token) {
        showError(result.error || "관리자 인증에 실패했습니다.");
        return;
      }
      localStorage.setItem(SESSION_STORAGE_KEY, result.session_token);
      setSessionToken(result.session_token);
      setPassword("");
    } catch (error) {
      showError(error instanceof Error ? error.message : "요청 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setSessionToken("");
    setDocuments([]);
    setSelectedDocumentId("");
    setSelectedDocument(null);
    setTargets([]);
  }

  function handlePrint() {
    setPrintedAt(new Date().toISOString());
    window.setTimeout(() => window.print(), 50);
  }

  const signedCount = targets.filter(isSignedTarget).length;
  const pendingCount = Math.max(0, targets.length - signedCount);
  const missingApiUrl = !getApiUrl();

  if (!sessionToken) {
    return (
      <main className="admin-login-shell">
        <section className="sign-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">관리자</p>
              <h1>로그인</h1>
            </div>
            <Search size={28} aria-hidden="true" />
          </div>
          {missingApiUrl && (
            <div className="notice error">
              Apps Script Web App URL 설정이 필요합니다.
            </div>
          )}
          <form className="stack" onSubmit={handleLogin}>
            <label>
              <span>관리자 비밀번호</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {message && <div className="notice error">{message}</div>}
            <button className="button primary wide" type="submit" disabled={busy || missingApiUrl}>
              로그인
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar no-print">
        <div className="sidebar-title">
          <div>
            <p className="eyebrow">관리자</p>
            <h1>서명 문서</h1>
          </div>
          <button className="icon-button" type="button" onClick={handleLogout} title="로그아웃">
            <LogOut size={18} aria-hidden="true" />
          </button>
        </div>

        <CreateDocumentForm
          sessionToken={sessionToken}
          onCreated={async (documentId) => {
            await loadDocuments();
            setSelectedDocumentId(documentId);
          }}
          setMessage={showError}
        />

        <div className="sidebar-actions">
          <button className="button secondary" type="button" onClick={() => loadDocuments()} disabled={busy}>
            <RefreshCw size={17} aria-hidden="true" />
            새로고침
          </button>
        </div>

        <div className="document-list">
          {documents.map((document) => (
            <button
              key={document.document_id}
              className={document.document_id === selectedDocumentId ? "selected" : ""}
              type="button"
              onClick={() => setSelectedDocumentId(document.document_id)}
            >
              <strong>{document.title}</strong>
              <span>
                {document.signed_count}/{document.total_count} · {formatDate(document.event_date)}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="admin-content">
        {message && <div className={`notice ${messageKind} no-print`}>{message}</div>}

        {selectedDocument ? (
          <>
            <DocumentToolbar
              document={selectedDocument}
              signedCount={signedCount}
              pendingCount={pendingCount}
              totalCount={targets.length}
              onPrint={handlePrint}
              onRefresh={() => loadDocument(selectedDocument.document_id)}
            />

            <TargetImport
              sessionToken={sessionToken}
              document={selectedDocument}
              onImported={async (statusMessage) => {
                showSuccess(statusMessage);
                await loadDocuments();
                await loadDocument(selectedDocument.document_id);
              }}
              setMessage={showError}
            />

            <StatusTable targets={targets} />

            <PrintPreview
              document={selectedDocument}
              targets={targets}
              printedAt={printedAt}
            />
          </>
        ) : (
          <section className="empty-state no-print">
            <h2>문서를 선택해 주세요</h2>
          </section>
        )}
      </section>
    </main>
  );
}

function CreateDocumentForm({
  sessionToken,
  onCreated,
  setMessage
}: {
  sessionToken: string;
  onCreated: (documentId: string) => void | Promise<void>;
  setMessage: (message: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [retentionUntil, setRetentionUntil] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const result = await api.adminCreateDocument(sessionToken, {
        title,
        school_name: schoolName,
        event_date: eventDate,
        retention_until: retentionUntil
      });

      if (!result.ok || !result.document_id) {
        setMessage(result.error || "문서를 만들 수 없습니다.");
        return;
      }

      setTitle("");
      setSchoolName("");
      setEventDate("");
      setRetentionUntil("");
      await onCreated(result.document_id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "요청 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="create-form" onSubmit={handleCreate}>
      <div className="form-title">
        <FilePlus2 size={17} aria-hidden="true" />
        <span>새 문서</span>
      </div>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="문서명"
        required
      />
      <input
        value={schoolName}
        onChange={(event) => setSchoolName(event.target.value)}
        placeholder="학교명"
        required
      />
      <input
        type="date"
        value={eventDate}
        onChange={(event) => setEventDate(event.target.value)}
        required
      />
      <input
        type="date"
        value={retentionUntil}
        onChange={(event) => setRetentionUntil(event.target.value)}
        required
      />
      <button className="button primary wide" type="submit" disabled={busy}>
        <Save size={17} aria-hidden="true" />
        저장
      </button>
    </form>
  );
}

function DocumentToolbar({
  document,
  signedCount,
  pendingCount,
  totalCount,
  onPrint,
  onRefresh
}: {
  document: AdminDocumentSummary;
  signedCount: number;
  pendingCount: number;
  totalCount: number;
  onPrint: () => void;
  onRefresh: () => void;
}) {
  const publicUrl = document.public_url || composePublicUrl(document.public_token);
  const [copied, setCopied] = useState(false);

  async function copyUrl() {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <section className="document-toolbar no-print">
      <div>
        <p className="eyebrow">{document.school_name}</p>
        <h2>{document.title}</h2>
        <p className="muted">
          {formatDate(document.event_date)} · 보관 기한 {formatDate(document.retention_until)}
        </p>
      </div>

      <div className="count-grid">
        <div>
          <span>전체</span>
          <strong>{totalCount}</strong>
        </div>
        <div>
          <span>제출</span>
          <strong>{signedCount}</strong>
        </div>
        <div>
          <span>대기</span>
          <strong>{pendingCount}</strong>
        </div>
      </div>

      <div className="public-link-row">
        <input value={publicUrl} readOnly aria-label="공개 링크" />
        <button className="button secondary" type="button" onClick={copyUrl}>
          <Clipboard size={17} aria-hidden="true" />
          {copied ? "복사됨" : "복사"}
        </button>
      </div>

      <div className="toolbar-actions">
        <button className="button secondary" type="button" onClick={onRefresh}>
          <RefreshCw size={17} aria-hidden="true" />
          새로고침
        </button>
        <button className="button primary" type="button" onClick={onPrint}>
          <Printer size={17} aria-hidden="true" />
          출력/PDF
        </button>
      </div>
    </section>
  );
}

function TargetImport({
  sessionToken,
  document,
  onImported,
  setMessage
}: {
  sessionToken: string;
  document: AdminDocumentSummary;
  onImported: (statusMessage: string) => void | Promise<void>;
  setMessage: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleImport(event: FormEvent) {
    event.preventDefault();
    const parsed = parseTargetText(text, document.school_name);

    if (parsed.targets.length === 0) {
      setMessage("등록할 대상자가 없습니다.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const result = await api.adminUpsertTargets(
        sessionToken,
        document.document_id,
        parsed.targets
      );

      if (!result.ok) {
        setMessage(result.error || "대상자를 등록할 수 없습니다.");
        return;
      }

      setText("");
      await onImported(
        `등록 ${result.inserted || 0}명, 중복 ${result.skipped || 0}명, 제외 ${
          (result.invalid || 0) + parsed.invalid
        }명`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "요청 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="target-import no-print" onSubmit={handleImport}>
      <div className="form-title">
        <Upload size={17} aria-hidden="true" />
        <span>대상자 등록</span>
      </div>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={"학교명,학번,이름\n학번,이름"}
        rows={5}
      />
      <button className="button primary" type="submit" disabled={busy}>
        <Upload size={17} aria-hidden="true" />
        등록
      </button>
    </form>
  );
}

function StatusTable({ targets }: { targets: AdminTarget[] }) {
  return (
    <section className="status-section no-print">
      <div className="section-heading">
        <h2>서명 현황</h2>
      </div>
      <div className="table-scroll">
        <table className="status-table">
          <thead>
            <tr>
              <th>번호</th>
              <th>학교명</th>
              <th>학번</th>
              <th>이름</th>
              <th>상태</th>
              <th>시각</th>
              <th>서명</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((target, index) => (
              <tr key={target.target_id}>
                <td>{index + 1}</td>
                <td>{target.school_name}</td>
                <td>{target.student_number}</td>
                <td>{target.name}</td>
                <td>
                  <span className={isSignedTarget(target) ? "badge success" : "badge pending"}>
                    {isSignedTarget(target) ? "제출" : "대기"}
                  </span>
                </td>
                <td>{formatDateTime(target.signed_at)}</td>
                <td className="signature-thumb">
                  {target.signature_data ? (
                    <img src={target.signature_data} alt={`${target.name} 서명`} />
                  ) : (
                    <span>-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PrintPreview({
  document,
  targets,
  printedAt
}: {
  document: AdminDocumentSummary;
  targets: AdminTarget[];
  printedAt: string;
}) {
  const pages = useMemo(() => splitForPrint(targets), [targets]);

  return (
    <section className="print-area">
      {pages.map((pageTargets, pageIndex) => {
        const left = pageTargets.slice(0, 15);
        const right = pageTargets.slice(15, 30);

        return (
          <article className="print-page" key={pageIndex}>
            <header className="print-header">
              <div>
                <p>{document.school_name}</p>
                <h1>{document.title}</h1>
              </div>
              <dl>
                <div>
                  <dt>행사 일자</dt>
                  <dd>{formatDate(document.event_date)}</dd>
                </div>
                <div>
                  <dt>출력 일시</dt>
                  <dd>{formatDateTime(printedAt)}</dd>
                </div>
              </dl>
            </header>
            <div className="print-columns">
              <PrintColumn targets={left} offset={pageIndex * 30} />
              <PrintColumn targets={right} offset={pageIndex * 30 + 15} />
            </div>
            <footer className="print-footer">
              {pageIndex + 1} / {pages.length || 1}
            </footer>
          </article>
        );
      })}
    </section>
  );
}

function PrintColumn({
  targets,
  offset
}: {
  targets: AdminTarget[];
  offset: number;
}) {
  return (
    <table className="print-table">
      <thead>
        <tr>
          <th>번호</th>
          <th>성명</th>
          <th>서명</th>
          <th>시각</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 15 }).map((_, index) => {
          const target = targets[index];
          return (
            <tr key={target?.target_id || index}>
              <td>{target ? offset + index + 1 : ""}</td>
              <td>{target?.name || ""}</td>
              <td className="print-signature">
                {target?.signature_data ? (
                  <img src={target.signature_data} alt="" />
                ) : (
                  ""
                )}
              </td>
              <td>{target?.signed_at ? formatDateTime(target.signed_at) : ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
