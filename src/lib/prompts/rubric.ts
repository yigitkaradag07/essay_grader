import type { Rubric } from "@/lib/schema";

export const RUBRIC_SYSTEM = `Sen deneyimli bir eğitim ölçme-değerlendirme uzmanısın.
Görevin: öğretmenin serbest biçimde yazdığı bir değerlendirme ölçeğini (rubric),
makine tarafından kullanılabilir yapılandırılmış bir JSON'a çevirmek.

KURALLAR
- Öğretmenin yazdığı kriterleri, ağırlıkları ve puanları OLDUĞU GİBİ koru. Kriter uydurma, silme, birleştirme.
- Öğretmen ağırlık belirtmemişse kriterleri eşit ağırlıklandır.
- Öğretmen puan belirtmemişse toplam puanı kriter sayısına eşit böl.
- weight değerleri 0-1 arasında olmalı ve toplamları 1.0 etmeli.
- Her kriterin maxScore toplamı totalPoints'e eşit olmalı.
- id alanı kısa, ingilizce, kebab-case olmalı (örn. "argument", "clarity", "structure").
- Rubric'te açıkça yazmayan ama senin varsaydığın her şeyi "assumptions" dizisine yaz.
- Kriter adı ve açıklamalarını öğretmenin yazdığı dilde bırak.
- SADECE JSON döndür. Markdown çiti, açıklama veya yorum ekleme.`;

export function buildRubricPrompt(args: {
  text: string;
  totalPoints?: number;
}): string {
  return `ÖĞRETMENİN RUBRIC METNİ:
"""
${args.text}
"""

${
  args.totalPoints
    ? `Toplam puan ${args.totalPoints} olmalı.`
    : `Toplam puan metinde belirtilmişse onu kullan, belirtilmemişse 100 kabul et.`
}

Aşağıdaki JSON şemasına birebir uy:
{
  "title": "string",
  "description": "string",
  "totalPoints": number,
  "criteria": [
    {
      "id": "kebab-case-string",
      "name": "string",
      "description": "kriterin neyi ölçtüğü",
      "weight": number,      // 0-1, tümünün toplamı 1.0
      "maxScore": number,    // tümünün toplamı totalPoints
      "levels": [
        { "label": "string", "descriptor": "bu seviyedeki çalışmanın tanımı", "minScore": number, "maxScore": number }
      ]
    }
  ],
  "assumptions": ["metinde yazmayan ama varsaydığın şeyler"]
}`;
}

/** Öğretmen hiç rubric yüklemek istemezse kullanılabilecek varsayılan akademik rubric. */
export const DEFAULT_RUBRIC: Rubric = {
  title: "Genel Akademik Makale Rubriği",
  description:
    "Argüman, açıklık, yapı, kanıt kullanımı ve dil kullanımını ölçen genel amaçlı rubric.",
  totalPoints: 100,
  sourceText: "",
  assumptions: [],
  criteria: [
    {
      id: "argument",
      name: "Argüman ve Tez",
      description:
        "Tez cümlesinin netliği, savunulabilirliği ve makale boyunca tutarlı biçimde geliştirilmesi.",
      weight: 0.3,
      maxScore: 30,
      levels: [
        { label: "Mükemmel", descriptor: "Özgün, net ve tartışmaya açık bir tez; her paragraf tezi ilerletir.", minScore: 26, maxScore: 30 },
        { label: "İyi", descriptor: "Net bir tez var; gelişimi yer yer zayıflıyor.", minScore: 20, maxScore: 25 },
        { label: "Geliştirilmeli", descriptor: "Tez belirsiz veya betimleyici; savunulan bir iddia yok.", minScore: 12, maxScore: 19 },
        { label: "Yetersiz", descriptor: "Tanımlanabilir bir tez yok.", minScore: 0, maxScore: 11 },
      ],
    },
    {
      id: "evidence",
      name: "Kanıt ve Analiz",
      description:
        "İddiaların uygun kanıtlarla desteklenmesi ve kanıtın yorumlanması.",
      weight: 0.25,
      maxScore: 25,
      levels: [
        { label: "Mükemmel", descriptor: "İlgili, yeterli kanıt; her kanıt analiz edilerek teze bağlanmış.", minScore: 22, maxScore: 25 },
        { label: "İyi", descriptor: "Kanıt var ancak analiz bazı yerlerde yüzeysel.", minScore: 17, maxScore: 21 },
        { label: "Geliştirilmeli", descriptor: "Kanıt seyrek veya yorumlanmadan bırakılmış.", minScore: 10, maxScore: 16 },
        { label: "Yetersiz", descriptor: "İddialar desteksiz.", minScore: 0, maxScore: 9 },
      ],
    },
    {
      id: "structure",
      name: "Yapı ve Organizasyon",
      description:
        "Giriş-gelişme-sonuç düzeni, paragraf bütünlüğü ve geçişler.",
      weight: 0.2,
      maxScore: 20,
      levels: [
        { label: "Mükemmel", descriptor: "Mantıklı ilerleyen, güçlü geçişlerle bağlanmış bölümler.", minScore: 18, maxScore: 20 },
        { label: "İyi", descriptor: "Genel düzen açık; birkaç geçiş zayıf.", minScore: 14, maxScore: 17 },
        { label: "Geliştirilmeli", descriptor: "Paragraflar dağınık, sıralama okuyucuyu zorluyor.", minScore: 8, maxScore: 13 },
        { label: "Yetersiz", descriptor: "Fark edilebilir bir organizasyon yok.", minScore: 0, maxScore: 7 },
      ],
    },
    {
      id: "clarity",
      name: "Açıklık ve Üslup",
      description: "Cümle netliği, terim kullanımı ve akademik üslup.",
      weight: 0.15,
      maxScore: 15,
      levels: [
        { label: "Mükemmel", descriptor: "Akıcı, kesin ve okunması kolay; üslup amaca uygun.", minScore: 13, maxScore: 15 },
        { label: "İyi", descriptor: "Genelde açık; yer yer dolambaçlı cümleler.", minScore: 10, maxScore: 12 },
        { label: "Geliştirilmeli", descriptor: "Sık sık muğlak ifadeler, okuyucu anlamı çıkarmakta zorlanıyor.", minScore: 6, maxScore: 9 },
        { label: "Yetersiz", descriptor: "Anlaşılırlık ciddi biçimde bozulmuş.", minScore: 0, maxScore: 5 },
      ],
    },
    {
      id: "mechanics",
      name: "Dil Bilgisi ve Yazım",
      description: "İmla, noktalama, dil bilgisi ve biçimsel tutarlılık.",
      weight: 0.1,
      maxScore: 10,
      levels: [
        { label: "Mükemmel", descriptor: "Neredeyse hatasız.", minScore: 9, maxScore: 10 },
        { label: "İyi", descriptor: "Anlamı bozmayan birkaç hata.", minScore: 7, maxScore: 8 },
        { label: "Geliştirilmeli", descriptor: "Okumayı yavaşlatan sık hatalar.", minScore: 4, maxScore: 6 },
        { label: "Yetersiz", descriptor: "Hatalar anlamı engelliyor.", minScore: 0, maxScore: 3 },
      ],
    },
  ],
};
