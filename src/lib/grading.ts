import { config } from "@/lib/config";
import { generateJson } from "@/lib/ai/json";
import {
  CRITERION_SYSTEM,
  SUMMARY_SYSTEM,
  buildCriterionPrompt,
  buildSummaryPrompt,
} from "@/lib/prompts/grade";
import { buildEssayIndex, findQuote } from "@/lib/quotes";
import {
  criterionGradeSchema,
  summarySchema,
  type CriterionRequest,
  type CriterionResponse,
  type Summary,
  type SummaryRequest,
} from "@/lib/schema";

function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/**
 * Tek bir kriteri puanlar, alıntıları makale içinde doğrular ve puanı rubric
 * üst sınırına kırpar. Toplam puan istemcide kriter puanları toplanarak bulunur.
 */
export async function gradeCriterion(
  req: CriterionRequest,
  signal?: AbortSignal,
): Promise<CriterionResponse> {
  const criterion = req.rubric.criteria.find((c) => c.id === req.criterionId);
  if (!criterion) {
    throw new Error(`Rubric'te "${req.criterionId}" kimlikli kriter yok.`);
  }

  const { data } = await generateJson({
    system: CRITERION_SYSTEM,
    prompt: buildCriterionPrompt({
      rubric: req.rubric,
      criterion,
      essay: req.essay,
      essayTitle: req.essayTitle,
      language: req.language,
      strictness: req.strictness,
    }),
    schema: criterionGradeSchema,
    temperature: 0.2,
    maxOutputTokens: 12_000,
    signal,
  });

  const warnings: string[] = [];

  let score = data.score;
  if (score > criterion.maxScore) {
    warnings.push(
      `"${criterion.name}" için model ${data.score} puan verdi; üst sınır ${criterion.maxScore} olduğu için düşürüldü.`,
    );
    score = criterion.maxScore;
  }
  if (score < 0) score = 0;

  const index = buildEssayIndex(req.essay);
  let quotesVerified = 0;

  const evidence = data.evidence.map((e) => {
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

  const unverified = evidence.length - quotesVerified;
  if (unverified > 0) {
    warnings.push(
      `"${criterion.name}" kriterinde ${unverified} alıntı makale içinde birebir bulunamadı; öğrenciyle paylaşmadan önce kontrol edin.`,
    );
  }

  return {
    id: criterion.id,
    name: criterion.name,
    score: round(score),
    maxScore: criterion.maxScore,
    weight: criterion.weight,
    level: data.level,
    justification: data.justification,
    strengths: data.strengths,
    improvements: data.improvements,
    evidence,
    quotesTotal: evidence.length,
    quotesVerified,
    warnings,
  };
}

/** Kriter sonuçlarını tek bir geri bildirime dönüştürür. */
export async function summarize(
  req: SummaryRequest,
  signal?: AbortSignal,
): Promise<Summary & { model: string }> {
  const totalScore = round(req.results.reduce((sum, r) => sum + r.score, 0));

  const { data } = await generateJson({
    system: SUMMARY_SYSTEM,
    prompt: buildSummaryPrompt({
      rubric: req.rubric,
      results: req.results,
      totalScore,
      language: req.language,
      essayTitle: req.essayTitle,
    }),
    schema: summarySchema,
    temperature: 0.3,
    maxOutputTokens: 12_000,
    signal,
  });

  return { ...data, model: config.model };
}
