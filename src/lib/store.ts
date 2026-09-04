import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { rubricSchema, type Rubric } from "@/lib/schema";
import { z } from "zod";

/**
 * Kaydedilmiş rubric'ler. Öğretmen aynı rubric ile arka arkaya çok sayıda makale
 * değerlendirdiği için rubric kalıcı tutulur; arayüzdeki "rubric'i değiştir"
 * düğmesi buradaki aktif kaydı değiştirir.
 *
 * Depolama tek kullanıcılık yerel bir dosyadır (data/rubrics.json). Çok kullanıcılı
 * bir kuruluma geçilirse burası bir veritabanıyla değiştirilmelidir.
 */

const DATA_DIR = process.env.DATA_DIR?.trim() || path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "rubrics.json");

export const storedRubricSchema = z.object({
  id: z.string(),
  savedAt: z.string(),
  updatedAt: z.string(),
  rubric: rubricSchema,
});

const storeSchema = z.object({
  activeId: z.string().nullable().default(null),
  rubrics: z.array(storedRubricSchema).default([]),
});

export type StoredRubric = z.infer<typeof storedRubricSchema>;
type Store = z.infer<typeof storeSchema>;

const EMPTY: Store = { activeId: null, rubrics: [] };

/** Eşzamanlı yazmaların birbirini ezmemesi için basit sıraya alma. */
let writeChain: Promise<unknown> = Promise.resolve();

async function readStore(): Promise<Store> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = storeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn("[store] rubrics.json bozuk, boş depo ile devam ediliyor.");
      return EMPTY;
    }
    return parsed.data;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return EMPTY;
    throw err;
  }
}

async function writeStore(store: Store): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  // Yarım yazılmış dosya bırakmamak için geçici dosyaya yazıp yeniden adlandır.
  const tmp = `${STORE_PATH}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await rename(tmp, STORE_PATH);
}

function mutate<T>(fn: (store: Store) => Promise<[Store, T]> | [Store, T]): Promise<T> {
  const next = writeChain.then(async () => {
    const store = await readStore();
    const [updated, result] = await fn(store);
    await writeStore(updated);
    return result;
  });
  // Zincir bir hatada kopmasın.
  writeChain = next.catch(() => undefined);
  return next;
}

export type RubricSummary = {
  id: string;
  title: string;
  totalPoints: number;
  criteriaCount: number;
  savedAt: string;
  updatedAt: string;
  isActive: boolean;
};

function toSummary(entry: StoredRubric, activeId: string | null): RubricSummary {
  return {
    id: entry.id,
    title: entry.rubric.title,
    totalPoints: entry.rubric.totalPoints,
    criteriaCount: entry.rubric.criteria.length,
    savedAt: entry.savedAt,
    updatedAt: entry.updatedAt,
    isActive: entry.id === activeId,
  };
}

export async function listRubrics(): Promise<{
  activeId: string | null;
  rubrics: RubricSummary[];
}> {
  const store = await readStore();
  const rubrics = [...store.rubrics]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((r) => toSummary(r, store.activeId));
  return { activeId: store.activeId, rubrics };
}

export async function getRubric(id: string): Promise<StoredRubric | null> {
  const store = await readStore();
  return store.rubrics.find((r) => r.id === id) ?? null;
}

export async function getActiveRubric(): Promise<StoredRubric | null> {
  const store = await readStore();
  if (!store.activeId) return null;
  return store.rubrics.find((r) => r.id === store.activeId) ?? null;
}

export async function saveRubric(
  rubric: Rubric,
  activate = true,
): Promise<StoredRubric> {
  return mutate((store) => {
    const now = new Date().toISOString();
    const entry: StoredRubric = { id: randomUUID(), savedAt: now, updatedAt: now, rubric };
    return [
      {
        activeId: activate ? entry.id : store.activeId,
        rubrics: [...store.rubrics, entry],
      },
      entry,
    ];
  });
}

export async function updateRubric(
  id: string,
  changes: { rubric?: Rubric; activate?: boolean },
): Promise<StoredRubric | null> {
  return mutate((store) => {
    const existing = store.rubrics.find((r) => r.id === id);
    if (!existing) return [store, null];

    const updated: StoredRubric = changes.rubric
      ? { ...existing, rubric: changes.rubric, updatedAt: new Date().toISOString() }
      : existing;

    return [
      {
        activeId: changes.activate ? id : store.activeId,
        rubrics: store.rubrics.map((r) => (r.id === id ? updated : r)),
      },
      updated,
    ];
  });
}

export async function deleteRubric(id: string): Promise<boolean> {
  return mutate((store) => {
    if (!store.rubrics.some((r) => r.id === id)) return [store, false];
    const rubrics = store.rubrics.filter((r) => r.id !== id);
    return [
      {
        // Aktif rubric silindiyse en son güncellenen kayda geç.
        activeId:
          store.activeId === id
            ? ([...rubrics].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id ?? null)
            : store.activeId,
        rubrics,
      },
      true,
    ];
  });
}
