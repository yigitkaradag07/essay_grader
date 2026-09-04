import { config } from "@/lib/config";

export class AiError extends Error {
  constructor(
    message: string,
    readonly status: number = 502,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export type ImageInput = {
  /** image/jpeg, image/png, image/webp */
  mimeType: string;
  /** base64 kodlanmış görüntü verisi. */
  data: string;
};

type GenerateOptions = {
  /** Modele verilecek yönerge. Gemma sistem talimatını desteklemediği için kullanıcı turuna katlanır. */
  system?: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** JSON bekleniyorsa true; destekleyen modellerde JSON modu açılır. */
  json?: boolean;
  /** Prompt ile birlikte gönderilecek görüntüler (rubric fotoğrafı / taraması). */
  images?: ImageInput[];
  signal?: AbortSignal;
};

type GeminiResponse = {
  candidates?: Array<{
    /** Gemma 4 bir düşünen modeldir: parts içinde thought:true olan parçalar modelin
     *  iç muhakemesidir ve nihai yanıta karıştırılmamalıdır. */
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

export type GenerateResult = {
  text: string;
  /** Modelin iç muhakemesi; yalnızca hata ayıklama için. */
  thoughts: string;
  finishReason?: string;
  usage?: GeminiResponse["usageMetadata"];
};

/**
 * Gemma, Gemini API'sindeki systemInstruction ve JSON çıktı modunu desteklemez.
 * Bu yüzden yönergeyi prompt'a gömüyor, JSON'ı da metinden ayıklıyoruz.
 */
function isGemma(model: string): boolean {
  return model.toLowerCase().startsWith("gemma");
}

export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
  const model = config.model;
  const url = `${config.apiBaseUrl}/models/${encodeURIComponent(model)}:generateContent`;

  const gemma = isGemma(model);
  const userText = opts.system && gemma
    ? `${opts.system}\n\n---\n\n${opts.prompt}`
    : opts.prompt;

  // Görüntüler metinden önce gelmeli: model önce neye baktığını, sonra ne yapacağını görür.
  const requestParts: Array<Record<string, unknown>> = [
    ...(opts.images ?? []).map((img) => ({
      inlineData: { mimeType: img.mimeType, data: img.data },
    })),
    { text: userText },
  ];

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: requestParts }],
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      maxOutputTokens: opts.maxOutputTokens ?? config.maxOutputTokens,
      topP: 0.95,
      ...(opts.json && !gemma ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (opts.system && !gemma) {
    body.systemInstruction = { parts: [{ text: opts.system }] };
  }

  const timeout = AbortSignal.timeout(config.requestTimeoutMs);
  const signal = opts.signal
    ? AbortSignal.any([opts.signal, timeout])
    : timeout;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": config.apiKey,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new AiError(
        `Model ${config.requestTimeoutMs / 1000} saniye içinde yanıt vermedi.`,
        504,
      );
    }
    throw new AiError(`Model sunucusuna ulaşılamadı: ${(err as Error).message}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const hint =
      res.status === 400 && detail.includes("API key")
        ? " GOOGLE_AI_API_KEY geçersiz görünüyor."
        : res.status === 404
          ? ` "${model}" modeli bu API anahtarıyla bulunamadı. GEMMA_MODEL değerini kontrol edin.`
          : res.status === 429
            ? " Kota aşıldı, bir süre sonra tekrar deneyin."
            : "";
    throw new AiError(
      `Google AI isteği ${res.status} ile başarısız oldu.${hint}`,
      res.status === 429 ? 429 : 502,
      detail.slice(0, 2000),
    );
  }

  const data = (await res.json()) as GeminiResponse;

  if (data.promptFeedback?.blockReason) {
    throw new AiError(
      `İstek güvenlik filtresine takıldı (${data.promptFeedback.blockReason}).`,
      422,
    );
  }

  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts
    .filter((p) => p.thought !== true)
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  const thoughts = parts
    .filter((p) => p.thought === true)
    .map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) {
    // Düşünme tokenları da maxOutputTokens bütçesinden harcanır; bütçe düşünme
    // aşamasında biterse yanıt kısmı hiç üretilemez.
    if (candidate?.finishReason === "MAX_TOKENS") {
      throw new AiError(
        `Model ${opts.maxOutputTokens ?? config.maxOutputTokens} token bütçesini muhakeme aşamasında tüketti ve yanıt üretemedi. ` +
          `.env.local içindeki AI_MAX_OUTPUT_TOKENS değerini artırın veya metni kısaltın.`,
        502,
      );
    }
    throw new AiError(
      `Model boş yanıt döndü (finishReason: ${candidate?.finishReason ?? "bilinmiyor"}).`,
      502,
    );
  }

  return {
    text,
    thoughts,
    finishReason: candidate?.finishReason,
    usage: data.usageMetadata,
  };
}

/** Modelin ve anahtarın çalışıp çalışmadığını doğrular. */
export async function ping(): Promise<{ ok: true; model: string; reply: string }> {
  const { text } = await generate({
    prompt: "Sadece şu kelimeyi yaz: PONG",
    temperature: 0,
    // Muhakeme tokenları da bütçeden düştüğü için 16 gibi bir değer yanıtı engeller.
    maxOutputTokens: 512,
  });
  return { ok: true, model: config.model, reply: text.slice(0, 40) };
}
