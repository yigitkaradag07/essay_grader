import type { GradingResponse, Rubric } from "@/lib/schema";
import type { RubricSummary, StoredRubric } from "@/lib/store";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiRequestError(
      "Sunucuya ulaşılamadı. Geliştirme sunucusu çalışıyor mu?",
      0,
      "network_error",
    );
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // JSON olmayan yanıt (ör. HTML hata sayfası)
  }

  if (!res.ok) {
    const err = body as { error?: string; code?: string; message?: string } | null;
    throw new ApiRequestError(
      err?.error || err?.message || `İstek başarısız oldu (${res.status}).`,
      res.status,
      err?.code,
    );
  }
  return body as T;
}

const json = (data: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(data),
});

/* --------------------------------- Metin --------------------------------- */

export type ExtractResponse = {
  text: string;
  format: "txt" | "md" | "docx" | "pdf" | "image";
  pages: number | null;
  chars: number;
  words: number;
  filename: string;
  warnings: string[];
};

export function extractFile(
  file: File,
  kind: "essay" | "rubric",
  signal?: AbortSignal,
): Promise<ExtractResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  return request<ExtractResponse>("/api/extract", { method: "POST", body: form, signal });
}

/* -------------------------------- Rubric --------------------------------- */

export function parseRubric(
  text: string,
  totalPoints?: number,
): Promise<{ rubric: Rubric; warnings: string[] }> {
  return request("/api/rubric/parse", json({ text, totalPoints }));
}

export function defaultRubric(): Promise<{ rubric: Rubric; warnings: string[] }> {
  return request("/api/rubric/parse");
}

export function listRubrics(): Promise<{
  activeId: string | null;
  rubrics: RubricSummary[];
}> {
  return request("/api/rubrics", { cache: "no-store" });
}

export function getRubric(id: string): Promise<StoredRubric & { isActive: boolean }> {
  return request(`/api/rubrics/${id}`, { cache: "no-store" });
}

export function saveRubric(
  rubric: Rubric,
  activate = true,
): Promise<StoredRubric & { isActive: boolean; warnings: string[] }> {
  return request("/api/rubrics", json({ rubric, activate }));
}

export function updateRubric(
  id: string,
  changes: { rubric?: Rubric; activate?: boolean },
): Promise<StoredRubric & { isActive: boolean; warnings: string[] }> {
  return request(`/api/rubrics/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(changes),
  });
}

export function deleteRubric(id: string): Promise<{ deleted: string; activeId: string | null }> {
  return request(`/api/rubrics/${id}`, { method: "DELETE" });
}

/* ------------------------------ Notlandırma ------------------------------ */

export type GradeResponse = GradingResponse & {
  rubricId: string | null;
  rubricTitle: string;
};

export function gradeEssay(
  input: {
    essay: string;
    essayTitle?: string;
    studentName?: string;
    rubricId?: string;
    language?: string;
    strictness?: "lenient" | "balanced" | "strict";
  },
  signal?: AbortSignal,
): Promise<GradeResponse> {
  return request("/api/grade", { ...json(input), signal });
}

export function health(): Promise<{ ok: boolean; model: string; message?: string }> {
  return request("/api/health", { cache: "no-store" });
}
