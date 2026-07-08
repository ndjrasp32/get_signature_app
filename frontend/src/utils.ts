import type { AdminTarget, TargetInput } from "./types";

export function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function composePublicUrl(publicToken: string) {
  const configuredBase =
    window.SIGNATURE_APP_CONFIG?.appBaseUrl ||
    import.meta.env.VITE_PUBLIC_APP_BASE_URL ||
    `${window.location.origin}${window.location.pathname}`;
  const base = configuredBase.endsWith("/")
    ? configuredBase
    : `${configuredBase}/`;

  return `${base}#/sign?doc=${encodeURIComponent(publicToken)}`;
}

export function parseTargetText(text: string, defaultSchoolName: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const targets: TargetInput[] = [];
  let invalid = 0;

  for (const [index, line] of lines.entries()) {
    const cleaned = line.replace(/^\uFEFF/, "");
    const parts = cleaned
      .split(/\t|,/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (
      index === 0 &&
      parts.some((part) => /학교|school|학번|student|이름|name/i.test(part))
    ) {
      continue;
    }

    let schoolName = defaultSchoolName;
    let studentNumber = "";
    let name = "";

    if (parts.length >= 3) {
      [schoolName, studentNumber, name] = parts;
    } else if (parts.length === 2) {
      [studentNumber, name] = parts;
    }

    if (!schoolName || !studentNumber || !name) {
      invalid += 1;
      continue;
    }

    targets.push({
      school_name: schoolName,
      student_number: studentNumber,
      name
    });
  }

  return { targets, invalid };
}

export function splitForPrint(targets: AdminTarget[]) {
  const pages: AdminTarget[][] = [];
  for (let i = 0; i < targets.length; i += 30) {
    pages.push(targets.slice(i, i + 30));
  }
  return pages;
}

export function isSignedTarget(target: AdminTarget) {
  return target.status === "signed" || Boolean(target.signed_at);
}
