import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { extractText } from "@/lib/extract/text";
import { fail, handle } from "@/lib/api";

export const runtime = "nodejs";
// Görsel rubric okuma model çağrısı gerektirir; varsayılan süre yetmeyebilir.
export const maxDuration = 120;

/**
 * multipart/form-data ile gelen dosyadan düz metin çıkarır.
 * Alan adı: "file" (.txt/.md/.docx/.pdf/.jpg/.png/.webp).
 * İsteğe bağlı "kind" alanı ("essay" | "rubric") uzunluk sınırını belirler.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const form = await request.formData().catch(() => null);
    if (!form) {
      return fail("İstek multipart/form-data biçiminde olmalı.", 415, "bad_content_type");
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return fail('Dosya bulunamadı. "file" alanıyla gönderin.', 400, "missing_file");
    }
    if (file.size === 0) {
      return fail("Dosya boş.", 400, "empty_file");
    }
    if (file.size > config.limits.maxUploadBytes) {
      const mb = (config.limits.maxUploadBytes / 1024 / 1024).toFixed(0);
      return fail(`Dosya çok büyük. En fazla ${mb} MB yükleyebilirsiniz.`, 413, "file_too_large");
    }

    const kind = form.get("kind") === "rubric" ? "rubric" : "essay";
    const limit =
      kind === "rubric" ? config.limits.maxRubricChars : config.limits.maxEssayChars;

    const result = await extractText(file, request.signal);
    const warnings = [...result.warnings];
    let text = result.text;

    if (text.length > limit) {
      warnings.push(
        `Metin ${text.length} karakterdi; ilk ${limit} karakter alındı. Uzun belgeleri parçalara bölerek değerlendirin.`,
      );
      text = text.slice(0, limit);
    }

    return NextResponse.json({
      text,
      format: result.format,
      pages: result.pages ?? null,
      chars: text.length,
      words: text.trim().split(/\s+/).filter(Boolean).length,
      filename: file.name,
      warnings,
    });
  });
}

export async function GET() {
  return fail("Bu uç nokta yalnızca POST kabul eder.", 405, "method_not_allowed");
}

