import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { gradeRequestSchema, type Rubric } from "@/lib/schema";
import { normalizeRubric } from "@/lib/rubric";
import { gradeEssay } from "@/lib/grading";
import { getActiveRubric, getRubric } from "@/lib/store";
import { fail, handle } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Rubric + makale alır, kriter bazlı puan, alıntılı gerekçe ve öğrenci özeti döndürür.
 * Rubric üç yoldan gelebilir: gövdedeki `rubric`, `rubricId` veya kayıtlı aktif rubric.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await request.json().catch(() => null);
    if (!body) return fail("Geçerli bir JSON gövdesi gönderin.", 400, "invalid_json");

    const input = gradeRequestSchema.parse(body);

    if (input.essay.length > config.limits.maxEssayChars) {
      return fail(
        `Makale çok uzun (en fazla ${config.limits.maxEssayChars} karakter). Bölerek değerlendirin.`,
        413,
        "essay_too_long",
      );
    }

    let source: Rubric | undefined = input.rubric;
    let rubricId: string | null = null;

    if (!source) {
      const stored = input.rubricId
        ? await getRubric(input.rubricId)
        : await getActiveRubric();

      if (!stored) {
        return fail(
          input.rubricId
            ? "Belirtilen rubric bulunamadı."
            : "Aktif bir rubric yok. Önce bir rubric yükleyip kaydedin.",
          input.rubricId ? 404 : 409,
          "no_rubric",
        );
      }
      source = stored.rubric;
      rubricId = stored.id;
    }

    // Elle düzenlenmiş rubric'ler de tutarsız olabilir; puanlamadan önce normalize et.
    const { rubric, warnings: rubricWarnings } = normalizeRubric(source);

    const result = await gradeEssay({ ...input, rubric }, request.signal);
    result.meta.warnings.unshift(...rubricWarnings);

    return NextResponse.json({ ...result, rubricId, rubricTitle: rubric.title });
  });
}

export async function GET() {
  return fail("Bu uç nokta yalnızca POST kabul eder.", 405, "method_not_allowed");
}
