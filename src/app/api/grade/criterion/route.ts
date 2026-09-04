import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { criterionRequestSchema } from "@/lib/schema";
import { normalizeRubric } from "@/lib/rubric";
import { gradeCriterion } from "@/lib/grading";
import { fail, handle } from "@/lib/api";

export const runtime = "nodejs";
// Tek kriter ~30 sn sürüyor; uzun makaleler için geniş pay bırakıldı.
export const maxDuration = 300;

/** Makaleyi rubric'teki TEK bir kritere göre puanlar. */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await request.json().catch(() => null);
    if (!body) return fail("Geçerli bir JSON gövdesi gönderin.", 400, "invalid_json");

    const input = criterionRequestSchema.parse(body);

    if (input.essay.length > config.limits.maxEssayChars) {
      return fail(
        `Makale çok uzun (en fazla ${config.limits.maxEssayChars} karakter). Bölerek değerlendirin.`,
        413,
        "essay_too_long",
      );
    }

    // Elle düzenlenmiş rubric'ler tutarsız olabilir; puanlamadan önce normalize et.
    const { rubric } = normalizeRubric(input.rubric);
    if (!rubric.criteria.some((c) => c.id === input.criterionId)) {
      return fail(`Rubric'te "${input.criterionId}" kimlikli kriter yok.`, 400, "unknown_criterion");
    }

    const result = await gradeCriterion({ ...input, rubric }, request.signal);
    return NextResponse.json(result);
  });
}

export async function GET() {
  return fail("Bu uç nokta yalnızca POST kabul eder.", 405, "method_not_allowed");
}
