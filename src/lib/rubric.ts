import { generateJson } from "@/lib/ai/json";
import { RUBRIC_SYSTEM, buildRubricPrompt } from "@/lib/prompts/rubric";
import { rubricSchema, type Rubric } from "@/lib/schema";

function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

const TR_MAP: Record<string, string> = {
  ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u',
  Ç: 'c', Ğ: 'g', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u',
};

function slugify(input: string, fallback: string): string {
  const slug = input
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (ch) => TR_MAP[ch] ?? ch)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

/**
 * Modelin ürettiği rubric'i tutarlı hale getirir: benzersiz id'ler,
 * toplamı 1 olan ağırlıklar ve toplamı totalPoints olan puanlar.
 */
export function normalizeRubric(rubric: Rubric): { rubric: Rubric; warnings: string[] } {
  const warnings: string[] = [];
  const seen = new Set<string>();

  const criteria = rubric.criteria.map((c, i) => {
    let id = slugify(c.id || c.name, `criterion-${i + 1}`);
    if (seen.has(id)) {
      let n = 2;
      while (seen.has(`${id}-${n}`)) n++;
      id = `${id}-${n}`;
    }
    seen.add(id);
    return { ...c, id };
  });

  const weightSum = criteria.reduce((s, c) => s + c.weight, 0);
  let weighted = criteria;
  if (weightSum <= 0) {
    warnings.push("Ağırlıklar okunamadı; kriterler eşit ağırlıklandırıldı.");
    weighted = criteria.map((c) => ({ ...c, weight: round(1 / criteria.length, 4) }));
  } else if (Math.abs(weightSum - 1) > 0.01) {
    warnings.push(
      `Ağırlıkların toplamı ${round(weightSum)} idi; 1.0 olacak şekilde yeniden ölçeklendi.`,
    );
    weighted = criteria.map((c) => ({ ...c, weight: round(c.weight / weightSum, 4) }));
  }

  const scoreSum = weighted.reduce((s, c) => s + c.maxScore, 0);
  let scored = weighted;
  if (scoreSum <= 0) {
    warnings.push("Kriter puanları okunamadı; toplam puan ağırlıklara göre dağıtıldı.");
    scored = weighted.map((c) => ({
      ...c,
      maxScore: round(rubric.totalPoints * c.weight, 1),
    }));
  } else if (Math.abs(scoreSum - rubric.totalPoints) > 0.5) {
    warnings.push(
      `Kriter puanlarının toplamı ${round(scoreSum)} idi; toplam ${rubric.totalPoints} puana göre ölçeklendi.`,
    );
    const factor = rubric.totalPoints / scoreSum;
    scored = weighted.map((c) => ({
      ...c,
      maxScore: round(c.maxScore * factor, 1),
      levels: c.levels.map((l) => ({
        ...l,
        minScore: round(l.minScore * factor, 1),
        maxScore: round(l.maxScore * factor, 1),
      })),
    }));
  }

  // Seviye aralıkları kriterin üst sınırını aşmasın.
  const cleaned = scored.map((c) => ({
    ...c,
    levels: c.levels.map((l) => ({
      ...l,
      minScore: Math.max(0, Math.min(l.minScore, c.maxScore)),
      maxScore: Math.max(0, Math.min(l.maxScore, c.maxScore)),
    })),
  }));

  return { rubric: { ...rubric, criteria: cleaned }, warnings };
}

export async function parseRubricText(args: {
  text: string;
  totalPoints?: number;
  signal?: AbortSignal;
}): Promise<{ rubric: Rubric; warnings: string[] }> {
  const { data } = await generateJson({
    system: RUBRIC_SYSTEM,
    prompt: buildRubricPrompt({ text: args.text, totalPoints: args.totalPoints }),
    schema: rubricSchema,
    temperature: 0.1,
    maxOutputTokens: 12_000,
    signal: args.signal,
  });

  const { rubric, warnings } = normalizeRubric({ ...data, sourceText: args.text });
  return { rubric, warnings };
}
