"use client";

import { useSyncExternalStore } from "react";
import type { Rubric } from "@/lib/schema";

/**
 * Rubric'ler tarayıcıda (localStorage) saklanır.
 *
 * Neden sunucuda değil: uygulama Vercel'de sunucusuz (serverless) çalışır — dosya
 * sistemi salt okunurdur ve her istek farklı bir örneğe düşebilir, yani dosyaya
 * yazılan rubric kalıcı olmaz. Ayrıca uygulamada oturum açma yok; sunucuda tutulan
 * tek bir liste, adresi bilen HERKESİN aynı rubric'leri görmesi demek olurdu.
 * Tarayıcıda saklamak her öğretmene kendi listesini verir ve altyapı gerektirmez.
 *
 * Sınırı: rubric'ler o tarayıcıya özeldir; başka bilgisayardan görünmez.
 */

const STORAGE_KEY = "essay-grader.rubrics.v1";

export type StoredRubric = {
  id: string;
  savedAt: string;
  updatedAt: string;
  rubric: Rubric;
};

export type RubricSummary = {
  id: string;
  title: string;
  totalPoints: number;
  criteriaCount: number;
  savedAt: string;
  updatedAt: string;
  isActive: boolean;
};

type Store = { activeId: string | null; rubrics: StoredRubric[] };

const EMPTY: Store = { activeId: null, rubrics: [] };

function isStore(value: unknown): value is Store {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<Store>;
  return Array.isArray(v.rubrics) && (v.activeId === null || typeof v.activeId === "string");
}

/*
 * React'in dış depo (external store) sözleşmesi: depo yalnızca yazma anında
 * değişir, bu yüzden anlık görüntüyü önbelleğe alıp aynı referansı döndürüyoruz.
 * Aksi halde useSyncExternalStore her render'da yeni nesne görüp sonsuz döngüye girer.
 */
let cache: Store | null = null;
/** Özet listesi her çağrıda yeni dizi üretmesin: referans kararlı olmalı. */
let listCache: RubricSummary[] | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  cache = null;
  listCache = null;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Aynı rubric'i başka bir sekmede değiştirmiş olabilir.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readRaw(): Store {
  // Gizli sekmede veya depolama kapalıyken localStorage erişimi hata fırlatabilir.
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    return isStore(parsed) ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
}

function read(): Store {
  if (cache === null) cache = readRaw();
  return cache;
}

function write(store: Store): void {
  cache = store;
  listCache = null;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Kota dolu veya depolama engelli: uygulama bu oturumda çalışmaya devam eder.
    console.warn("[rubric-store] Rubric tarayıcıya kaydedilemedi.");
  }
  emit();
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `r_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function getRubricSummaries(): RubricSummary[] {
  if (listCache !== null) return listCache;
  const store = read();
  listCache = [...store.rubrics]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((entry) => ({
      id: entry.id,
      title: entry.rubric.title,
      totalPoints: entry.rubric.totalPoints,
      criteriaCount: entry.rubric.criteria.length,
      savedAt: entry.savedAt,
      updatedAt: entry.updatedAt,
      isActive: entry.id === store.activeId,
    }));
  return listCache;
}

export function listRubrics(): { activeId: string | null; rubrics: RubricSummary[] } {
  return { activeId: read().activeId, rubrics: getRubricSummaries() };
}

export function getRubric(id: string): StoredRubric | null {
  return read().rubrics.find((r) => r.id === id) ?? null;
}

export function getActiveRubric(): StoredRubric | null {
  const store = read();
  return store.activeId ? (store.rubrics.find((r) => r.id === store.activeId) ?? null) : null;
}

export function saveRubric(rubric: Rubric, activate = true): StoredRubric {
  const store = read();
  const now = new Date().toISOString();
  const entry: StoredRubric = { id: newId(), savedAt: now, updatedAt: now, rubric };
  write({
    activeId: activate ? entry.id : store.activeId,
    rubrics: [...store.rubrics, entry],
  });
  return entry;
}

export function updateRubric(
  id: string,
  changes: { rubric?: Rubric; activate?: boolean },
): StoredRubric | null {
  const store = read();
  const existing = store.rubrics.find((r) => r.id === id);
  if (!existing) return null;

  const updated: StoredRubric = changes.rubric
    ? { ...existing, rubric: changes.rubric, updatedAt: new Date().toISOString() }
    : existing;

  write({
    activeId: changes.activate ? id : store.activeId,
    rubrics: store.rubrics.map((r) => (r.id === id ? updated : r)),
  });
  return updated;
}

export function deleteRubric(id: string): boolean {
  const store = read();
  if (!store.rubrics.some((r) => r.id === id)) return false;

  const rubrics = store.rubrics.filter((r) => r.id !== id);
  write({
    // Aktif rubric silindiyse en son güncellenen kayda geç.
    activeId:
      store.activeId === id
        ? ([...rubrics].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id ?? null)
        : store.activeId,
    rubrics,
  });
  return true;
}

/* ------------------------------- React kancaları ------------------------------- */

const NO_RUBRIC = null;
const NO_LIST: RubricSummary[] = [];

/** Sunucuda localStorage yok; ilk render boş görüntüyle yapılır. */
export function useActiveRubric(): StoredRubric | null {
  return useSyncExternalStore(subscribe, getActiveRubric, () => NO_RUBRIC);
}

export function useRubricList(): RubricSummary[] {
  return useSyncExternalStore(subscribe, getRubricSummaries, () => NO_LIST);
}

/** Sunucu render'ı ile tarayıcı render'ını ayırt eder (boş durumun yanıp sönmemesi için). */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
