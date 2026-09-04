"use client";

import { useId, useRef, useState } from "react";
import { extractFile, ApiRequestError, type ExtractResponse } from "@/lib/client-api";
import { Alert, Spinner, cx } from "@/components/ui/primitives";

const ACCEPT: Record<"essay" | "rubric", string> = {
  essay: ".txt,.md,.docx,.pdf,.jpg,.jpeg,.png,.webp",
  rubric: ".txt,.md,.docx,.pdf,.jpg,.jpeg,.png,.webp",
};

const HINT: Record<"essay" | "rubric", string> = {
  essay: "Word, PDF, metin dosyası veya fotoğraf",
  rubric: "Rubric fotoğrafı (JPEG/PNG), PDF, Word veya metin dosyası",
};

/**
 * Dosya/fotoğraf yükleyip metnini çıkarır. Sürükle-bırak ve tıklama destekler.
 * Metin çıkarma sunucuda yapılır (fotoğraflarda model görüşüyle).
 */
export function FileDropzone({
  kind,
  onExtracted,
  disabled,
}: {
  kind: "essay" | "rubric";
  onExtracted: (result: ExtractResponse) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setBusy(file.name);
    try {
      onExtracted(await extractFile(file, kind));
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Dosya okunurken bir hata oluştu.",
      );
    } finally {
      setBusy(null);
      // Aynı dosya tekrar seçilebilsin diye input sıfırlanır.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const isDisabled = disabled || busy !== null;

  return (
    <div>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          if (!isDisabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (isDisabled) return;
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        className={cx(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-4 py-6 text-center transition-colors",
          dragging
            ? "border-accent bg-accent-soft"
            : "border-border-strong bg-surface-muted hover:border-accent",
          isDisabled && "pointer-events-none opacity-60",
        )}
      >
        {busy ? (
          <span className="flex items-center gap-2 text-[13px] text-muted">
            <Spinner /> {busy} okunuyor…
          </span>
        ) : (
          <>
            <span className="text-[13px] font-medium">
              Dosyayı buraya sürükleyin veya <span className="text-accent">seçin</span>
            </span>
            <span className="text-xs text-subtle">{HINT[kind]} · en fazla 10 MB</span>
          </>
        )}
      </label>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT[kind]}
        className="sr-only"
        disabled={isDisabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {error && (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      )}
    </div>
  );
}
