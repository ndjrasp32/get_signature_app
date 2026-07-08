import type {
  AdminCreateDocumentResponse,
  AdminDocumentDetail,
  AdminListDocumentsResponse,
  AdminLoginResponse,
  AdminUpsertTargetsResponse,
  SubmitSignatureResponse,
  TargetInput,
  VerifyTargetResponse
} from "./types";

type ApiPayload = Record<string, unknown>;

export function getApiUrl() {
  return (
    window.SIGNATURE_APP_CONFIG?.apiUrl ||
    import.meta.env.VITE_APPS_SCRIPT_URL ||
    ""
  ).trim();
}

async function postApi<T>(action: string, payload: ApiPayload = {}): Promise<T> {
  const apiUrl = getApiUrl();

  if (!apiUrl) {
    throw new Error("Apps Script Web App URL이 설정되지 않았습니다.");
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action,
      ...payload,
      user_agent: navigator.userAgent
    })
  });

  const text = await response.text();
  let data: unknown;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("API 응답을 해석할 수 없습니다.");
  }

  if (!response.ok) {
    throw new Error("API 요청이 실패했습니다.");
  }

  return data as T;
}

export const api = {
  verifyTarget(payload: {
    public_token: string;
    school_name: string;
    student_number: string;
    name: string;
  }) {
    return postApi<VerifyTargetResponse>("verifyTarget", payload);
  },

  submitSignature(payload: {
    public_token: string;
    target_token: string;
    signature_data: string;
  }) {
    return postApi<SubmitSignatureResponse>("submitSignature", payload);
  },

  adminLogin(password: string) {
    return postApi<AdminLoginResponse>("adminLogin", { password });
  },

  adminListDocuments(session_token: string) {
    return postApi<AdminListDocumentsResponse>("adminListDocuments", {
      session_token
    });
  },

  adminGetDocument(session_token: string, document_id: string) {
    return postApi<AdminDocumentDetail>("adminGetDocument", {
      session_token,
      document_id
    });
  },

  adminCreateDocument(
    session_token: string,
    payload: {
      title: string;
      school_name: string;
      event_date: string;
      retention_until: string;
    }
  ) {
    return postApi<AdminCreateDocumentResponse>("adminCreateDocument", {
      session_token,
      ...payload
    });
  },

  adminUpsertTargets(
    session_token: string,
    document_id: string,
    targets: TargetInput[]
  ) {
    return postApi<AdminUpsertTargetsResponse>("adminUpsertTargets", {
      session_token,
      document_id,
      targets
    });
  }
};
