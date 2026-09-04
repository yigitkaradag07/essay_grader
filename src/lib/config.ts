/**
 * Merkezi yapılandırma. Tüm değerler .env.local üzerinden ezilebilir.
 */

function req(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(
      `Eksik ortam değişkeni: ${name}. .env.local dosyasına ekleyin (örnek için .env.example).`,
    );
  }
  return v.trim();
}

export const config = {
  /** Google AI Studio (Gemini API) anahtarı. */
  get apiKey() {
    return req("GOOGLE_AI_API_KEY");
  },
  /** Google AI Studio'daki Gemma model kimliği. */
  model: process.env.GEMMA_MODEL?.trim() || "gemma-4-31b-it",
  apiBaseUrl:
    process.env.GOOGLE_AI_BASE_URL?.trim() ||
    "https://generativelanguage.googleapis.com/v1beta",
  /** Yanıt için token bütçesi. Gemma 4 düşünen bir model olduğu için
   *  muhakeme tokenları da bu bütçeden harcanır; cömert tutulmalıdır. */
  maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || 24_000),
  /** Model çağrısı zaman aşımı (ms). */
  requestTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 120_000),
  /** JSON bozuk gelirse kaç kez yeniden denensin. */
  maxRetries: Number(process.env.AI_MAX_RETRIES || 2),
  /** Girdi güvenlik sınırları. */
  limits: {
    maxEssayChars: Number(process.env.MAX_ESSAY_CHARS || 60_000),
    maxRubricChars: Number(process.env.MAX_RUBRIC_CHARS || 20_000),
    maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024),
  },
} as const;

export function isApiKeyConfigured(): boolean {
  return Boolean(process.env.GOOGLE_AI_API_KEY?.trim());
}
