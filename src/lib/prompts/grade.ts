import type { GradeRequest, ResolvedGradeRequest, Rubric } from "@/lib/schema";

const STRICTNESS_NOTE: Record<GradeRequest["strictness"], string> = {
  lenient:
    "Puanlamada öğrencinin çabasını gözet; sınırdaki durumlarda üst seviyeye yuvarla.",
  balanced:
    "Puanlamada ne cömert ne cimri ol; rubric tanımlarını olduğu gibi uygula.",
  strict:
    "Puanlamada titiz ol; bir seviyeyi hak etmek için o seviyenin TÜM koşulları karşılanmalı.",
};

export const GRADE_SYSTEM = `Sen akademik yazı değerlendiren, adil ve kanıta dayalı çalışan deneyimli bir öğretmensin.

TEMEL KURALLAR
1. Yalnızca sana verilen rubric kriterlerine göre puanla. Rubric'te olmayan bir ölçütü değerlendirmeye katma.
2. Her kriter için verdiğin puanı, makaleden BİREBİR KOPYALANMIŞ alıntılarla gerekçelendir.
3. Alıntılar makalede harfi harfine geçmelidir. Kelime değiştirme, özetleme, düzeltme veya birleştirme YAPMA.
   Uzun bir bölümü göstermek istiyorsan yalnızca 8-25 kelimelik kesintisiz bir parçasını alıntıla.
4. Emin olmadığın bir alıntıyı yazma; alıntısız gerekçe, uydurma alıntıdan iyidir.
5. Puanlar kriterin maxScore değerini AŞAMAZ ve negatif olamaz.
6. Öğrenciye yönelik özet yapıcı ve saygılı olmalı: önce güçlü yön, sonra en önemli 2-3 gelişim alanı.
7. Öğrencinin kimliği, dini, cinsiyeti veya kişisel görüşleri hakkında yorum yapma; sadece metni değerlendir.
8. SADECE geçerli JSON döndür. Markdown çiti, başlık veya açıklama ekleme.`;

function renderRubric(rubric: Rubric): string {
  const lines = rubric.criteria.map((c) => {
    const levels = c.levels.length
      ? c.levels
          .map(
            (l) =>
              `      • ${l.label} (${l.minScore}-${l.maxScore}): ${l.descriptor}`,
          )
          .join("\n")
      : "      (seviye tanımı verilmemiş)";
    return `  - id: ${c.id}
    ad: ${c.name}
    açıklama: ${c.description || "-"}
    maksimum puan: ${c.maxScore}
    ağırlık: ${(c.weight * 100).toFixed(0)}%
    seviyeler:
${levels}`;
  });

  return `RUBRIC: ${rubric.title} (toplam ${rubric.totalPoints} puan)
${rubric.description ? `Açıklama: ${rubric.description}\n` : ""}Kriterler:
${lines.join("\n")}${
    rubric.sourceText
      ? `\n\nÖĞRETMENİN ORİJİNAL RUBRIC METNİ (bağlam için):\n"""\n${rubric.sourceText}\n"""`
      : ""
  }`;
}

export function buildGradePrompt(args: ResolvedGradeRequest): string {
  const { rubric, essay, essayTitle, language, strictness } = args;

  const criteriaJson = rubric.criteria
    .map(
      (c) =>
        `    {
      "id": "${c.id}",
      "name": "${c.name}",
      "score": 0-${c.maxScore} arası sayı,
      "maxScore": ${c.maxScore},
      "level": "eşleşen seviye adı veya null",
      "justification": "puanın gerekçesi (2-4 cümle)",
      "strengths": ["bu kriterde iyi yapılanlar"],
      "improvements": ["bu kriterde nasıl daha iyi olurdu"],
      "evidence": [
        { "quote": "makaleden birebir alıntı", "comment": "bu alıntı bu kriter için ne gösteriyor", "type": "strength | weakness | neutral" }
      ]
    }`,
    )
    .join(",\n");

  return `${renderRubric(rubric)}

DEĞERLENDİRME AYARI: ${STRICTNESS_NOTE[strictness]}
GERİ BİLDİRİM DİLİ: ${language} (tüm açıklamalar bu dilde yazılmalı; alıntılar makalenin orijinal dilinde kalmalı)

${essayTitle ? `MAKALE BAŞLIĞI: ${essayTitle}\n` : ""}MAKALE:
"""
${essay}
"""

Her kriter için en az 1, en fazla 3 alıntı ver. Aşağıdaki JSON yapısını birebir üret:
{
  "overall": {
    "score": toplam ham puan (kriter puanlarının toplamı),
    "maxScore": ${rubric.totalPoints},
    "percentage": 0-100 arası yüzde,
    "letterGrade": "AA/BA/... veya A/B/C gibi harf notu, uygun değilse null",
    "verdict": "tek cümlelik genel değerlendirme"
  },
  "criteria": [
${criteriaJson}
  ],
  "studentSummary": "Öğrenciyle paylaşılabilecek 120-180 kelimelik kısa özet. İkinci tekil şahısla, yapıcı bir tonla yaz. Önce güçlü yönler, sonra en kritik 2-3 gelişim önerisi.",
  "teacherNotes": "Sadece öğretmenin göreceği notlar: puanlamada zorlanılan noktalar, olası intihal/yapay zekâ şüphesi, sınırdaki kararlar.",
  "nextSteps": ["öğrencinin bir sonraki taslakta yapması gereken somut 3 adım"]
}`;
}
