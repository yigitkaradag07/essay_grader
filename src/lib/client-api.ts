import type {
  CriterionResponse,
  CriterionResult,
  GradingResponse,
  Rubric,
  Summary,
} from "@/lib/schema";

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

/* ------------------------------ Notlandırma ------------------------------ */

export type GradeResponse = GradingResponse;

export type GradeInput = {
  rubric: Rubric;
  essay: string;
  essayTitle?: string;
  language: string;
  strictness: "lenient" | "balanced" | "strict";
};

/** Notlandırma ilerlemesi: arayüz hangi kriterin bittiğini gösterir. */
export type GradeProgress = {
  done: number;
  total: number;
  /** Şu an tamamlanan adımın adı. */
  label: string;
};

function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/**
 * Her kriter ayrı bir istekte puanlanır.
 *
 * Neden bölündü: tek bir çağrıda tüm rubric'i değerlendirmek 80 saniyenin üzerine
 * çıkıyordu ve sunucusuz platformların istek başına süre sınırını aşıyordu. Bölünce
 * her istek 60 sn'nin çok altında kalıyor, öğretmen de ilerlemeyi görebiliyor.
 *
 * Kriterler paralel çalışır: üçerli çalıştırmak toplam süreyi neredeyse iki katına
 * çıkarıyordu. Üst sınır, modelin dakikalık istek kotasını zorlamamak için 6.
 */
const MAX_CONCURRENCY = 6;

export async function gradeEssay(
  input: GradeInput,
  options: { signal?: AbortSignal; onProgress?: (p: GradeProgress) => void } = {},
): Promise<GradeResponse> {
  const { signal, onProgress } = options;
  const criteria = input.rubric.criteria;
  const total = criteria.length + 1; // kriterler + özet
  let done = 0;

  const results = new Array<CriterionResponse>(criteria.length);
  let next = 0;

  async function worker() {
    while (next < criteria.length) {
      const i = next++;
      const criterion = criteria[i];
      results[i] = await request<CriterionResponse>("/api/grade/criterion", {
        ...json({
          rubric: input.rubric,
          criterionId: criterion.id,
          essay: input.essay,
          essayTitle: input.essayTitle,
          language: input.language,
          strictness: input.strictness,
        }),
        signal,
      });
      done++;
      onProgress?.({ done, total, label: criterion.name });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENCY, criteria.length) }, worker),
  );

  // Özet adımına yalnızca değerlendirme gider; alıntı sayaçları ve uyarılar arayüzde kalır.
  const criteriaResults: CriterionResult[] = results.map((r) => ({
    id: r.id,
    name: r.name,
    score: r.score,
    maxScore: r.maxScore,
    weight: r.weight,
    level: r.level,
    justification: r.justification,
    strengths: r.strengths,
    improvements: r.improvements,
    evidence: r.evidence,
  }));

  const summary = await request<Summary & { model: string }>("/api/grade/summary", {
    ...json({
      rubric: input.rubric,
      results: criteriaResults,
      essayTitle: input.essayTitle,
      language: input.language,
    }),
    signal,
  });
  done++;
  onProgress?.({ done, total, label: "Özet" });

  const score = round(results.reduce((sum, r) => sum + r.score, 0));
  const maxScore = input.rubric.totalPoints;

  return {
    overall: {
      score,
      maxScore,
      percentage: round((score / maxScore) * 100),
      letterGrade: summary.letterGrade,
      verdict: summary.verdict,
    },
    criteria: criteriaResults,
    studentSummary: summary.studentSummary,
    teacherNotes: summary.teacherNotes,
    nextSteps: summary.nextSteps,
    rubricTitle: input.rubric.title,
    meta: {
      model: summary.model,
      gradedAt: new Date().toISOString(),
      essayChars: input.essay.length,
      essayWords: input.essay.trim().split(/\s+/).filter(Boolean).length,
      quotesTotal: results.reduce((sum, r) => sum + r.quotesTotal, 0),
      quotesVerified: results.reduce((sum, r) => sum + r.quotesVerified, 0),
      warnings: results.flatMap((r) => r.warnings),
    },
  };
}

export function health(): Promise<{ ok: boolean; model: string; message?: string }> {
  return request("/api/health", { cache: "no-store" });
}
