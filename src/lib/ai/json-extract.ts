/**
 * Gemma JSON modunu desteklemediği için yanıtın içinden JSON'ı kendimiz ayıklıyoruz:
 * kod bloğu çitleri, açıklama cümleleri ve sondaki virgüller gibi tipik kirlilikler temizlenir.
 */
export function extractJson(raw: string): string | null {
  let text = raw.trim();

  // ```json ... ``` bloğu varsa içini al
  const fence = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();

  // İlk { veya [ ile dengeli kapanışı arasını al (string ve kaçış farkındalığıyla)
  const start = text.search(/[{[]/);
  if (start === -1) return null;

  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      if (inString) escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end === -1) return null;
  return text
    .slice(start, end + 1)
    .replace(/,\s*([}\]])/g, "$1"); // sondaki fazla virgüller
}

export function parseJsonLoose<T = unknown>(raw: string): T | null {
  const candidate = extractJson(raw);
  if (!candidate) return null;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}
