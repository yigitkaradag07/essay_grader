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

export const gradingResultSchema = z.object({
  overall: z.object({
    score: z.number().min(0),
    maxScore: z.number().positive(),
    percentage: z.number().min(0).max(100),
    letterGrade: z.string().nullable().default(null),
    /** Bir cümlelik genel değerlendirme. */
    verdict: z.string().default(""),
  }),
  criteria: z.array(criterionResultSchema).min(1),
  /** Öğretmenin öğrenciyle paylaşabileceği kısa özet. */
  studentSummary: z.string().min(1),
  /** Sadece öğretmene özel notlar. */
  teacherNotes: z.string().default(""),
  nextSteps: z.array(z.string()).default([]),
});

export type Evidence = z.infer<typeof evidenceSchema>;
export type CriterionResult = z.infer<typeof criterionResultSchema>;
export type GradingResult = z.infer<typeof gradingResultSchema>;

export type GradingResponse = GradingResult & {
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

export const gradeRequestSchema = z.object({
  /** Rubric doğrudan gönderilebilir; gönderilmezse rubricId veya aktif rubric kullanılır. */
  rubric: rubricSchema.optional(),
  /** Kaydedilmiş bir rubric'in kimliği. */
  rubricId: z.string().optional(),
  essay: z.string().min(50, "Makale metni çok kısa."),
  essayTitle: z.string().optional(),
  studentName: z.string().optional(),
  /** Geri bildirim dili: "tr", "en" vb. */
  language: z.string().default("tr"),
  /** Katı / normal / destekleyici puanlama tonu. */
  strictness: z.enum(["lenient", "balanced", "strict"]).default("balanced"),
});

export type GradeRequest = z.infer<typeof gradeRequestSchema>;

/** Rubric'i çözümlenmiş hale gelen istek: notlandırma katmanının beklediği biçim. */
export type ResolvedGradeRequest = Omit<GradeRequest, "rubric" | "rubricId"> & {
  rubric: Rubric;
};
