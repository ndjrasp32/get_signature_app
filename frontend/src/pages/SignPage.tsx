import { FormEvent, useRef, useState } from "react";
import { Check, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { api, getApiUrl } from "../api";
import { ConfirmModal } from "../components/ConfirmModal";
import { SignaturePad, SignaturePadHandle } from "../components/SignaturePad";
import type { PublicDocument } from "../types";
import { formatDate } from "../utils";

interface SignPageProps {
  publicToken: string;
}

type Phase = "input" | "ready" | "done";

export function SignPage({ publicToken }: SignPageProps) {
  const signaturePadRef = useRef<SignaturePadHandle | null>(null);
  const [phase, setPhase] = useState<Phase>("input");
  const [schoolName, setSchoolName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [name, setName] = useState("");
  const [document, setDocument] = useState<PublicDocument | null>(null);
  const [targetToken, setTargetToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [alreadySigned, setAlreadySigned] = useState(false);

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    if (!publicToken) {
      setMessage("서명 문서 링크가 올바르지 않습니다.");
      return;
    }

    setBusy(true);
    try {
      const result = await api.verifyTarget({
        public_token: publicToken,
        school_name: schoolName,
        student_number: studentNumber,
        name
      });

      if (!result.ok) {
        setMessage(result.error || "대상자 정보를 확인할 수 없습니다.");
        return;
      }

      if (result.document) {
        setDocument(result.document);
      }

      if (result.already_signed) {
        setAlreadySigned(true);
        setPhase("done");
        return;
      }

      if (!result.target_token) {
        setMessage("서명 세션을 만들 수 없습니다.");
        return;
      }

      setTargetToken(result.target_token);
      setPhase("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "요청 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    setMessage("");
    setShowConfirm(false);

    if (!signaturePadRef.current?.hasInk()) {
      setMessage("서명을 입력해 주세요.");
      return;
    }

    const signatureData = signaturePadRef.current.toDataUrl();
    setBusy(true);

    try {
      const result = await api.submitSignature({
        public_token: publicToken,
        target_token: targetToken,
        signature_data: signatureData
      });

      if (!result.ok) {
        if (result.already_signed) {
          setAlreadySigned(true);
          setPhase("done");
          return;
        }
        setMessage(result.error || "서명을 제출할 수 없습니다.");
        return;
      }

      setAlreadySigned(false);
      setPhase("done");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "요청 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const missingApiUrl = !getApiUrl();

  return (
    <main className="sign-shell">
      <section className="sign-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">전자서명</p>
            <h1>{phase === "ready" ? "서명 입력" : "대상자 확인"}</h1>
          </div>
          <ShieldCheck size={28} aria-hidden="true" />
        </div>

        {missingApiUrl && (
          <div className="notice error">
            Apps Script Web App URL 설정이 필요합니다.
          </div>
        )}

        {phase === "input" && (
          <form className="stack" onSubmit={handleVerify}>
            <label>
              <span>학교명</span>
              <input
                value={schoolName}
                onChange={(event) => setSchoolName(event.target.value)}
                autoComplete="organization"
                required
              />
            </label>
            <label>
              <span>학번</span>
              <input
                value={studentNumber}
                onChange={(event) => setStudentNumber(event.target.value)}
                autoComplete="off"
                inputMode="text"
                required
              />
            </label>
            <label>
              <span>이름</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
              />
            </label>
            {message && <div className="notice error">{message}</div>}
            <button className="button primary wide" type="submit" disabled={busy || missingApiUrl}>
              <Check size={18} aria-hidden="true" />
              확인
            </button>
          </form>
        )}

        {phase === "ready" && document && (
          <div className="stack">
            <div className="document-summary">
              <div>
                <span>문서명</span>
                <strong>{document.title}</strong>
              </div>
              <div>
                <span>행사 일자</span>
                <strong>{formatDate(document.event_date)}</strong>
              </div>
              <div>
                <span>서명자</span>
                <strong>{name}</strong>
              </div>
            </div>
            <SignaturePad ref={signaturePadRef} />
            {message && <div className="notice error">{message}</div>}
            <div className="action-row">
              <button
                className="button secondary"
                type="button"
                onClick={() => signaturePadRef.current?.clear()}
                disabled={busy}
              >
                <RotateCcw size={18} aria-hidden="true" />
                지우기
              </button>
              <button
                className="button primary"
                type="button"
                onClick={() => setShowConfirm(true)}
                disabled={busy}
              >
                <Send size={18} aria-hidden="true" />
                제출
              </button>
            </div>
          </div>
        )}

        {phase === "done" && (
          <div className="complete-state">
            <ShieldCheck size={38} aria-hidden="true" />
            <h2>{alreadySigned ? "이미 제출된 서명입니다" : "서명이 제출되었습니다"}</h2>
            {document && (
              <p>
                {document.title} · {formatDate(document.event_date)}
              </p>
            )}
          </div>
        )}
      </section>

      {showConfirm && (
        <ConfirmModal
          title="서명을 제출할까요?"
          message="제출 후에는 같은 대상자로 다시 제출할 수 없습니다."
          confirmLabel="제출"
          cancelLabel="취소"
          busy={busy}
          onConfirm={handleSubmit}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </main>
  );
}
