import { NextResponse } from "next/server";
import { z } from "zod";
import { rubricSchema } from "@/lib/schema";
import { normalizeRubric } from "@/lib/rubric";
import { deleteRubric, getRubric, listRubrics, updateRubric } from "@/lib/store";
import { fail, handle } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z
  .object({
    rubric: rubricSchema.optional(),
    /** Bu rubric'i aktif hale getir. */
    activate: z.boolean().optional(),
  })
  .refine((v) => v.rubric !== undefined || v.activate !== undefined, {
    message: 'En az "rubric" veya "activate" alanlarından biri gönderilmeli.',
  });

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const entry = await getRubric(id);
    if (!entry) return fail("Rubric bulunamadı.", 404, "not_found");

    const { activeId } = await listRubrics();
    return NextResponse.json({ ...entry, isActive: entry.id === activeId });
  });
}

/** Rubric'i günceller ve/veya aktif hale getirir. */
export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) return fail("Geçerli bir JSON gövdesi gönderin.", 400, "invalid_json");

    const input = updateSchema.parse(body);
    const normalized = input.rubric ? normalizeRubric(input.rubric) : null;

    const updated = await updateRubric(id, {
      rubric: normalized?.rubric,
      activate: input.activate,
    });
    if (!updated) return fail("Rubric bulunamadı.", 404, "not_found");

    const { activeId } = await listRubrics();
    return NextResponse.json({
      ...updated,
      isActive: updated.id === activeId,
      warnings: normalized?.warnings ?? [],
    });
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const removed = await deleteRubric(id);
    if (!removed) return fail("Rubric bulunamadı.", 404, "not_found");

    const { activeId } = await listRubrics();
    return NextResponse.json({ deleted: id, activeId });
  });
}
