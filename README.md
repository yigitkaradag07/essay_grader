# Essay Grader

Öğretmenin yüklediği **rubric**'e göre öğrenci makalelerini notlandıran, verdiği her puanı
**makaleden birebir alıntılarla** gerekçelendiren ve öğrenciyle paylaşılabilecek
**kısa bir özet** üreten Next.js uygulaması. Model: Google AI Studio üzerinden **Gemma**.

> Durum: **Backend ve arayüz çalışır durumda.**

## Kurulum

```bash
npm install
cp .env.example .env.local   # zaten varsa atlayın
```

`.env.local` içine Google AI Studio anahtarınızı yazın:

```
GOOGLE_AI_API_KEY=buraya_anahtarınız
GEMMA_MODEL=gemma-4-31b-it
```

Anahtarı https://aistudio.google.com/apikey adresinden alabilirsiniz.
Anahtar yalnızca sunucu tarafında okunur, tarayıcıya hiç gönderilmez.

```bash
npm run dev      # http://localhost:3000
npm test         # birim testleri (alıntı doğrulama + JSON ayıklama)
npm run typecheck
npm run smoke    # sunucu açıkken uçtan uca deneme
```

## Arayüz

Tek sayfalık akış (`src/app/page.tsx`):

1. **Aktif rubric çubuğu** — hangi rubric'in kullanıldığını her zaman gösterir.
   `Değiştir` düğmesi üç sekmeli paneli açar: kayıtlı rubric'ler arasında geçiş,
   yeni rubric yükleme (dosya/fotoğraf/yapıştırma) ve aktif rubric'i elle düzenleme.
2. **Makale** — sürükle-bırak veya yapıştırma, başlık/öğrenci adı, değerlendirme
   sıkılığı (hoşgörülü / dengeli / katı) ve geri bildirim dili.
3. **Sonuç** — genel not, kriter kartları (puan çubuğu, gerekçe, alıntılar, güçlü
   yönler, gelişim önerileri), kopyalanabilir öğrenci özeti ve yalnızca öğretmene
   görünen notlar.

`Alıntıları makalede göster` düğmesi, doğrulanmış alıntıları makale metni üzerinde
işaretler (güçlü yön yeşil, gelişim alanı sarı) — bu, `/api/grade` yanıtındaki
`startIndex`/`endIndex` değerleriyle yapılır, metin içinde yeniden arama yapılmaz.

Sayfanın üst bandındaki animasyonlu WebGL arka planı (`src/components/ui/shader-67130b9a.tsx`,
21st.dev Shader Builder) kasıtlı olarak yalnızca başlık şeridinde durur: öğretmen
uzun metin ve alıntı okuduğu için çalışma yüzeyi sakin ve yüksek kontrastlı bırakıldı.
Bileşen sekme gizlendiğinde veya görünüm dışına çıktığında çizimi durdurur.

## Akış

1. Öğretmen rubric'i yapıştırır **veya** dosya/fotoğraf olarak yükler →
   `POST /api/extract` metni çıkarır, `POST /api/rubric/parse` bunu yapılandırılmış
   JSON'a çevirir (kriter, ağırlık, puan, seviyeler).
2. Rubric tarayıcıya kaydedilir ve aktif hale gelir. Aynı rubric ile arka arkaya çok
   sayıda makale değerlendirilebilir; "Değiştir" düğmesi aktif rubric'i değiştirir.
3. Makale yapıştırılır veya yüklenir → `POST /api/extract`.
4. Her kriter için ayrı bir `POST /api/grade/criterion` isteği gider (paralel);
   ardından `POST /api/grade/summary` sonuçları tek bir geri bildirime dönüştürür.
   Toplam puan istemcide kriter puanları toplanarak bulunur.

## API

### `GET /api/health`
Model bağlantısını ve API anahtarını doğrular.
Anahtar yoksa `503` ve açıklayıcı mesaj döner.

### `POST /api/extract` — `multipart/form-data`
| alan | açıklama |
| --- | --- |
| `file` | `.txt`, `.md`, `.docx`, `.pdf`, `.jpg`, `.png`, `.webp` (en fazla 10 MB) |
| `kind` | `essay` (varsayılan) veya `rubric` — uzunluk sınırını belirler |

Yanıt: `{ text, format, pages, chars, words, filename, warnings }`

**Fotoğraf ve taramalar** (`.jpg`/`.png`/`.webp`) klasik OCR ile değil, modelin kendi
görme yeteneğiyle okunur — rubric'ler çoğunlukla tablo biçiminde olur ve düz OCR
satır/sütun ilişkisini kaybeder. Model tabloyu ` | ` ayraçlı satırlar hâlinde aktarır,
okuyamadığı yere `[okunamadı]` yazar ve bu durumda öğretmene uyarı döner.
HEIC (iPhone) fotoğraflar desteklenmez; net bir hata mesajı döner.

PDF'lerde paragraf içi sert satır sonları birleştirilir; aksi halde hem model metni
kopuk okur hem de alıntı doğrulaması tutmaz. Taranmış (görüntü) PDF'ler desteklenmez.

### `GET /api/rubric/parse`
Öğretmen sıfırdan başlamak istemezse hazır **varsayılan rubric** şablonunu döndürür
(argüman, kanıt, yapı, açıklık, dil bilgisi — toplam 100 puan).

### `POST /api/rubric/parse` — `application/json`
```json
{ "text": "serbest metin rubric", "totalPoints": 100 }
```
Yanıt: `{ rubric, warnings }`

Rubric normalize edilir: id'ler benzersizleştirilir, ağırlıklar toplamı 1.0'a,
kriter puanlarının toplamı `totalPoints`'e ölçeklenir. Yapılan her düzeltme
`warnings` içinde bildirilir; modelin metinde olmayan varsayımları
`rubric.assumptions` altında listelenir.

### `POST /api/grade/criterion` — `application/json`

Makaleyi rubric'teki **tek bir** kritere göre puanlar. Notlandırma bilinçli olarak
kriterlere bölündü: tek çağrıda tüm rubric'i değerlendirmek isteği 85+ saniye
tutuyordu, kriterler paralel gidince hem her istek kısalıyor hem de öğretmen
ilerlemeyi görebiliyor.

```json
{
  "rubric": { "...": "/api/rubric/parse çıktısı" },
  "criterionId": "argument",
  "essay": "makale metni",
  "essayTitle": "isteğe bağlı",
  "language": "tr",
  "strictness": "lenient | balanced | strict"
}
```

Yanıt:
```json
{
  "id": "argument", "name": "Argüman ve Tez",
  "score": 24, "maxScore": 30, "weight": 0.3, "level": "İyi",
  "justification": "...",
  "strengths": ["..."], "improvements": ["..."],
  "evidence": [{ "quote": "...", "comment": "...", "type": "strength",
                 "verified": true, "startIndex": 412, "endIndex": 468 }],
  "quotesTotal": 3, "quotesVerified": 3, "warnings": []
}
```

### `POST /api/grade/summary` — `application/json`

Kriter sonuçlarını öğrenci özeti ve öğretmen notlarına dönüştürür.

```json
{
  "rubric": { "...": "aynı rubric" },
  "results": [{ "...": "kriter yanıtları" }],
  "essayTitle": "isteğe bağlı",
  "language": "tr"
}
```

Yanıt: `{ verdict, letterGrade, studentSummary, teacherNotes, nextSteps, model }`

## Güvenilirlik notları

Bu üç davranış bilinçli tasarım kararlarıdır:

- **Alıntılar doğrulanır.** Dil modelleri var olmayan alıntı üretebilir. Sunucu her
  alıntıyı makale içinde arar (tırnak biçimi, büyük/küçük harf ve satır sonu farklarını
  yok sayarak), bulduğunda `verified: true` ve karakter aralığını döndürür — arayüz
  alıntıyı makale üzerinde işaretleyebilir. Bulunamayan alıntı silinmez, `verified: false`
  olarak işaretlenir ve `meta.warnings` içinde öğretmene bildirilir.
- **Toplam puanı model değil sunucu hesaplar.** Kriter puanları rubric üst sınırına
  kırpılır, toplam yeniden hesaplanır; modelin bildirdiği toplamla uyuşmazsa uyarı üretilir.
- **Gemma JSON modunu ve sistem talimatını desteklemez.** (Gemini'den farkı budur.)
  Yönerge kullanıcı turuna katlanır, yanıttaki JSON metinden ayıklanır (kod bloğu
  çitleri, ön/arka açıklamalar, fazla virgüller temizlenir) ve şemaya uymazsa hata
  modele geri bildirilerek sınırlı sayıda yeniden denenir.
- **Gemma 4 düşünen bir modeldir.** Yanıtta `thought: true` işaretli parçalar modelin
  iç muhakemesidir; nihai metne karıştırılırsa JSON ayrıştırma bozulur, bu yüzden
  ayıklanır. Muhakeme tokenları da `maxOutputTokens` bütçesinden harcanır — bütçe
  düşünme aşamasında biterse model hiç yanıt üretemez, bu durumda net bir hata döner.
  Bu modelde muhakeme kapatılamaz (`thinkingConfig` desteklenmiyor), bu yüzden
  varsayılan bütçe 24.000 token tutulmuştur.

`strictness` ayarı gerçekten ayırt edicidir: aynı rubric ile güçlü örnek makale
`balanced` modda 100/100, kasten zayıf yazılmış örnek `strict` modda 42/100 aldı
(bkz. `samples/essay.txt` ve `samples/essay-weak.txt`).

Model bir öğretmenin yerine geçmez: puanlar bir ilk taslak olarak ele alınmalı,
`meta.warnings` boş değilse sonuç öğrenciyle paylaşılmadan önce gözden geçirilmelidir.

## Rubric'ler nerede saklanıyor?

Rubric'ler **tarayıcıda** (`localStorage`) tutulur, sunucuda değil. İki sebep:

- Uygulama Vercel'de sunucusuz çalışır: dosya sistemi salt okunurdur ve her istek
  farklı bir örneğe düşebilir, yani sunucuya yazılan rubric kalıcı olmaz.
- Uygulamada oturum açma yok. Sunucuda tutulan tek bir liste, adresi bilen herkesin
  aynı rubric'leri görmesi ve silebilmesi demek olurdu.

Sınırı: rubric'ler o tarayıcıya özeldir, başka bilgisayardan görünmez. Çok cihazlı
veya çok kullanıcılı bir kurulum gerekirse `src/lib/rubric-store.ts` bir veritabanı
ve oturum katmanıyla değiştirilmelidir.

## Vercel'e yayınlama

1. Depoyu Vercel'e bağlayın (Next.js otomatik algılanır, ek ayar gerekmez).
2. **Environment Variables** bölümüne ekleyin:
   - `GOOGLE_AI_API_KEY` — Google AI Studio anahtarınız
   - `GEMMA_MODEL` — `gemma-4-31b-it`
3. Deploy edin.

Süre sınırı: notlandırma kriter kriter yapılır ve her istek 40–65 saniye sürer.
Vercel'in fluid compute ile gelen varsayılan sınırı 300 saniyedir, bu yüzden
rotalar `maxDuration = 300` ile işaretlenmiştir.

**Anahtar tarayıcıya hiç gönderilmez;** tüm model çağrıları sunucu rotalarından geçer.
Uygulamada oturum açma olmadığı için adresi bilen herkes anahtarınızla notlandırma
yapabilir — bağlantıyı yalnızca güvendiğiniz kişilerle paylaşın veya Vercel'in
[Deployment Protection](https://vercel.com/docs/deployment-protection) ayarını açın.

## Dizin yapısı

```
src/lib/config.ts          ortam değişkenleri ve sınırlar
src/lib/schema.ts          zod şemaları (rubric, sonuç, istekler)
src/lib/ai/client.ts       Google AI çağrısı, hata ve zaman aşımı yönetimi
src/lib/ai/json-extract.ts model çıktısından JSON ayıklama (saf fonksiyon)
src/lib/ai/json.ts         şema doğrulamalı, yeniden denemeli JSON üretimi
src/lib/prompts/           rubric ve notlandırma prompt'ları + varsayılan rubric
src/lib/quotes.ts          alıntı doğrulama ve konum bulma
src/lib/rubric.ts          rubric ayrıştırma ve normalize etme
src/lib/grading.ts         kriter puanlama ve özet üretimi
src/lib/extract/text.ts    txt/md/docx/pdf/görsel metin çıkarma
src/lib/extract/image.ts   fotoğraf/taramadan metin okuma (model görüşü)
src/lib/rubric-store.ts    tarayıcıda rubric saklama (localStorage + React kancaları)
src/app/api/               route handler'lar
src/app/page.tsx           tek sayfalık akış (rubric → makale → sonuç)
src/components/            RubricPanel, EssayPanel, ResultPanel, FileDropzone
src/components/ui/         shader arka planı ve ortak arayüz parçaları
src/lib/client-api.ts      tarayıcı tarafı tipli API çağrıları
tests/                     birim testleri
samples/                   örnek rubric (txt + jpg), güçlü ve zayıf örnek makale
scripts/smoke.sh           uçtan uca deneme betiği
scripts/make-pdf-fixture.mjs  test için gerçekçi PDF üretir
```
