/**
 * Model uydurma ("halüsinasyon") alıntı üretebilir. Bu modül her alıntının
 * makalede gerçekten geçtiğini doğrular ve orijinal metindeki konumunu bulur.
 */

const QUOTE_CHARS: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'",
  "“": '"', "”": '"', "„": '"', "‟": '"',
  "«": '"', "»": '"',
  "–": "-", "—": "-", "−": "-",
  "…": "...", " ": " ",
};

/**
 * Metni karşılaştırma için normalize eder ve her normalize karakterin
 * orijinal metindeki konumunu tutan bir harita döndürür.
 */
function normalizeWithMap(text: string): { norm: string; map: number[] } {
  const out: string[] = [];
  const map: number[] = [];
  let lastWasSpace = true; // baştaki boşlukları at

  for (let i = 0; i < text.length; i++) {
    const raw = text[i];
    const replaced = QUOTE_CHARS[raw] ?? raw;

    if (/\s/.test(replaced)) {
      if (lastWasSpace) continue;
      out.push(" ");
      map.push(i);
      lastWasSpace = true;
      continue;
    }

    lastWasSpace = false;
    for (const ch of replaced.toLowerCase()) {
      out.push(ch);
      map.push(i);
    }
  }

  while (out.length && out[out.length - 1] === " ") {
    out.pop();
    map.pop();
  }

  return { norm: out.join(""), map };
}

export type EssayIndex = ReturnType<typeof buildEssayIndex>;

export function buildEssayIndex(essay: string) {
  const { norm, map } = normalizeWithMap(essay);
  return { essay, norm, map };
}

export type QuoteMatch = {
  verified: boolean;
  startIndex: number | null;
  endIndex: number | null;
  /** Doğrulandıysa makaledeki gerçek (orijinal biçimli) metin. */
  matchedText: string | null;
  /** "exact": birebir, "partial": alıntının anlamlı bir parçası bulundu. */
  method: "exact" | "partial" | "none";
};

/** Normalize edilmiş konumu orijinal metindeki [start, end) aralığına çevirir. */
function toOriginalRange(
  index: EssayIndex,
  normStart: number,
  normLength: number,
): { start: number; end: number } {
  const start = index.map[normStart];
  const lastNorm = normStart + normLength - 1;
  const end = (index.map[lastNorm] ?? start) + 1;
  return { start, end };
}

export function findQuote(index: EssayIndex, quote: string): QuoteMatch {
  const { norm: normQuote } = normalizeWithMap(quote);
  if (!normQuote) {
    return { verified: false, startIndex: null, endIndex: null, matchedText: null, method: "none" };
  }

  const at = index.norm.indexOf(normQuote);
  if (at !== -1) {
    const { start, end } = toOriginalRange(index, at, normQuote.length);
    return {
      verified: true,
      startIndex: start,
      endIndex: end,
      matchedText: index.essay.slice(start, end),
      method: "exact",
    };
  }

  // Kısmi eşleşme: model alıntının başına/sonuna kendi kelimelerini eklemiş olabilir.
  // Alıntının en uzun bulunabilen kesintisiz kelime dizisini arıyoruz.
  const words = normQuote.split(" ").filter(Boolean);
  const minWords = Math.max(4, Math.ceil(words.length * 0.6));

  for (let len = words.length - 1; len >= minWords; len--) {
    for (let offset = 0; offset + len <= words.length; offset++) {
      const candidate = words.slice(offset, offset + len).join(" ");
      const pos = index.norm.indexOf(candidate);
      if (pos !== -1) {
        const { start, end } = toOriginalRange(index, pos, candidate.length);
        return {
          verified: false,
          startIndex: start,
          endIndex: end,
          matchedText: index.essay.slice(start, end),
          method: "partial",
        };
      }
    }
  }

  return { verified: false, startIndex: null, endIndex: null, matchedText: null, method: "none" };
}
