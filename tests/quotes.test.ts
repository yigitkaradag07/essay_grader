import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEssayIndex, findQuote } from "../src/lib/quotes.ts";

const essay = `Should Schools Ban Smartphones?

A full ban is the wrong answer. Schools should regulate phone use rather than
prohibit it, because structured access teaches the “self-regulation” students need.

There is also an equity argument that ban advocates rarely address.`;

const index = buildEssayIndex(essay);

test("birebir alıntıyı bulur ve konumunu döndürür", () => {
  const m = findQuote(index, "A full ban is the wrong answer.");
  assert.equal(m.verified, true);
  assert.equal(m.method, "exact");
  assert.equal(essay.slice(m.startIndex!, m.endIndex!), "A full ban is the wrong answer.");
});

test("satır sonuyla bölünmüş alıntıyı doğrular", () => {
  // Model alıntıyı tek satır olarak yazar; makalede satır sonu vardır.
  const m = findQuote(index, "regulate phone use rather than prohibit it");
  assert.equal(m.verified, true);
  assert.equal(m.matchedText, "regulate phone use rather than\nprohibit it");
});

test("eğik tırnak ve düz tırnak farkını yok sayar", () => {
  const m = findQuote(index, 'teaches the "self-regulation" students need');
  assert.equal(m.verified, true);
});

test("büyük/küçük harf farkını yok sayar ama orijinal yazımı döndürür", () => {
  const m = findQuote(index, "SHOULD SCHOOLS BAN SMARTPHONES?");
  assert.equal(m.verified, true);
  assert.equal(m.matchedText, "Should Schools Ban Smartphones?");
});

test("uydurma alıntıyı doğrulamaz", () => {
  const m = findQuote(index, "Every student must surrender their device at the door.");
  assert.equal(m.verified, false);
  assert.equal(m.method, "none");
  assert.equal(m.startIndex, null);
});

test("modelin kendi kelimelerini eklediği alıntıda kısmi eşleşme bildirir", () => {
  const m = findQuote(index, "the author writes that there is also an equity argument that ban advocates rarely address in schools");
  assert.equal(m.verified, false);
  assert.equal(m.method, "partial");
  assert.ok(m.matchedText?.includes("equity argument"));
});

test("boş alıntı doğrulanmaz", () => {
  const m = findQuote(index, "   ");
  assert.equal(m.verified, false);
});
