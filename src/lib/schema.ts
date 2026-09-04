import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Rubric                                                              */
/* ------------------------------------------------------------------ */

export const rubricLevelSchema = z.object({
  label: z.string().min(1),
  /** Bu seviyeyi hak eden çalışmanın tanımı. */
  descriptor: z.string().default(""),
  minScore: z.number().min(0),
  maxScore: z.number().min(0),
});

export const rubricCriterionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  /** Kriterin toplam nottaki ağırlığı (0-1 arası). */
  weight: z.number().min(0).max(1),
  /** Bu kriterden alınabilecek en yüksek ham puan. */
  maxScore: z.number().positive(),
  levels: z.array(rubricLevelSchema).default([]),
});

export const rubricSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  /** Makalenin toplam puanı (ör. 100). */
  totalPoints: z.number().positive(),
  criteria: z.array(rubricCriterionSchema).min(1),
  /** Öğretmenin yazdığı orijinal rubric metni; puanlamada bağlam olarak kullanılır. */
  sourceText: z.string().default(""),
  /** Rubric'te açıkça belirtilmemiş ve modelin varsaydığı noktalar. */
  assumptions: z.array(z.string()).default([]),
});

export type RubricLevel = z.infer<typeof rubricLevelSchema>;
export type RubricCriterion = z.infer<typeof rubricCriterionSchema>;
export type Rubric = z.infer<typeof rubricSchema>;

/* ------------------------------------------------------------------ */
/* Notlandırma sonucu                                                  */
/* ------------------------------------------------------------------ */

export const evidenceSchema = z.object({
  /** Makaleden birebir alıntı. */
  quote: z.string().min(1),
  /** Alıntının bu kriter açısından ne gösterdiği. */
  comment: z.string().default(""),
  type: z.enum(["strength", "weakness", "neutral"]).default("neutral"),
  /** Sunucu tarafında doğrulanır: alıntı gerçekten makalede geçiyor mu? */
  verified: z.boolean().default(false),
  startIndex: z.number().nullable().default(null),
  endIndex: z.number().nullable().default(null),
});

export const criterionResultSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  score: z.number().min(0),
  maxScore: z.number().positive(),
  weight: z.number().min(0).max(1).default(0),
  /** Rubric seviyelerinden eşleşen seviyenin adı (varsa). */
  level: z.string().nullable().default(null),
  /** Puanın gerekçesi. */
  justification: z.string().min(1),
  strengths: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
  evidence: z.array(evidenceSchema).default([]),
});

/** Modelin tek bir kriter için döndürdüğü ham yanıt. */
export const criterionGradeSchema = z.object({
  score: z.number().min(0),
  level: z.string().nullable().default(null),
  justification: z.string().min(1),
  strengths: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
  evidence: z
    .array(
      z.object({
        quote: z.string().min(1),
        comment: z.string().default(""),
        type: z.enum(["strength", "weakness", "neutral"]).default("neutral"),
      }),
    )
    .default([]),
});

/** Modelin genel özet adımında döndürdüğü ham yanıt. */
export const summarySchema = z.object({
  verdict: z.string().default(""),
  letterGrade: z.string().nullable().default(null),
  studentSummary: z.string().min(1),
  teacherNotes: z.string().default(""),
  nextSteps: z.array(z.string()).default([]),
});

export type Summary = z.infer<typeof summarySchema>;

export type Evidence = z.infer<typeof evidenceSchema>;
export type CriterionResult = z.infer<typeof criterionResultSchema>;

/** Tek kriter uç noktasının yanıtı. */
export type CriterionResponse = CriterionResult & {
  quotesTotal: number;
  quotesVerified: number;
  warnings: string[];
};

/** İstemcinin kriter yanıtlarını ve özeti birleştirerek oluşturduğu tam sonuç. */
export type GradingResponse = {
  overall: {
    score: number;
    maxScore: number;
    percentage: number;
    letterGrade: string | null;
    verdict: string;
  };
  criteria: CriterionResult[];
  studentSummary: string;
  teacherNotes: string;
  nextSteps: string[];
  rubricTitle: string;
  meta: {
    model: string;
    gradedAt: string;
    essayChars: number;
    essayWords: number;
    /** Model kaç alıntı üretti / kaçı makalede doğrulandı. */
    quotesTotal: number;
    quotesVerified: number;
    warnings: string[];
  };
};

/* ------------------------------------------------------------------ */
/* API istek gövdeleri                                                 */
/* ------------------------------------------------------------------ */

export const parseRubricRequestSchema = z.object({
  text: z.string().min(10, "Rubric metni çok kısa."),
  totalPoints: z.number().positive().optional(),
  language: z.string().optional(),
});

/**
 * Notlandırma kriter kriter yapılır: tek uzun model çağrısı sunucusuz ortamlarda
 * süre sınırını aşıyordu. Her istek yalnızca bir kriteri değerlendirir.
 */
export const criterionRequestSchema = z.object({
  rubric: rubricSchema,
  /** Rubric içindeki kriterin kimliği. */
  criterionId: z.string().min(1),
  essay: z.string().min(50, "Makale metni çok kısa."),
  essayTitle: z.string().optional(),
  /** Geri bildirim dili: "tr", "en" vb. */
  language: z.string().default("tr"),
  /** Katı / normal / destekleyici puanlama tonu. */
  strictness: z.enum(["lenient", "balanced", "strict"]).default("balanced"),
});

export type CriterionRequest = z.infer<typeof criterionRequestSchema>;

export const summaryRequestSchema = z.object({
  rubric: rubricSchema,
  results: z.array(criterionResultSchema).min(1),
  essayTitle: z.string().optional(),
  language: z.string().default("tr"),
});

export type SummaryRequest = z.infer<typeof summaryRequestSchema>;
