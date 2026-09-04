import { NextResponse } from "next/server";
import { z } from "zod";
import { rubricSchema } from "@/lib/schema";
import { normalizeRubric } from "@/lib/rubric";
import { listRubrics, saveRubric } from "@/lib/store";
import { fail, handle } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  rubric: rubricSchema,
  /** Kaydettikten sonra bu rubric aktif olsun mu? */
  activate: z.boolean().default(true),
});

/** Kaydedilmiş rubric'leri ve hangisinin aktif olduğunu listeler. */
export async function GET() {
  return handle(async () => NextResponse.json(await listRubrics()));
}

/** Yeni bir rubric kaydeder ve (istenirse) aktif hale getirir. */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await request.json().catch(() => null);
    if (!body) return fail("Geçerli bir JSON gövdesi gönderin.", 400, "invalid_json");

    const input = createSchema.parse(body);
    const { rubric, warnings } = normalizeRubric(input.rubric);
    const saved = await saveRubric(rubric, input.activate);

    return NextResponse.json({ ...saved, isActive: input.activate, warnings }, { status: 201 });
  });
}
