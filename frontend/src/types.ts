export interface ApiEnvelope {
  ok: boolean;
  error?: string;
}

export interface PublicDocument {
  document_id?: string;
  title: string;
  school_name: string;
  event_date: string;
  retention_until?: string;
}

export interface VerifyTargetResponse extends ApiEnvelope {
  already_signed?: boolean;
  document?: PublicDocument;
  target_token?: string;
}

export interface SubmitSignatureResponse extends ApiEnvelope {
  already_signed?: boolean;
  signed_at?: string;
}

export interface AdminLoginResponse extends ApiEnvelope {
  session_token?: string;
  expires_in?: number;
}

export interface AdminDocumentSummary {
  document_id: string;
  public_token: string;
  title: string;
  school_name: string;
  event_date: string;
  retention_until: string;
  status: string;
  created_at: string;
  total_count: number;
  signed_count: number;
  pending_count: number;
  public_url?: string;
}

export interface AdminTarget {
  target_id: string;
  document_id: string;
  school_name: string;
  student_number: string;
  name: string;
  status: string;
  signed_at: string;
  signature_data: string;
  user_agent: string;
  created_at: string;
  updated_at: string;
}

export interface AdminDocumentDetail extends ApiEnvelope {
  document?: AdminDocumentSummary;
  targets?: AdminTarget[];
  counts?: {
    total: number;
    signed: number;
    pending: number;
  };
}

export interface AdminListDocumentsResponse extends ApiEnvelope {
  documents?: AdminDocumentSummary[];
}

export interface AdminCreateDocumentResponse extends ApiEnvelope {
  document_id?: string;
  public_token?: string;
  public_url?: string;
}

export interface AdminUpsertTargetsResponse extends ApiEnvelope {
  inserted?: number;
  skipped?: number;
  invalid?: number;
  total_received?: number;
}

export interface TargetInput {
  school_name: string;
  student_number: string;
  name: string;
}
