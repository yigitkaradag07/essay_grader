import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson, parseJsonLoose } from "../src/lib/ai/json-extract.ts";

test("düz JSON'ı ayıklar", () => {
  assert.deepEqual(parseJsonLoose('{"a":1}'), { a: 1 });
});

test("markdown kod bloğundan ayıklar", () => {
  const raw = 'İşte sonuç:\n```json\n{"score": 42}\n```\nUmarım yardımcı olur.';
  assert.deepEqual(parseJsonLoose(raw), { score: 42 });
});

test("JSON öncesi ve sonrası açıklama metnini atar", () => {
  const raw = 'Elbette! {"ok": true} Başka bir sorunuz olursa yazın.';
  assert.deepEqual(parseJsonLoose(raw), { ok: true });
});

test("sondaki fazla virgülü tolere eder", () => {
  assert.deepEqual(parseJsonLoose('{"a": [1, 2,], "b": 3,}'), { a: [1, 2], b: 3 });
});

test("string içindeki süslü parantezi kapanış sanmaz", () => {
  const raw = '{"quote": "he said { and never closed it", "n": 1}';
  assert.deepEqual(parseJsonLoose(raw), { quote: "he said { and never closed it", n: 1 });
});

test("kaçışlı tırnak içeren alıntıyı bozmadan ayıklar", () => {
  const raw = '{"quote": "she called it a \\"full ban\\" policy"}';
  assert.deepEqual(parseJsonLoose(raw), { quote: 'she called it a "full ban" policy' });
});

test("dizi kökünü de destekler", () => {
  assert.deepEqual(parseJsonLoose("[1,2,3]"), [1, 2, 3]);
});

test("yarım kalan JSON için null döner", () => {
  assert.equal(extractJson('{"a": 1'), null);
  assert.equal(parseJsonLoose("hiç JSON yok"), null);
});
