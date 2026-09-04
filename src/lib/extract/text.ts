/**
 * Yüklenen dosyadan düz metin çıkarır. Desteklenen türler: .txt, .md, .docx, .pdf
 * (.doc desteklenmez; Word'den .docx olarak kaydedilmelidir.)
 */

export type ExtractFormat = "txt" | "md" | "docx" | "pdf" | "image";

export type ExtractResult = {
  text: string;
  format: ExtractFormat;
  /** PDF ise sayfa sayısı. */
  pages?: number;
  warnings: string[];
};

export class ExtractError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "ExtractError";
  }
}

const EXT_RE = /\.([a-z0-9]+)$/i;

const IMAGE_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function detectFormat(filename: string, mime: string): ExtractFormat {
  const ext = filename.match(EXT_RE)?.[1]?.toLowerCase();
  if (ext === "txt" || ext === "text") return "txt";
  if (ext === "md" || ext === "markdown") return "md";
  if (ext === "docx") return "docx";
  if (ext === "pdf") return "pdf";
  if (ext && ext in IMAGE_MIME) return "image";

  if (mime.includes("pdf")) return "pdf";
  if (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp") return "image";
  if (mime.includes("wordprocessingml")) return "docx";
  if (mime.startsWith("text/")) return "txt";

  if (ext === "doc") {
    throw new ExtractError(
      "Eski .doc biçimi desteklenmiyor. Dosyayı Word'de açıp .docx olarak kaydedin.",
    );
  }
  if (ext === "heic" || ext === "heif") {
    throw new ExtractError(
      "HEIC fotoğraflar desteklenmiyor. iPhone'da fotoğrafı paylaşırken JPEG olarak dışa aktarın " +
        "(veya Ayarlar > Kamera > Biçimler > En Uyumlu).",
    );
  }
  if (ext === "pages") {
    throw new ExtractError(
      "Apple Pages dosyaları desteklenmiyor. Dosyayı PDF veya .docx olarak dışa aktarın.",
    );
  }
  throw new ExtractError(
    `Desteklenmeyen dosya türü${ext ? ` (.${ext})` : ""}. .txt, .md, .docx, .pdf, .jpg, .png veya .webp yükleyin.`,
  );
}

/** Satır sonu kirliliğini temizler. */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/-\n(?=[a-zçğıöşü])/g, "") // satır sonu tirelemesi
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function reflowParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => para.replace(/\n(?!\s*$)/g, " ").replace(/ {2,}/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

export async function extractText(
  file: File,
  signal?: AbortSignal,
): Promise<ExtractResult> {
  const format = detectFormat(file.name || "", file.type || "");
  const warnings: string[] = [];
  const buffer = Buffer.from(await file.arrayBuffer());

  if (format === "txt" || format === "md") {
    return { text: tidy(buffer.toString("utf8")), format, warnings };
  }

  if (format === "image") {
    const ext = (file.name || "").match(EXT_RE)?.[1]?.toLowerCase() ?? "";
    const mimeType = IMAGE_MIME[ext] ?? (file.type || "image/jpeg");
    const { readTextFromImages } = await import("./image");
    const { text, warnings: ocrWarnings } = await readTextFromImages(
      [{ mimeType, data: buffer.toString("base64") }],
      signal,
    );
    if (!text) {
      throw new ExtractError("Görselden metin okunamadı. Daha net bir fotoğraf deneyin.");
    }
    return { text, format, warnings: [...warnings, ...ocrWarnings] };
  }

  if (format === "docx") {
    const mammoth = (await import("mammoth")).default;
    const result = await mammoth.extractRawText({ buffer });
    if (!result.value.trim()) {
      throw new ExtractError("Word dosyasından metin çıkarılamadı; dosya boş olabilir.");
    }
    for (const m of result.messages.slice(0, 3)) {
      warnings.push(`Word dönüştürme uyarısı: ${m.message}`);
    }
    return { text: tidy(result.value), format, warnings };
  }

  const { extractText: extractPdfText } = await import("unpdf");
  const { text, totalPages } = await extractPdfText(new Uint8Array(buffer), {
    mergePages: true,
  });
  // PDF çıkarımı satırları sert kırar; paragraf içindeki tek satır sonlarını boşluğa
  // çevirmezsek hem model metni kopuk okur hem de alıntı doğrulaması tutmaz.
  const merged = reflowParagraphs(tidy(Array.isArray(text) ? text.join("\n\n") : text));

  if (!merged) {
    throw new ExtractError(
      "PDF'ten metin çıkarılamadı. Dosya taranmış görüntü olabilir; OCR uygulanmış bir sürüm veya .docx yükleyin.",
    );
  }
  if (merged.length < 200 && totalPages > 1) {
    warnings.push(
      "PDF'ten çok az metin çıktı. Dosya taranmış olabilir; çıkan metni kontrol edin.",
    );
  }

  return { text: merged, format, pages: totalPages, warnings };
}
