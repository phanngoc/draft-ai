"use client";

import { useEffect, useRef } from "react";
import { Sparkles, Loader2, X, Sun, Stethoscope, ArrowUpRight } from "lucide-react";
import type { Critique, CritiqueIssue } from "@/lib/schema";
import { cn } from "@/lib/utils";

interface ButtonsProps {
  hasLayout: boolean;
  isStreaming: boolean;
  onWalkthrough: () => void;
  onCritique: () => void;
}

export function DesignerActionButtons({
  hasLayout,
  isStreaming,
  onWalkthrough,
  onCritique,
}: ButtonsProps) {
  const disabled = !hasLayout || isStreaming;
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onWalkthrough}
        disabled={disabled}
        title={
          !hasLayout
            ? "Generate a layout first"
            : "AI describes a day in this home"
        }
        className={cn(
          "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium transition",
          disabled
            ? "cursor-not-allowed border-neutral-200 text-neutral-400"
            : "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
        )}
      >
        <Sun size={12} /> Walkthrough
      </button>
      <button
        type="button"
        onClick={onCritique}
        disabled={disabled}
        title={
          !hasLayout
            ? "Generate a layout first"
            : "AI critiques the design like a senior architect"
        }
        className={cn(
          "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium transition",
          disabled
            ? "cursor-not-allowed border-neutral-200 text-neutral-400"
            : "border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100"
        )}
      >
        <Stethoscope size={12} /> Critique
      </button>
    </div>
  );
}

// =====================================================================
// Walkthrough overlay
// =====================================================================

interface WalkthroughProps {
  open: boolean;
  loading: boolean;
  narrative: string | null;
  error: string | null;
  onClose: () => void;
}

export function WalkthroughOverlay({
  open,
  loading,
  narrative,
  error,
  onClose,
}: WalkthroughProps) {
  if (!open) return null;
  return (
    <Overlay onClose={onClose}>
      <div className="border-b border-neutral-100 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-amber-900">
            <Sun size={14} />
            <span className="text-sm font-semibold">A day in this home</span>
            {loading && <Loader2 size={12} className="animate-spin" />}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-amber-900 hover:bg-amber-100"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="overflow-y-auto px-5 py-4 text-sm leading-relaxed text-neutral-800">
        {loading && !narrative && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-neutral-500">
            <Sparkles size={20} className="animate-pulse text-amber-500" />
            <div>Imagining a day in this home…</div>
          </div>
        )}
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}
        {narrative && <SimpleMarkdown text={narrative} />}
      </div>
    </Overlay>
  );
}

// =====================================================================
// Critique overlay
// =====================================================================

interface CritiqueProps {
  open: boolean;
  loading: boolean;
  critique: Critique | null;
  error: string | null;
  onClose: () => void;
  onApplyFix: (fix: string) => void;
}

export function CritiqueOverlay({
  open,
  loading,
  critique,
  error,
  onClose,
  onApplyFix,
}: CritiqueProps) {
  if (!open) return null;
  return (
    <Overlay onClose={onClose}>
      <div className="border-b border-neutral-100 bg-gradient-to-r from-rose-50 to-red-50 px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-rose-900">
            <Stethoscope size={14} />
            <span className="text-sm font-semibold">Architectural critique</span>
            {loading && <Loader2 size={12} className="animate-spin" />}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-rose-900 hover:bg-rose-100"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="overflow-y-auto px-4 py-3">
        {loading && !critique && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-neutral-500">
            <Sparkles size={20} className="animate-pulse text-rose-500" />
            <div>Reviewing the design…</div>
          </div>
        )}
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}
        {critique && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
              <ScoreBadge score={critique.score_out_of_10} />
              <div className="text-xs text-neutral-700">{critique.overall}</div>
            </div>
            {critique.issues.length === 0 ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                Nothing major to flag — clean design.
              </div>
            ) : (
              <ul className="space-y-2">
                {critique.issues.map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    onApplyFix={() => onApplyFix(issue.suggested_fix)}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Overlay>
  );
}

// =====================================================================
// Shared overlay shell
// =====================================================================

function Overlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-30 flex items-stretch justify-stretch bg-black/10 backdrop-blur-[2px]">
      <div
        ref={ref}
        className="m-3 flex max-h-full w-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl"
      >
        {children}
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 8
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : score >= 6
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : "bg-red-100 text-red-800 border-red-200";
  return (
    <div
      className={cn(
        "flex shrink-0 items-baseline gap-0.5 rounded-md border px-2 py-1 font-mono",
        color
      )}
    >
      <span className="text-base font-bold">{score.toFixed(0)}</span>
      <span className="text-[10px] opacity-70">/10</span>
    </div>
  );
}

function IssueCard({
  issue,
  onApplyFix,
}: {
  issue: CritiqueIssue;
  onApplyFix: () => void;
}) {
  const sevColor =
    issue.severity === "high"
      ? "border-red-200 bg-red-50"
      : issue.severity === "medium"
        ? "border-amber-200 bg-amber-50"
        : "border-neutral-200 bg-neutral-50";
  const sevTextColor =
    issue.severity === "high"
      ? "text-red-700"
      : issue.severity === "medium"
        ? "text-amber-700"
        : "text-neutral-600";
  return (
    <li className={cn("rounded-lg border p-3", sevColor)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider",
                sevTextColor,
                "bg-white"
              )}
            >
              {issue.severity}
            </span>
            <span className="text-sm font-semibold text-neutral-900">
              {issue.title}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-neutral-700">
            {issue.description}
          </p>
          {issue.affected_rooms.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {issue.affected_rooms.map((rid) => (
                <span
                  key={rid}
                  className="rounded bg-white px-1.5 py-0.5 font-mono text-[9px] text-neutral-600"
                >
                  {rid}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-white/70 px-2 py-1.5 text-xs">
        <div className="min-w-0 flex-1 text-neutral-700">
          <span className="font-medium text-neutral-900">Suggested fix: </span>
          <span className="italic">{issue.suggested_fix}</span>
        </div>
        <button
          type="button"
          onClick={onApplyFix}
          title="Use this as the next chat prompt"
          className="flex shrink-0 items-center gap-1 rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-neutral-800"
        >
          Apply <ArrowUpRight size={10} />
        </button>
      </div>
    </li>
  );
}

// Minimal markdown renderer: supports paragraphs, **bold**, *italic*, headings,
// and bullet lists. No external dep needed.
function SimpleMarkdown({ text }: { text: string }) {
  const blocks = text.split(/\n\n+/);
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        if (/^#{1,6}\s/.test(trimmed)) {
          const level = trimmed.match(/^#+/)?.[0].length ?? 1;
          const content = trimmed.replace(/^#+\s*/, "");
          const sizeClass =
            level === 1
              ? "text-base font-bold"
              : level === 2
                ? "text-sm font-semibold"
                : "text-sm font-medium";
          return (
            <div key={i} className={cn(sizeClass, "text-neutral-900")}>
              {renderInline(content)}
            </div>
          );
        }
        if (/^[-*]\s/.test(trimmed)) {
          const items = trimmed.split(/\n/).map((l) => l.replace(/^[-*]\s+/, ""));
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 text-neutral-800">
              {items.map((it, j) => (
                <li key={j}>{renderInline(it)}</li>
              ))}
            </ul>
          );
        }
        // Italic-only line (often used for the title line)
        if (/^\*[^*]+\*$/.test(trimmed)) {
          const inner = trimmed.slice(1, -1);
          return (
            <div key={i} className="italic text-neutral-600">
              {inner}
            </div>
          );
        }
        return (
          <p key={i} className="text-neutral-800">
            {renderInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  // **bold**, then *italic*
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      parts.push(
        <strong key={i++} className="font-semibold text-neutral-900">
          {tok.slice(2, -2)}
        </strong>
      );
    } else {
      parts.push(
        <em key={i++} className="italic">
          {tok.slice(1, -1)}
        </em>
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// State helper hook used by the page; keeps the panel logic out of the page file.
import { useCallback as _useCallback, useState as _useState } from "react";
export function useDesignerActions(opts: {
  walkthrough: (turnId: string) => Promise<string>;
  critique: (turnId: string) => Promise<Critique>;
}) {
  const [walkOpen, setWalkOpen] = _useState(false);
  const [walkLoading, setWalkLoading] = _useState(false);
  const [walkText, setWalkText] = _useState<string | null>(null);
  const [walkErr, setWalkErr] = _useState<string | null>(null);

  const [critOpen, setCritOpen] = _useState(false);
  const [critLoading, setCritLoading] = _useState(false);
  const [critData, setCritData] = _useState<Critique | null>(null);
  const [critErr, setCritErr] = _useState<string | null>(null);

  // Keep last turnId so re-fetches stay tied to the right version.
  const [walkTurnId, setWalkTurnId] = _useState<string | null>(null);
  const [critTurnId, setCritTurnId] = _useState<string | null>(null);

  const runWalkthrough = _useCallback(
    async (turnId: string) => {
      setWalkOpen(true);
      if (walkTurnId === turnId && walkText) return;
      setWalkLoading(true);
      setWalkErr(null);
      setWalkText(null);
      setWalkTurnId(turnId);
      try {
        const txt = await opts.walkthrough(turnId);
        setWalkText(txt);
      } catch (e) {
        setWalkErr(e instanceof Error ? e.message : "Failed");
      } finally {
        setWalkLoading(false);
      }
    },
    [opts, walkText, walkTurnId]
  );

  const runCritique = _useCallback(
    async (turnId: string) => {
      setCritOpen(true);
      if (critTurnId === turnId && critData) return;
      setCritLoading(true);
      setCritErr(null);
      setCritData(null);
      setCritTurnId(turnId);
      try {
        const c = await opts.critique(turnId);
        setCritData(c);
      } catch (e) {
        setCritErr(e instanceof Error ? e.message : "Failed");
      } finally {
        setCritLoading(false);
      }
    },
    [opts, critData, critTurnId]
  );

  // Invalidate cache when turn changes.
  const invalidate = _useCallback(() => {
    setWalkText(null);
    setWalkTurnId(null);
    setCritData(null);
    setCritTurnId(null);
  }, []);

  return {
    walkOpen,
    walkLoading,
    walkText,
    walkErr,
    closeWalk: () => setWalkOpen(false),
    runWalkthrough,
    critOpen,
    critLoading,
    critData,
    critErr,
    closeCrit: () => setCritOpen(false),
    runCritique,
    invalidate,
  };
}
