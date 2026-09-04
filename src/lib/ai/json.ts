import { z } from "zod";
import { AiError, generate } from "./client";
import { parseJsonLoose } from "./json-extract";
import { config } from "@/lib/config";

/**
 * Modelden şemaya uyan JSON alana kadar (sınırlı sayıda) tekrar dener.
 * Her denemede önceki hatayı modele geri bildirir.
 */
export async function generateJson<T>(args: {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}): Promise<{ data: T; attempts: number; rawText: string }> {
  const errors: string[] = [];
  let lastRaw = "";

  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
    const repair =
      errors.length > 0
        ? `\n\nÖNCEKİ DENEME GEÇERSİZDİ. Hata:\n${errors.at(-1)}\n` +
          `Bu kez SADECE geçerli JSON döndür. Açıklama, markdown çiti veya yorum ekleme.`
        : "";

    const { text } = await generate({
      system: args.system,
      prompt: args.prompt + repair,
      temperature: attempt === 1 ? (args.temperature ?? 0.2) : 0.1,
      maxOutputTokens: args.maxOutputTokens,
      json: true,
      signal: args.signal,
    });
    lastRaw = text;

    const parsed = parseJsonLoose(text);
    if (parsed === null) {
      errors.push("Yanıt geçerli JSON içermiyordu.");
      continue;
    }

    const result = args.schema.safeParse(parsed);
    if (result.success) {
      return { data: result.data, attempts: attempt, rawText: text };
    }
    errors.push(
      result.error.issues
        .slice(0, 8)
        .map((i) => `- ${i.path.join(".") || "(kök)"}: ${i.message}`)
        .join("\n"),
    );
  }

  throw new AiError(
    `Model ${config.maxRetries + 1} denemede de şemaya uygun JSON üretemedi.`,
    502,
    { errors, lastRaw: lastRaw.slice(0, 2000) },
  );
}

export { extractJson, parseJsonLoose } from "./json-extract";
