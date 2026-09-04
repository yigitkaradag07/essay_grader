"use client";

import { useRef, useState } from "react";
import { ShaderBackground } from "@/components/ui/shader-67130b9a";
import { RubricBar, RubricDialog } from "@/components/RubricPanel";
import { EssayPanel, type GradeOptions } from "@/components/EssayPanel";
import { ResultPanel } from "@/components/ResultPanel";
import { Alert, Card, CardHeader, Spinner } from "@/components/ui/primitives";
import {
  ApiRequestError,
  gradeEssay,
  type GradeProgress,
  type GradeResponse,
} from "@/lib/client-api";
import { useActiveRubric, useIsHydrated } from "@/lib/rubric-store";

export default function Home() {
  // Rubric'ler tarayıcıda saklanıyor; React dış depoya abone olup değişimi kendisi görür.
  const active = useActiveRubric();
  const hydrated = useIsHydrated();
  const [dialogOpen, setDialogOpen] = useState(false);

  const [result, setResult] = useState<GradeResponse | null>(null);
  const [gradedEssay, setGradedEssay] = useState("");
  const [studentName, setStudentName] = useState<string | undefined>();
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<GradeProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  async function handleGrade(options: GradeOptions) {
    if (!active) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setGrading(true);
    setError(null);
    setResult(null);
    setProgress(null);
    setGradedEssay(options.essay);
    setStudentName(options.studentName);

    try {
      const response = await gradeEssay(
        {
          rubric: active.rubric,
          essay: options.essay,
          essayTitle: options.essayTitle,
          language: options.language,
          strictness: options.strictness,
        },
        { signal: controller.signal, onProgress: setProgress },
      );
      setResult(response);
      // Sonuç makale panelinin altında kalıyor; öğretmeni oraya götür.
      requestAnimationFrame(() =>
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Notlandırma sırasında beklenmeyen bir hata oluştu.",
      );
    } finally {
      if (!controller.signal.aborted) {
        setGrading(false);
        setProgress(null);
      }
    }
  }

  function cancelGrading() {
    abortRef.current?.abort();
    abortRef.current = null;
    setGrading(false);
    setProgress(null);
  }

  return (
    <div className="flex min-h-full flex-col">
      {/* Hero: shader yalnızca burada — çalışma yüzeyinin okunurluğunu bozmuyor. */}
      <header className="relative isolate overflow-hidden bg-black">
        <ShaderBackground className="absolute inset-0" />
        {/* Filamentler yer yer çok parlıyor; başlık kontrastını garantilemek için perde. */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/20" />
        <div className="relative mx-auto w-full max-w-4xl px-6 py-16 sm:py-20">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Essay Grader
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75 sm:text-base">
            Kendi rubric&apos;inize göre makale değerlendirir, verdiği her puanı makaleden
            alıntılarla gerekçelendirir ve öğrenciyle paylaşabileceğiniz kısa bir özet üretir.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 px-6 py-8">
        <RubricBar
          active={active}
          loading={!hydrated}
          onOpen={() => setDialogOpen(true)}
        />

        <EssayPanel
          disabled={!active}
          busy={grading}
          onGrade={(options) => void handleGrade(options)}
          onCancel={cancelGrading}
        />

        {error && (
          <Alert tone="danger" title="Notlandırma başarısız">
            {error}
          </Alert>
        )}

        {grading && (
          <Card>
            <CardHeader step={3} title="Değerlendirme" />
            <div className="space-y-3 p-5">
              <div className="flex items-center gap-3 text-sm text-muted">
                <Spinner />
                {progress
                  ? `${progress.label} değerlendirildi (${progress.done}/${progress.total})`
                  : "Makale kriterlere göre okunuyor ve alıntılar doğrulanıyor…"}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-500"
                  style={{
                    width: progress ? `${(progress.done / progress.total) * 100}%` : "6%",
                  }}
                />
              </div>
            </div>
          </Card>
        )}

        <div ref={resultRef} className="scroll-mt-4">
          {result && !grading && (
            <ResultPanel result={result} essay={gradedEssay} studentName={studentName} />
          )}
        </div>
      </main>

      {dialogOpen && (
        <RubricDialog active={active} onClose={() => setDialogOpen(false)} />
      )}
    </div>
  );
}
