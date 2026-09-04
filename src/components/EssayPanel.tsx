"use client";

import { useState } from "react";
import { FileDropzone } from "@/components/FileDropzone";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui/primitives";

export type GradeOptions = {
  essay: string;
  essayTitle?: string;
  studentName?: string;
  language: string;
  strictness: "lenient" | "balanced" | "strict";
};

const STRICTNESS_HINT: Record<GradeOptions["strictness"], string> = {
  lenient: "Sınırdaki durumlarda üst seviyeye yuvarlar.",
  balanced: "Rubric tanımlarını olduğu gibi uygular.",
  strict: "Bir seviyeyi hak etmek için tüm koşullar karşılanmalı.",
};

export function EssayPanel({
  disabled,
  busy,
  onGrade,
  onCancel,
}: {
  /** Aktif rubric yoksa notlandırma yapılamaz. */
  disabled: boolean;
  busy: boolean;
  onGrade: (options: GradeOptions) => void;
  onCancel: () => void;
}) {
  const [essay, setEssay] = useState("");
  const [essayTitle, setEssayTitle] = useState("");
  const [studentName, setStudentName] = useState("");
  const [language, setLanguage] = useState("tr");
  const [strictness, setStrictness] = useState<GradeOptions["strictness"]>("strict");
  const [sourceNote, setSourceNote] = useState<string | null>(null);

  const words = essay.trim().split(/\s+/).filter(Boolean).length;
  const tooShort = essay.trim().length < 50;

  return (
    <Card>
      <CardHeader
        step={2}
        title="Makale"
        description="Öğrencinin makalesini yükleyin veya yapıştırın."
      />
      <div className="space-y-4 p-5">
        <FileDropzone
          kind="essay"
          disabled={busy}
          onExtracted={(res) => {
            setEssay(res.text);
            setSourceNote(
              `${res.filename} · ${res.words} kelime${
                res.pages ? ` · ${res.pages} sayfa` : ""
              }${res.format === "image" ? " · fotoğraftan okundu" : ""}`,
            );
            if (!essayTitle) {
              setEssayTitle(res.filename.replace(/\.[^.]+$/, ""));
            }
          }}
        />

        <div>
          <div className="mb-1.5 flex items-end justify-between gap-2">
            <Label htmlFor="essay-text">Makale metni</Label>
            {words > 0 && <span className="text-xs text-subtle">{words} kelime</span>}
          </div>
          <Textarea
            id="essay-text"
            rows={12}
            value={essay}
            disabled={busy}
            placeholder="Makaleyi buraya yapıştırın veya yukarıdan dosya yükleyin."
            onChange={(e) => {
              setEssay(e.target.value);
              setSourceNote(null);
            }}
          />
          {sourceNote && <p className="mt-1.5 text-xs text-subtle">{sourceNote}</p>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="essay-title">Makale başlığı (isteğe bağlı)</Label>
            <Input
              id="essay-title"
              value={essayTitle}
              disabled={busy}
              onChange={(e) => setEssayTitle(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="student-name">Öğrenci (isteğe bağlı)</Label>
            <Input
              id="student-name"
              value={studentName}
              disabled={busy}
              placeholder="Sadece raporda görünür"
              onChange={(e) => setStudentName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="strictness">Değerlendirme sıkılığı</Label>
            <Select
              id="strictness"
              value={strictness}
              disabled={busy}
              onChange={(e) =>
                setStrictness(e.target.value as GradeOptions["strictness"])
              }
            >
              <option value="lenient">Hoşgörülü</option>
              <option value="balanced">Dengeli</option>
              <option value="strict">Katı</option>
            </Select>
            <p className="mt-1 text-xs text-subtle">{STRICTNESS_HINT[strictness]}</p>
          </div>
          <div>
            <Label htmlFor="language">Geri bildirim dili</Label>
            <Select
              id="language"
              value={language}
              disabled={busy}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="tr">Türkçe</option>
              <option value="en">İngilizce</option>
            </Select>
            <p className="mt-1 text-xs text-subtle">
              Alıntılar makalenin kendi dilinde kalır.
            </p>
          </div>
        </div>

        {disabled && (
          <Alert tone="warning">
            Notlandırmadan önce yukarıdan bir rubric yükleyin.
          </Alert>
        )}

        <div className="flex items-center justify-end gap-2">
          {busy && <Button onClick={onCancel}>İptal</Button>}
          <Button
            variant="primary"
            loading={busy}
            disabled={disabled || tooShort}
            onClick={() =>
              onGrade({
                essay,
                essayTitle: essayTitle.trim() || undefined,
                studentName: studentName.trim() || undefined,
                language,
                strictness,
              })
            }
          >
            {busy ? "Değerlendiriliyor…" : "Notlandır"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
