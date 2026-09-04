"use client";

import { useEffect, useState } from "react";
import type { Rubric } from "@/lib/schema";
import {
  deleteRubric,
  saveRubric,
  updateRubric,
  useRubricList,
  type StoredRubric,
} from "@/lib/rubric-store";
import { ApiRequestError, defaultRubric, parseRubric } from "@/lib/client-api";
import { FileDropzone } from "@/components/FileDropzone";
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Label,
  Textarea,
  cx,
} from "@/components/ui/primitives";

type Tab = "saved" | "new" | "edit";

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiRequestError ? err.message : fallback;
}

/* ------------------------- Aktif rubric özet çubuğu ------------------------ */

export function RubricBar({
  active,
  loading,
  onOpen,
}: {
  active: StoredRubric | null;
  loading: boolean;
  onOpen: () => void;
}) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-subtle">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">
            1
          </span>
          Aktif rubric
        </p>
        {loading ? (
          <p className="mt-1 text-sm text-muted">Yükleniyor…</p>
        ) : active ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="truncate text-[15px] font-semibold">{active.rubric.title}</p>
            <Badge tone="accent">{active.rubric.totalPoints} puan</Badge>
            <Badge>{active.rubric.criteria.length} kriter</Badge>
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted">
            Henüz rubric yok — makaleyi notlandırmadan önce bir tane yükleyin.
          </p>
        )}
      </div>
      <Button variant={active ? "secondary" : "primary"} onClick={onOpen}>
        {active ? "Değiştir" : "Rubric yükle"}
      </Button>
    </Card>
  );
}

/* ------------------------------ Rubric paneli ----------------------------- */

export function RubricDialog({
  active,
  onClose,
}: {
  active: StoredRubric | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(active ? "saved" : "new");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tabs: Array<{ id: Tab; label: string; disabled?: boolean }> = [
    { id: "saved", label: "Kayıtlı rubric'ler" },
    { id: "new", label: "Yeni yükle" },
    { id: "edit", label: "Aktif olanı düzenle", disabled: !active },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rubric ayarları"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 sm:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="w-full max-w-3xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-[15px] font-semibold tracking-tight">Rubric</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Kapat">
            Kapat
          </Button>
        </div>

        <div className="flex gap-1 border-b border-border px-3 pt-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              disabled={t.disabled}
              onClick={() => setTab(t.id)}
              className={cx(
                "rounded-t-lg px-3 py-2 text-[13px] font-medium transition-colors",
                "disabled:cursor-not-allowed disabled:text-subtle",
                tab === t.id
                  ? "border-b-2 border-accent text-accent"
                  : "text-muted hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === "saved" && <SavedTab onClose={onClose} />}
          {tab === "new" && <NewTab onClose={onClose} />}
          {tab === "edit" && active && (
            // key: aktif rubric değişince taslak state'i sıfırdan kurulsun.
            <EditTab
              key={`${active.id}:${active.updatedAt}`}
              entry={active}
              onClose={onClose}
            />
          )}
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------- Kayıtlı rubric'ler --------------------------- */

function SavedTab({ onClose }: { onClose: () => void }) {
  const items = useRubricList();
  const [error, setError] = useState<string | null>(null);

  function activate(id: string) {
    setError(null);
    if (!updateRubric(id, { activate: true })) {
      setError("Rubric bulunamadı.");
      return;
    }
    onClose();
  }

  function remove(id: string, title: string) {
    if (!window.confirm(`"${title}" silinsin mi? Bu işlem geri alınamaz.`)) return;
    setError(null);
    deleteRubric(id);
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}

      {items.length === 0 && (
        <p className="text-sm text-muted">
          Henüz kayıtlı rubric yok. &ldquo;Yeni yükle&rdquo; sekmesinden ekleyin.
        </p>
      )}

      {items.map((item) => (
        <div
          key={item.id}
          className={cx(
            "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3",
            item.isActive ? "border-accent bg-accent-soft" : "border-border",
          )}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-medium">{item.title}</p>
              {item.isActive && <Badge tone="accent">Aktif</Badge>}
            </div>
            <p className="mt-0.5 text-xs text-subtle">
              {item.totalPoints} puan · {item.criteriaCount} kriter ·{" "}
              {new Date(item.updatedAt).toLocaleDateString("tr-TR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!item.isActive && (
              <Button size="sm" variant="primary" onClick={() => activate(item.id)}>
                Kullan
              </Button>
            )}
            <Button size="sm" variant="danger" onClick={() => remove(item.id, item.title)}>
              Sil
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------- Yeni rubric ------------------------------ */

function NewTab({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [sourceNote, setSourceNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<Rubric | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState<"parse" | "save" | "template" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    setBusy("parse");
    setError(null);
    setPreview(null);
    try {
      const result = await parseRubric(text);
      setPreview(result.rubric);
      setWarnings(result.warnings);
    } catch (err) {
      setError(errorText(err, "Rubric çözümlenemedi."));
    } finally {
      setBusy(null);
    }
  }

  async function loadTemplate() {
    setBusy("template");
    setError(null);
    try {
      const result = await defaultRubric();
      setPreview(result.rubric);
      setText(result.rubric.description);
      setSourceNote("Hazır şablon");
      setWarnings([]);
    } catch (err) {
      setError(errorText(err, "Şablon alınamadı."));
    } finally {
      setBusy(null);
    }
  }

  function save() {
    if (!preview) return;
    saveRubric(preview, true);
    onClose();
  }

  return (
    <div className="space-y-4">
      <FileDropzone
        kind="rubric"
        disabled={busy !== null}
        onExtracted={(res) => {
          setText(res.text);
          setPreview(null);
          setError(null);
          setSourceNote(
            `${res.filename} · ${res.words} kelime${
              res.format === "image" ? " · fotoğraftan okundu" : ""
            }`,
          );
          if (res.warnings.length) setWarnings(res.warnings);
        }}
      />

      <div>
        <div className="mb-1.5 flex items-end justify-between gap-2">
          <Label htmlFor="rubric-text">Rubric metni</Label>
          <Button
            variant="ghost"
            size="sm"
            loading={busy === "template"}
            onClick={() => void loadTemplate()}
          >
            Hazır şablonu kullan
          </Button>
        </div>
        <Textarea
          id="rubric-text"
          rows={8}
          value={text}
          placeholder="Rubric'i buraya yapıştırın veya yukarıdan dosya/fotoğraf yükleyin."
          onChange={(e) => {
            setText(e.target.value);
            setPreview(null);
          }}
        />
        {sourceNote && <p className="mt-1.5 text-xs text-subtle">{sourceNote}</p>}
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      {warnings.length > 0 && (
        <Alert tone="warning" title="Kontrol edin">
          <ul className="list-disc space-y-0.5 pl-4">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Alert>
      )}

      {preview && <RubricPreview rubric={preview} />}

      <div className="flex justify-end gap-2">
        {!preview ? (
          <Button
            variant="primary"
            loading={busy === "parse"}
            disabled={text.trim().length < 10}
            onClick={() => void analyze()}
          >
            Kriterleri çıkar
          </Button>
        ) : (
          <>
            <Button onClick={() => setPreview(null)}>Geri</Button>
            <Button variant="primary" onClick={save}>
              Kaydet ve kullan
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function RubricPreview({ rubric }: { rubric: Rubric }) {
  return (
    <div className="rounded-xl border border-border">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold">{rubric.title}</p>
        <p className="mt-0.5 text-xs text-subtle">
          Toplam {rubric.totalPoints} puan · {rubric.criteria.length} kriter
        </p>
      </div>
      <ul className="divide-y divide-border">
        {rubric.criteria.map((c) => (
          <li key={c.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-[13px] font-medium">{c.name}</p>
              {c.description && (
                <p className="mt-0.5 line-clamp-2 text-xs text-subtle">{c.description}</p>
              )}
            </div>
            <span className="shrink-0 font-mono text-[13px] text-muted">
              {c.maxScore} p · %{Math.round(c.weight * 100)}
            </span>
          </li>
        ))}
      </ul>
      {rubric.assumptions.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <p className="text-xs font-medium text-warning">Model şunları varsaydı:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted">
            {rubric.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Düzenleme -------------------------------- */

function EditTab({ entry, onClose }: { entry: StoredRubric; onClose: () => void }) {
  const [draft, setDraft] = useState<Rubric>(entry.rubric);
  const [error, setError] = useState<string | null>(null);

  const scoreSum = draft.criteria.reduce((s, c) => s + (c.maxScore || 0), 0);
  const mismatch = Math.abs(scoreSum - draft.totalPoints) > 0.5;

  function patchCriterion(index: number, patch: Partial<Rubric["criteria"][number]>) {
    setDraft((d) => ({
      ...d,
      criteria: d.criteria.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  }

  function save() {
    setError(null);
    if (!updateRubric(entry.id, { rubric: draft, activate: true })) {
      setError("Rubric bulunamadı.");
      return;
    }
    onClose();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <div>
          <Label htmlFor="rubric-title">Başlık</Label>
          <Input
            id="rubric-title"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="rubric-total">Toplam puan</Label>
          <Input
            id="rubric-total"
            type="number"
            min={1}
            value={draft.totalPoints}
            onChange={(e) =>
              setDraft({ ...draft, totalPoints: Number(e.target.value) || 0 })
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        {draft.criteria.map((c, i) => (
          <div key={c.id} className="rounded-xl border border-border p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_110px]">
              <Input
                aria-label={`${i + 1}. kriter adı`}
                value={c.name}
                onChange={(e) => patchCriterion(i, { name: e.target.value })}
              />
              <Input
                aria-label={`${c.name} maksimum puanı`}
                type="number"
                min={0}
                value={c.maxScore}
                onChange={(e) => patchCriterion(i, { maxScore: Number(e.target.value) || 0 })}
              />
            </div>
            <Textarea
              aria-label={`${c.name} açıklaması`}
              className="mt-2 text-[13px]"
              rows={2}
              value={c.description}
              placeholder="Bu kriter neyi ölçüyor?"
              onChange={(e) => patchCriterion(i, { description: e.target.value })}
            />
          </div>
        ))}
      </div>

      {mismatch && (
        <Alert tone="warning">
          Kriter puanlarının toplamı {scoreSum}, toplam puan {draft.totalPoints}. Kaydederken
          toplam puana göre otomatik ölçeklenecek.
        </Alert>
      )}
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex justify-end gap-2">
        <Button onClick={() => setDraft(entry.rubric)}>Sıfırla</Button>
        <Button variant="primary" onClick={save}>
          Kaydet
        </Button>
      </div>
    </div>
  );
}
