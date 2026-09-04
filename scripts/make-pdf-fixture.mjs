/**
 * Test için gerçekçi bir PDF üretir. macOS'un `cupsfilter` aracı metni sabit
 * genişlikte kelime ortasından kırdığı için ("schools" -> "school s") çıkarım
 * testlerinde yanıltıcı sonuç veriyordu; bu betik kelime sınırlarına saygı duyar.
 *
 * Kullanım: node scripts/make-pdf-fixture.mjs <girdi.txt> <çıktı.pdf>
 */
import { readFileSync, writeFileSync } from "node:fs";

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error("Kullanım: node scripts/make-pdf-fixture.mjs <girdi.txt> <çıktı.pdf>");
  process.exit(1);
}

const FONT_SIZE = 11;
const LEADING = 15;
const MARGIN = 56;
const PAGE = { w: 595, h: 842 }; // A4 (pt)
const MAX_CHARS = Math.floor((PAGE.w - 2 * MARGIN) / (FONT_SIZE * 0.5));

const paragraphs = readFileSync(input, "utf8").split(/\n{2,}/);
const lines = [];
for (const para of paragraphs) {
  const words = para.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  let line = "";
  for (const word of words) {
    if (line && line.length + 1 + word.length > MAX_CHARS) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  lines.push(""); // paragraf arası boşluk
}

const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const body = lines.map((l) => `(${esc(l)}) Tj T*`).join("\n");
const stream = `BT /F1 ${FONT_SIZE} Tf ${LEADING} TL ${MARGIN} ${PAGE.h - MARGIN} Td\n${body}\nET`;

const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
  `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
];

let pdf = "%PDF-1.4\n";
const offsets = [0];
objects.forEach((obj, i) => {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
});
const xrefAt = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (let i = 1; i <= objects.length; i++) {
  pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

writeFileSync(output, pdf, "latin1");
console.log(`${output} yazıldı (${lines.length} satır).`);
