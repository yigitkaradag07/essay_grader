import { config } from "@/lib/config";
import { generateJson } from "@/lib/ai/json";
import { GRADE_SYSTEM, buildGradePrompt } from "@/lib/prompts/grade";
import { buildEssayIndex, findQuote } from "@/lib/quotes";
import {
  gradingResultSchema,
  type CriterionResult,
  type GradingResponse,
  type ResolvedGradeRequest,
} from "@/lib/schema";

function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Modelin döndürdüğü puanları rubric ile uzlaştırır.
 * Model puanı taşırırsa veya kriter atlarsa sessizce kabul etmek yerine
 * düzeltir ve uyarı üretir; nihai toplam her zaman sunucuda hesaplanır.
 */
export async function gradeEssay(
  req: ResolvedGradeRequest,
  signal?: AbortSignal,
): Promise<GradingResponse> {
  const { data } = await generateJson({
    system: GRADE_SYSTEM,
    prompt: buildGradePrompt(req),
    schema: gradingResultSchema,
    temperature: 0.2,
    maxOutputTokens: 24_000,
    signal,
  });

  const warnings: string[] = [];
  const index = buildEssayIndex(req.essay);
  const byId = new Map(req.rubric.criteria.map((c) => [c.id, c]));
  const returned = new Map(data.criteria.map((c) => [c.id, c]));

  for (const c of data.criteria) {
    if (!byId.has(c.id)) {
      warnings.push(`Model rubric'te olmayan bir kriter döndürdü: "${c.name}" (${c.id}). Yok sayıldı.`);
    }
  }

  let quotesTotal = 0;
  let quotesVerified = 0;

  const criteria: CriterionResult[] = req.rubric.criteria.map((rc) => {
    const raw = returned.get(rc.id);

    if (!raw) {
      warnings.push(`Model "${rc.name}" kriterini değerlendirmedi; puan 0 olarak işaretlendi.`);
      return {
        id: rc.id,
        name: rc.name,
        score: 0,
        maxScore: rc.maxScore,
        weight: rc.weight,
        level: null,
        justification: "Model bu kriter için değerlendirme üretmedi. Lütfen tekrar deneyin.",
        strengths: [],
        improvements: [],
        evidence: [],
      };
    }

    let score = raw.score;
    if (score > rc.maxScore) {
      warnings.push(
        `"${rc.name}" için model ${raw.score} puan verdi; üst sınır ${rc.maxScore} olduğu için düşürüldü.`,
      );
      score = rc.maxScore;
    }
    if (score < 0) score = 0;

    const evidence = raw.evidence.map((e) => {
      quotesTotal++;
      const match = findQuote(index, e.quote);
      if (match.verified) quotesVerified++;
      return {
        ...e,
        // Doğrulandıysa alıntıyı makaledeki orijinal yazımıyla değiştir.
        quote: match.verified && match.matchedText ? match.matchedText : e.quote,
        verified: match.verified,
        startIndex: match.startIndex,
        endIndex: match.endIndex,
      };
    });

    const unverified = evidence.filter((e) => !e.verified).length;
    if (unverified > 0) {
      warnings.push(
        `"${rc.name}" kriterinde ${unverified} alıntı makale içinde birebir bulunamadı; öğrenciyle paylaşmadan önce kontrol edin.`,
      );
    }

    return {
      id: rc.id,
      name: rc.name,
      score: round(score),
      maxScore: rc.maxScore,
      weight: rc.weight,
      level: raw.level,
      justification: raw.justification,
      strengths: raw.strengths,
      improvements: raw.improvements,
      evidence,
    };
  });

  const total = round(criteria.reduce((sum, c) => sum + c.score, 0));
  const maxScore = req.rubric.totalPoints;
  const percentage = round((total / maxScore) * 100);

  if (Math.abs(total - data.overall.score) > 0.5) {
    warnings.push(
      `Modelin bildirdiği toplam (${data.overall.score}) kriter puanlarının toplamıyla (${total}) uyuşmuyordu; sunucudaki toplam kullanıldı.`,
    );
  }

  return {
    overall: {
      score: total,
      maxScore,
      percentage,
      letterGrade: data.overall.letterGrade,
      verdict: data.overall.verdict,
    },
    criteria,
    studentSummary: data.studentSummary,
    teacherNotes: data.teacherNotes,
    nextSteps: data.nextSteps,
    meta: {
      model: config.model,
      gradedAt: new Date().toISOString(),
      essayChars: req.essay.length,
      essayWords: countWords(req.essay),
      quotesTotal,
      quotesVerified,
      warnings,
    },
  };
}
