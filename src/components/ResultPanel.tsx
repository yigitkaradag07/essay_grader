"use client";

import { useMemo, useState } from "react";
import type { GradeResponse } from "@/lib/client-api";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  cx,
} from "@/components/ui/primitives";

/* ----------------------------- Alıntı vurgusu ----------------------------- */

type Highlight = {
  start: number;
  end: number;
  type: "strength" | "weakness" | "neutral";
  criterion: string;
};

/**
 * Doğrulanmış alıntıları makale metni üzerinde işaretlemek için parçalara böler.
 * Çakışan alıntılarda ilk (en uzun) olan kazanır; iç içe vurgu HTML'i bozardı.
 */
function buildSegments(essay: string, highlights: Highlight[]) {
  const sorted = [...highlights]
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .filter((h, i, arr) => i === 0 || h.start >= arr[i - 1].end);

  const segments: Array<{ text: string; highlight: Highlight | null }> = [];
  let cursor = 0;
  for (const h of sorted) {
    if (h.start > cursor) {
      segments.push({ text: essay.slice(cursor, h.start), highlight: null });
    }
    segments.push({ text: essay.slice(h.start, h.end), highlight: h });
    cursor = h.end;
  }
  if (cursor < essay.length) {
    segments.push({ text: essay.slice(cursor), highlight: null });
  }
  return segments;
}

const HIGHLIGHT_STYLE: Record<Highlight["type"], string> = {
  strength: "bg-success-soft text-success",
  weakness: "bg-warning-soft text-warning",
  neutral: "bg-accent-soft text-accent",
};

/* --------------------------------- Panel ---------------------------------- */

export function ResultPanel({
  result,
  essay,
  studentName,
}: {
  result: GradeResponse;
  essay: string;
  studentName?: string;
}) {
  const [showEssay, setShowEssay] = useState(false);
  const [copied, setCopied] = useState(false);

  const highlights = useMemo<Highlight[]>(
    () =>
      result.criteria.flatMap((c) =>
        c.evidence
          .filter((e) => e.verified && e.startIndex !== null && e.endIndex !== null)
          .map((e) => ({
            start: e.startIndex as number,
            end: e.endIndex as number,
            type: e.type,
            criterion: c.name,
          })),
      ),
    [result],
  );

  const segments = useMemo(
    () => (showEssay ? buildSegments(essay, highlights) : []),
    [showEssay, essay, highlights],
  );

  const unverified = result.meta.quotesTotal - result.meta.quotesVerified;

  async function copySummary() {
    const header = studentName ? `${studentName} — ` : "";
    await navigator.clipboard.writeText(
      `${header}${result.overall.score}/${result.overall.maxScore}\n\n${result.studentSummary}`,
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Genel not */}
      <Card>
        <div className="flex flex-wrap items-center gap-6 p-5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-5xl font-semibold tracking-tight tabular-nums">
              {result.overall.score}
            </span>
            <span className="text-xl text-subtle">/ {result.overall.maxScore}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">%{result.overall.percentage}</Badge>
              {result.overall.letterGrade && <Badge>{result.overall.letterGrade}</Badge>}
              <Badge>{result.rubricTitle}</Badge>
            </div>
            {result.overall.verdict && (
              <p className="max-w-xl text-sm text-muted">{result.overall.verdict}</p>
            )}
          </div>
        </div>
      </Card>

      {/* Uyarılar — öğretmen sonucu paylaşmadan önce görmeli */}
      {result.meta.warnings.length > 0 && (
        <Alert tone="warning" title="Paylaşmadan önce kontrol edin">
          <ul className="list-disc space-y-0.5 pl-4">
            {result.meta.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Alert>
      )}

      {/* Kriterler */}
      <Card>
        <CardHeader
          title="Kriter değerlendirmesi"
          description={`${result.meta.quotesVerified}/${result.meta.quotesTotal} alıntı makale içinde doğrulandı`}
          action={
            <Button size="sm" onClick={() => setShowEssay((v) => !v)}>
              {showEssay ? "Makaleyi gizle" : "Alıntıları makalede göster"}
            </Button>
          }
        />

        {showEssay && (
          <div className="border-b border-border bg-surface-muted p-5">
            <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded bg-success-soft" /> güçlü yön
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded bg-warning-soft" /> gelişim alanı
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded bg-accent-soft" /> nötr
              </span>
            </div>
            <div className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-surface p-4 text-sm leading-relaxed">
              {segments.map((seg, i) =>
                seg.highlight ? (
                  <mark
                    key={i}
                    title={seg.highlight.criterion}
                    className={cx("rounded px-0.5", HIGHLIGHT_STYLE[seg.highlight.type])}
                  >
                    {seg.text}
                  </mark>
                ) : (
                  <span key={i}>{seg.text}</span>
                ),
              )}
            </div>
          </div>
        )}

        <div className="divide-y divide-border">
          {result.criteria.map((c) => (
            <CriterionBlock key={c.id} criterion={c} />
          ))}
        </div>
      </Card>

      {/* Öğrenci özeti */}
      <Card>
        <CardHeader
          title="Öğrenciyle paylaşılacak özet"
          description="Kopyalayıp öğrenciye doğrudan iletebilirsiniz."
          action={
            <Button size="sm" variant="primary" onClick={() => void copySummary()}>
              {copied ? "Kopyalandı" : "Kopyala"}
            </Button>
          }
        />
        <p className="whitespace-pre-wrap p-5 text-sm leading-relaxed">
          {result.studentSummary}
        </p>
      </Card>

      {/* Öğretmene özel */}
      {(result.teacherNotes || result.nextSteps.length > 0) && (
        <Card>
          <CardHeader
            title="Yalnızca öğretmen için"
            description="Bu bölüm öğrenci özetine dahil değildir."
          />
          <div className="space-y-4 p-5">
            {result.teacherNotes && (
              <p className="text-sm leading-relaxed text-muted">{result.teacherNotes}</p>
            )}
            {result.nextSteps.length > 0 && (
              <div>
                <p className="mb-1.5 text-[13px] font-medium">Sonraki taslak için</p>
                <ul className="list-disc space-y-1 pl-4 text-sm text-muted">
                  {result.nextSteps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}

      <p className="px-1 text-xs text-subtle">
        {result.meta.model} · {new Date(result.meta.gradedAt).toLocaleString("tr-TR")} ·{" "}
        {result.meta.essayWords} kelime
        {unverified > 0 && ` · ${unverified} alıntı doğrulanamadı`}
      </p>
    </div>
  );
}

/* ------------------------------ Kriter kartı ------------------------------ */

function CriterionBlock({ criterion }: { criterion: GradeResponse["criteria"][number] }) {
  const pct = criterion.maxScore > 0 ? (criterion.score / criterion.maxScore) * 100 : 0;

  return (
    <div className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{criterion.name}</h3>
        <div className="flex items-center gap-2">
          {criterion.level && <Badge>{criterion.level}</Badge>}
          <span className="font-mono text-sm tabular-nums">
            {criterion.score}
            <span className="text-subtle"> / {criterion.maxScore}</span>
          </span>
        </div>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <div
          className={cx(
            "h-full rounded-full",
            pct >= 80 ? "bg-success" : pct >= 50 ? "bg-accent" : "bg-warning",
          )}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>

      <p className="mt-3 text-sm leading-relaxed text-muted">{criterion.justification}</p>

      {criterion.evidence.length > 0 && (
        <ul className="mt-3 space-y-2">
          {criterion.evidence.map((e, i) => (
            <li
              key={i}
              className={cx(
                "rounded-lg border-l-2 bg-surface-muted px-3 py-2",
                e.type === "strength"
                  ? "border-success"
                  : e.type === "weakness"
                    ? "border-warning"
                    : "border-border-strong",
              )}
            >
              <p className="text-[13px] italic leading-relaxed">
                &ldquo;{e.quote}&rdquo;
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {!e.verified && (
                  <Badge tone="warning">Makalede birebir bulunamadı</Badge>
                )}
                {e.comment && <span className="text-xs text-subtle">{e.comment}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {(criterion.strengths.length > 0 || criterion.improvements.length > 0) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {criterion.strengths.length > 0 && (
            <div>
              <p className="text-xs font-medium text-success">Güçlü yönler</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[13px] text-muted">
                {criterion.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {criterion.improvements.length > 0 && (
            <div>
              <p className="text-xs font-medium text-warning">Geliştirilecekler</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[13px] text-muted">
                {criterion.improvements.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
