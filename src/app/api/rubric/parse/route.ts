import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { parseRubricRequestSchema } from "@/lib/schema";
import { parseRubricText } from "@/lib/rubric";
import { DEFAULT_RUBRIC } from "@/lib/prompts/rubric";
import { fail, handle } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Serbest metin rubric'i yapılandırılmış JSON'a çevirir. */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await request.json().catch(() => null);
    if (!body) return fail("Geçerli bir JSON gövdesi gönderin.", 400, "invalid_json");

    const input = parseRubricRequestSchema.parse(body);

    if (input.text.length > config.limits.maxRubricChars) {
      return fail(
        `Rubric metni çok uzun (en fazla ${config.limits.maxRubricChars} karakter).`,
        413,
        "rubric_too_long",
      );
    }

    const { rubric, warnings } = await parseRubricText({
      text: input.text,
      totalPoints: input.totalPoints,
      signal: request.signal,
    });

    return NextResponse.json({ rubric, warnings });
  });
}

/** Öğretmen hazır bir şablonla başlamak isterse varsayılan rubric'i döndürür. */
export async function GET() {
  return NextResponse.json({ rubric: DEFAULT_RUBRIC, warnings: [] });
}
