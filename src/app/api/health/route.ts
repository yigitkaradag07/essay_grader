import { NextResponse } from "next/server";
import { config, isApiKeyConfigured } from "@/lib/config";
import { ping } from "@/lib/ai/client";
import { handle } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Model bağlantısını ve API anahtarını doğrular. */
export async function GET() {
  return handle(async () => {
    if (!isApiKeyConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          model: config.model,
          message:
            "GOOGLE_AI_API_KEY tanımlı değil. .env.local dosyasına ekleyip sunucuyu yeniden başlatın.",
        },
        { status: 503 },
      );
    }
    const result = await ping();
    return NextResponse.json(result);
  });
}
