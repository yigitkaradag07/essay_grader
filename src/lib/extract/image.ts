import { generate, type ImageInput } from "@/lib/ai/client";

/**
 * Rubric fotoğrafı veya taraması için görüntüden metin okuma.
 * Klasik OCR yerine modelin kendi görme yeteneğini kullanıyoruz: rubric'ler
 * genelde tablo biçiminde olur ve satır/sütun ilişkisini düz OCR kaybeder.
 */
const OCR_SYSTEM = `Sen bir belge transkripsiyon aracısın.
Görseldeki TÜM metni eksiksiz ve olduğu gibi yaz.

KURALLAR
- Metni yorumlama, özetleme, düzeltme veya çevirme. Yalnızca oku ve yaz.
- Tablo varsa satır yapısını koru: her satırı tek satırda, hücreleri " | " ile ayırarak yaz.
- Puan aralıklarını, yüzdeleri ve sayıları birebir aktar; bunlar not hesabında kullanılacak.
- Başlık ve madde yapısını koru.
- Okuyamadığın bir yer varsa oraya [okunamadı] yaz; tahmin etme.
- Yalnızca transkripsiyonu döndür; "İşte metin:" gibi giriş cümlesi ekleme.`;

export async function readTextFromImages(
  images: ImageInput[],
  signal?: AbortSignal,
): Promise<{ text: string; warnings: string[] }> {
  const { text } = await generate({
    system: OCR_SYSTEM,
    prompt:
      images.length > 1
        ? `Bu ${images.length} görsel tek bir belgenin sayfalarıdır. Sırayla hepsini yaz.`
        : "Bu görseldeki metni yaz.",
    images,
    temperature: 0,
    signal,
  });

  const warnings: string[] = [];
  const cleaned = text.trim();

  if (cleaned.includes("[okunamadı]")) {
    warnings.push(
      "Görselin bazı bölümleri okunamadı. Çıkan metni kontrol edip eksikleri elle tamamlayın.",
    );
  }
  if (cleaned.length < 40) {
    warnings.push(
      "Görselden çok az metin okundu. Fotoğraf bulanık veya çok karanlık olabilir.",
    );
  }

  return { text: cleaned, warnings };
}
