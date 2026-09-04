import { NextResponse } from "next/server";
import { summaryRequestSchema } from "@/lib/schema";
import { normalizeRubric } from "@/lib/rubric";
import { summarize } from "@/lib/grading";
import { fail, handle } from "@/lib/api";

export const runtime = "nodejs";
// Özet adımı kısa; yine de geniş pay bırakıldı.
export const maxDuration = 300;

/** Kriter sonuçlarını öğrenci özeti ve öğretmen notlarına dönüştürür. */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await request.json().catch(() => null);
    if (!body) return fail("Geçerli bir JSON gövdesi gönderin.", 400, "invalid_json");

    const input = summaryRequestSchema.parse(body);
    const { rubric } = normalizeRubric(input.rubric);

    const result = await summarize({ ...input, rubric }, request.signal);
    return NextResponse.json(result);
  });
}

export async function GET() {
  return fail("Bu uç nokta yalnızca POST kabul eder.", 405, "method_not_allowed");
}
