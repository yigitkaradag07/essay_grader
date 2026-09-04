import type { CriterionResult, Rubric, RubricCriterion } from "@/lib/schema";

type Strictness = "lenient" | "balanced" | "strict";

const STRICTNESS_NOTE: Record<Strictness, string> = {
  lenient:
    "Puanlamada öğrencinin çabasını gözet; sınırdaki durumlarda üst seviyeye yuvarla.",
  balanced:
    "Puanlamada ne cömert ne cimri ol; rubric tanımlarını olduğu gibi uygula.",
  strict:
    "Puanlamada titiz ol; bir seviyeyi hak etmek için o seviyenin TÜM koşulları karşılanmalı.",
};

/* --------------------------- Tek kriter puanlama --------------------------- */

export const CRITERION_SYSTEM = `Sen akademik yazı değerlendiren, adil ve kanıta dayalı çalışan deneyimli bir öğretmensin.
Sana bir makale ve rubric'ten TEK BİR kriter verilir. Yalnızca o kriteri değerlendirirsin.

TEMEL KURALLAR
1. Sadece verilen kriteri puanla. Diğer kriterlerin alanına girme (ör. dil bilgisi kriteri
   değerlendirirken argümanın gücünü puanlama).
2. Verdiğin puanı, makaleden BİREBİR KOPYALANMIŞ alıntılarla gerekçelendir.
3. Alıntılar makalede harfi harfine geçmelidir. Kelime değiştirme, özetleme, düzeltme veya
   birleştirme YAPMA. Uzun bir bölüm için yalnızca 8-25 kelimelik kesintisiz bir parça alıntıla.
4. Emin olmadığın bir alıntıyı yazma; alıntısız gerekçe, uydurma alıntıdan iyidir.
5. Puan, kriterin maksimum puanını AŞAMAZ ve negatif olamaz.
6. Öğrencinin kimliği, dini, cinsiyeti veya kişisel görüşleri hakkında yorum yapma.
7. SADECE geçerli JSON döndür. Markdown çiti, başlık veya açıklama ekleme.`;

function renderCriterion(criterion: RubricCriterion): string {
  const levels = criterion.levels.length
    ? criterion.levels
        .map((l) => `  • ${l.label} (${l.minScore}-${l.maxScore}): ${l.descriptor}`)
        .join("\n")
    : "  (seviye tanımı verilmemiş)";

  return `KRİTER: ${criterion.name}
Açıklama: ${criterion.description || "-"}
Maksimum puan: ${criterion.maxScore}
Seviyeler:
${levels}`;
}

export function buildCriterionPrompt(args: {
  rubric: Rubric;
  criterion: RubricCriterion;
  essay: string;
  essayTitle?: string;
  language: string;
  strictness: Strictness;
}): string {
  const { rubric, criterion, essay, essayTitle, language, strictness } = args;

  return `RUBRIC: ${rubric.title} (toplam ${rubric.totalPoints} puan)
Bu makale ${rubric.criteria.length} kritere göre değerlendiriliyor. Senin görevin yalnızca aşağıdaki kriter.

${renderCriterion(criterion)}

DEĞERLENDİRME AYARI: ${STRICTNESS_NOTE[strictness]}
GERİ BİLDİRİM DİLİ: ${language} (açıklamalar bu dilde; alıntılar makalenin orijinal dilinde kalır)

${essayTitle ? `MAKALE BAŞLIĞI: ${essayTitle}\n` : ""}MAKALE:
"""
${essay}
"""

En az 1, en fazla 3 alıntı ver. Şu JSON'u üret:
{
  "score": 0-${criterion.maxScore} arası sayı,
  "level": "eşleşen seviye adı veya null",
  "justification": "puanın gerekçesi (2-4 cümle)",
  "strengths": ["bu kriterde iyi yapılanlar"],
  "improvements": ["bu kriterde nasıl daha iyi olurdu"],
  "evidence": [
    { "quote": "makaleden birebir alıntı", "comment": "bu alıntı bu kriter için ne gösteriyor", "type": "strength | weakness | neutral" }
  ]
}`;
}

/* ------------------------------- Genel özet ------------------------------- */

export const SUMMARY_SYSTEM = `Sen bir öğretmensin. Bir makalenin kriter kriter değerlendirmesi
sana verilir; senden bunları tek bir geri bildirime dönüştürmen istenir.

KURALLAR
1. Yalnızca verilen kriter değerlendirmelerine dayan. Yeni bir puan verme, puanları değiştirme.
2. Öğrenci özeti yapıcı ve saygılı olmalı: önce güçlü yönler, sonra en kritik 2-3 gelişim alanı.
   İkinci tekil şahısla yaz.
3. Öğrencinin kimliği, dini, cinsiyeti veya kişisel görüşleri hakkında yorum yapma.
4. SADECE geçerli JSON döndür. Markdown çiti, başlık veya açıklama ekleme.`;

export function buildSummaryPrompt(args: {
  rubric: Rubric;
  results: CriterionResult[];
  totalScore: number;
  language: string;
  essayTitle?: string;
}): string {
  const { rubric, results, totalScore, language, essayTitle } = args;

  const breakdown = results
    .map(
      (r) =>
        `- ${r.name}: ${r.score}/${r.maxScore}${r.level ? ` (${r.level})` : ""}
  Gerekçe: ${r.justification}
  Güçlü: ${r.strengths.join("; ") || "-"}
  Geliştirilecek: ${r.improvements.join("; ") || "-"}`,
    )
    .join("\n");

  return `RUBRIC: ${rubric.title}
${essayTitle ? `MAKALE: ${essayTitle}\n` : ""}TOPLAM: ${totalScore}/${rubric.totalPoints}

KRİTER DEĞERLENDİRMELERİ:
${breakdown}

GERİ BİLDİRİM DİLİ: ${language}

Şu JSON'u üret:
{
  "verdict": "tek cümlelik genel değerlendirme",
  "letterGrade": "AA/BA/... veya A/B/C gibi harf notu, uygun değilse null",
  "studentSummary": "Öğrenciyle paylaşılabilecek 120-180 kelimelik özet. Önce güçlü yönler, sonra en kritik 2-3 gelişim önerisi.",
  "teacherNotes": "Sadece öğretmenin göreceği notlar: sınırdaki kararlar, olası intihal/yapay zekâ şüphesi, dikkat edilmesi gerekenler.",
  "nextSteps": ["öğrencinin bir sonraki taslakta yapması gereken somut 3 adım"]
}`;
}
