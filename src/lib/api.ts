import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AiError } from "@/lib/ai/client";
import { ExtractError } from "@/lib/extract/text";

export type ApiError = {
  error: string;
  code: string;
  detail?: unknown;
};

export function fail(
  message: string,
  status = 400,
  code = "bad_request",
  detail?: unknown,
): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code, detail }, { status });
}

/** Route handler'larını sarar; bilinen hata türlerini anlamlı HTTP yanıtlarına çevirir. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ZodError) {
      return fail(
        "Gönderilen veri beklenen biçimde değil.",
        422,
        "validation_error",
        err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }
    if (err instanceof ExtractError) {
      return fail(err.message, err.status, "extract_error");
    }
    if (err instanceof AiError) {
      return fail(err.message, err.status, "ai_error", err.detail);
    }
    if (err instanceof Error && err.message.includes("Eksik ortam değişkeni")) {
      return fail(err.message, 500, "missing_config");
    }
    console.error("[api] beklenmeyen hata:", err);
    return fail(
      "Beklenmeyen bir sunucu hatası oluştu.",
      500,
      "internal_error",
      process.env.NODE_ENV === "development" ? String(err) : undefined,
    );
  }
}
