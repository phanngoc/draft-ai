"use client";

import { useEffect, useMemo, useRef, useState, use } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { toast } from "sonner";
import type { Footprint, Layout, Pin } from "@/lib/schema";
import { useProject, type ConvTurn } from "@/hooks/useProject";
import ConversationPanel from "@/components/draft/ConversationPanel";
import FloorPlan2D from "@/components/draft/FloorPlan2D";
import PinnedDecisions from "@/components/draft/PinnedDecisions";
import {
  CritiqueOverlay,
  DesignerActionButtons,
  WalkthroughOverlay,
  useDesignerActions,
} from "@/components/draft/DesignerActions";
import { diffLayouts, summarizeDiff } from "@/lib/diff";
import { pointsApproxEqual } from "@/lib/geometry";
import { cn } from "@/lib/utils";
import {
  Building2,
  ChevronLeft,
  FileCode,
  Layers,
  Box,
  Pencil,
  Check,
  GitCompareArrows,
  X,
  ArrowRight,
} from "lucide-react";

const DrawingCanvas = dynamic(
  () => import("@/components/draft/DrawingCanvas"),
  { ssr: false, loading: () => <CanvasSkeleton label="Loading canvas…" /> }
);
const Scene3D = dynamic(() => import("@/components/draft/Scene3D"), {
  ssr: false,
  loading: () => <CanvasSkeleton label="Loading 3D engine…" />,
});

type ResultTab = "2d" | "3d" | "json";

type PageProps = { params: Promise<{ id: string }> };

export default function ProjectStudioPage({ params }: PageProps) {
  const { id } = use(params);
  const [tab, setTab] = useState<ResultTab>("2d");
  const turnsLengthRef = useRef(0);
  const lastSavedFootprintRef = useRef<Footprint | null>(null);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [compareTurnId, setCompareTurnId] = useState<string | null>(null);
  const [prefillSignal, setPrefillSignal] = useState<{
    text: string;
    nonce: number;
  } | null>(null);

  // Measure the canvas wrapper so the Konva Stage adapts to whatever vertical
  // space the layout actually grants it (avoids overflow into the footer).
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });
  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      // Pad by 24px so the Konva canvas doesn't kiss the card border.
      const w = Math.max(280, Math.floor(rect.width - 24));
      const h = Math.max(280, Math.floor(rect.height - 24));
      setCanvasSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const {
    project,
    turns,
    currentTurn,
    currentTurnId,
    layout,
    isLoading,
    loadError,
    isStreaming,
    streamingTurnId,
    setFootprint,
    setTitle,
    setPins,
    walkthrough,
    critique,
    send,
    editTurn,
    restore,
    deleteTurn,
    clear,
  } = useProject(id);

  const designer = useDesignerActions({ walkthrough, critique });

  // When the active turn changes, drop cached walkthrough/critique
  useEffect(() => {
    designer.invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTurnId]);

  // A turn is "stale" if it was generated for a different footprint than the
  // current project footprint. Stale turns stay browsable but won't be sent
  // back to Claude as conversation context for new generations.
  const projectFootprint = project?.footprint ?? null;
  const staleTurnIds = useMemo(() => {
    const ids = new Set<string>();
    if (!projectFootprint) return ids;
    const cur = projectFootprint.points;
    for (const t of turns) {
      if (t.status !== "done" || !t.layout) continue;
      if (!pointsApproxEqual(t.layout.building.footprint, cur)) ids.add(t.id);
    }
    return ids;
  }, [turns, projectFootprint]);

  // Done turns (those with a usable layout) — used for compare picker
  const doneTurns = useMemo(
    () => turns.filter((t) => t.status === "done" && t.layout),
    [turns]
  );
  const compareTurn = useMemo(
    () => doneTurns.find((t) => t.id === compareTurnId) ?? null,
    [doneTurns, compareTurnId]
  );
  const compareLayout = compareTurn?.layout ?? null;
  const diff = useMemo(
    () => (compareLayout && layout ? diffLayouts(compareLayout, layout) : null),
    [compareLayout, layout]
  );
  const canCompare = doneTurns.length >= 2;

  function toggleCompare() {
    if (compareMode) {
      setCompareMode(false);
      return;
    }
    if (!canCompare) {
      toast.info("Need at least two completed turns to compare.");
      return;
    }
    // Default: pick the done turn just before the current one
    const curIdx = doneTurns.findIndex((t) => t.id === currentTurnId);
    const fallback =
      curIdx > 0 ? doneTurns[curIdx - 1] : doneTurns[doneTurns.length - 2] ?? doneTurns[0];
    setCompareTurnId(fallback.id);
    setCompareMode(true);
  }

  // Surface errors as toasts
  useEffect(() => {
    const errored = turns.filter((t) => t.status === "error");
    const last = errored[errored.length - 1];
    if (last && last.errorMessage) toast.error(last.errorMessage);
  }, [turns]);

  // Switch to 2D when a NEW turn finishes (not just when restoring)
  useEffect(() => {
    if (turns.length > turnsLengthRef.current) {
      setTab("2d");
    }
    turnsLengthRef.current = turns.length;
  }, [turns.length]);

  // Track last-saved footprint for diff detection
  useEffect(() => {
    if (project) lastSavedFootprintRef.current = project.footprint;
  }, [project]);

  function handleFootprintChange(f: Footprint | null) {
    const last = lastSavedFootprintRef.current;
    if (f === null && last === null) return;
    if (f && last && footprintsEqual(f, last)) return;

    setFootprint(f)
      .then(() => {
        lastSavedFootprintRef.current = f;
        const hadHistory = turns.length > 0;
        if (hadHistory && f && last && !footprintsEqual(f, last)) {
          toast.info(
            "Footprint changed. Earlier turns are kept in history but marked stale; new generations start fresh from this shape."
          );
        }
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Save failed"));
  }

  function onSend(prompt: string) {
    if (!project?.footprint) {
      toast.error("Draw a footprint first.");
      return;
    }
    send(prompt);
  }

  function onEditTurn(turnId: string, newPrompt: string) {
    if (!project?.footprint) {
      toast.error("Footprint missing.");
      return;
    }
    editTurn(turnId, newPrompt);
  }

  function onPinsChange(next: Pin[]) {
    setPins(next).catch((e) =>
      toast.error(e instanceof Error ? e.message : "Save failed")
    );
  }

  function applyFix(fixText: string) {
    setPrefillSignal({ text: fixText, nonce: Date.now() });
    designer.closeCrit();
    toast.info("Suggested fix loaded into the chat. Edit and Send when ready.");
  }

  function onWalkthroughClick() {
    if (!currentTurnId) return;
    void designer.runWalkthrough(currentTurnId);
  }

  function onCritiqueClick() {
    if (!currentTurnId) return;
    void designer.runCritique(currentTurnId);
  }

  function startTitleEdit() {
    if (!project) return;
    setTitleDraft(project.title);
    setTitleEditing(true);
  }
  function saveTitle() {
    if (!titleDraft.trim() || !project || titleDraft.trim() === project.title) {
      setTitleEditing(false);
      return;
    }
    setTitle(titleDraft.trim()).catch((e) =>
      toast.error(e instanceof Error ? e.message : "Save failed")
    );
    setTitleEditing(false);
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-neutral-500">
        Loading project…
      </div>
    );
  }
  if (loadError || !project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-sm text-red-700">{loadError ?? "Project not found"}</div>
        <Link
          href="/draft"
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white"
        >
          ← Back to projects
        </Link>
      </div>
    );
  }

  const showStreamingOverlay =
    isStreaming && (!layout || streamingTurnId === currentTurnId);

  return (
    <div className="flex h-screen min-h-0 flex-col bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/draft"
            className="flex shrink-0 items-center gap-2 text-neutral-700 hover:text-neutral-900"
          >
            <ChevronLeft size={16} />
            <Building2 size={18} className="text-emerald-600" />
            <span className="text-sm font-semibold tracking-tight">DraftedAI</span>
          </Link>
          <span className="shrink-0 text-neutral-300">·</span>
          {titleEditing ? (
            <div className="flex items-center gap-1">
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTitle();
                  if (e.key === "Escape") setTitleEditing(false);
                }}
                autoFocus
                className="w-64 rounded border border-neutral-300 px-2 py-0.5 text-sm focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={saveTitle}
                className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
              >
                <Check size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={startTitleEdit}
              className="group flex min-w-0 items-center gap-1 truncate text-sm font-medium text-neutral-800 hover:text-neutral-950"
              title="Click to rename"
            >
              <span className="truncate">{project.title}</span>
              <Pencil
                size={11}
                className="shrink-0 text-neutral-300 transition group-hover:text-neutral-600"
              />
            </button>
          )}
          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700">
            MVP
          </span>
        </div>
        <div className="text-[11px] text-neutral-500">
          {layout
            ? `${layout.rooms.length} rooms · ${layout.walls.length} walls · ${layout.windows.length} windows`
            : turns.length > 0
              ? "Generating…"
              : "Draw a shape, then describe your home"}
        </div>
      </header>

      <main className="flex min-h-0 flex-1 gap-3 p-3">
        <section className="flex w-[540px] shrink-0 flex-col gap-2">
          <PaneTitle icon={<Layers size={14} />} title="Step 1 — Draw your footprint" />
          <div
            ref={canvasContainerRef}
            className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-white p-3 shadow-sm"
          >
            {canvasSize.w > 0 && canvasSize.h > 0 && (
              <DrawingCanvas
                width={canvasSize.w}
                height={canvasSize.h}
                initialFootprint={project.footprint}
                onFootprintChange={handleFootprintChange}
              />
            )}
          </div>
          {currentTurn?.layout?.notes && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
              <span className="font-medium">Designer note: </span>
              {currentTurn.layout.notes}
            </div>
          )}
        </section>

        <section className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <PaneTitle icon={<FileCode size={14} />} title="Step 2 — Generated layout" />
            <div className="flex items-center gap-2">
              <DesignerActionButtons
                hasLayout={!!layout}
                isStreaming={isStreaming}
                onWalkthrough={onWalkthroughClick}
                onCritique={onCritiqueClick}
              />
              <button
                type="button"
                onClick={toggleCompare}
                disabled={!canCompare && !compareMode}
                title={
                  !canCompare
                    ? "Generate at least two layouts to enable compare"
                    : compareMode
                      ? "Exit compare mode"
                      : "Compare two versions side by side"
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium transition",
                  compareMode
                    ? "border-violet-300 bg-violet-100 text-violet-800"
                    : !canCompare
                      ? "cursor-not-allowed border-neutral-200 text-neutral-400"
                      : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                )}
              >
                <GitCompareArrows size={12} />
                {compareMode ? "Comparing" : "Compare"}
              </button>
              <div className="flex gap-1 rounded-lg border border-neutral-200 bg-white p-1">
                <TabBtn active={tab === "2d"} onClick={() => setTab("2d")}>
                  <Layers size={12} /> 2D Plan
                </TabBtn>
                <TabBtn active={tab === "3d"} onClick={() => setTab("3d")}>
                  <Box size={12} /> 3D View
                </TabBtn>
                <TabBtn active={tab === "json"} onClick={() => setTab("json")}>
                  <FileCode size={12} /> JSON
                </TabBtn>
              </div>
            </div>
          </div>

          {compareMode && layout && compareLayout && diff && (
            <CompareHeader
              doneTurns={doneTurns}
              compareTurn={compareTurn!}
              currentTurn={currentTurn}
              currentIndex={turns.findIndex((t) => t.id === currentTurnId)}
              onPickCompare={(id) => setCompareTurnId(id)}
              onClose={() => setCompareMode(false)}
              diffSummary={summarizeDiff(diff)}
            />
          )}

          {currentTurn && staleTurnIds.has(currentTurn.id) && layout && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-900">
              <span>
                <span className="font-semibold">Stale version:</span> this layout was generated
                for a previous footprint shape. View-only — new edits won&apos;t use it as context.
              </span>
            </div>
          )}

          <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
            {!layout && !showStreamingOverlay && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100">
                  <Building2 size={24} className="text-neutral-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-neutral-700">No layout yet</div>
                  <div className="mt-1 max-w-sm text-xs text-neutral-500">
                    Draw a footprint, describe your home in the chat below, then hit Send.
                  </div>
                </div>
              </div>
            )}
            {showStreamingOverlay && currentTurn && (
              <GeneratingOverlay
                partialChars={currentTurn.partialChars}
                isEdit={turns.length > 1}
                prompt={currentTurn.prompt}
              />
            )}
            {layout && !compareMode && tab === "2d" && (
              <div className="h-full p-2">
                <FloorPlan2D layout={layout} />
              </div>
            )}
            {layout && !compareMode && tab === "3d" && (
              <div className="h-full p-2">
                <Scene3D layout={layout} />
              </div>
            )}
            {layout && !compareMode && tab === "json" && <JsonView layout={layout} />}
            {layout && compareMode && compareLayout && diff && (
              <SplitCompareView
                tab={tab}
                beforeLayout={compareLayout}
                afterLayout={layout}
                beforeBadge={`v${doneTurns.findIndex((t) => t.id === compareTurnId) >= 0 ? turns.findIndex((t) => t.id === compareTurnId) + 1 : 1}`}
                afterBadge={
                  currentTurnId
                    ? `v${turns.findIndex((t) => t.id === currentTurnId) + 1}`
                    : "current"
                }
                diff={diff}
              />
            )}
            <WalkthroughOverlay
              open={designer.walkOpen}
              loading={designer.walkLoading}
              narrative={designer.walkText}
              error={designer.walkErr}
              onClose={designer.closeWalk}
            />
            <CritiqueOverlay
              open={designer.critOpen}
              loading={designer.critLoading}
              critique={designer.critData}
              error={designer.critErr}
              onClose={designer.closeCrit}
              onApplyFix={applyFix}
            />
          </div>
        </section>
      </main>

      <footer className="flex flex-col gap-2 border-t border-neutral-200 bg-neutral-50 px-3 py-3">
        <PinnedDecisions
          pins={project.pins}
          onChange={onPinsChange}
          disabled={isStreaming}
        />
        <ConversationPanel
          turns={turns}
          currentTurnId={currentTurnId}
          isStreaming={isStreaming}
          hasFootprint={!!project.footprint}
          staleTurnIds={staleTurnIds}
          prefillSignal={prefillSignal}
          onSend={onSend}
          onEditTurn={onEditTurn}
          onRestore={restore}
          onClear={clear}
          onDeleteTurn={deleteTurn}
        />
      </footer>
    </div>
  );
}

function footprintsEqual(a: Footprint, b: Footprint): boolean {
  if (a.points.length !== b.points.length) return false;
  for (let i = 0; i < a.points.length; i++) {
    if (a.points[i][0] !== b.points[i][0] || a.points[i][1] !== b.points[i][1]) return false;
  }
  return true;
}

function CanvasSkeleton({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-neutral-200 bg-neutral-50 text-xs text-neutral-400">
      {label}
    </div>
  );
}

function PaneTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
      {icon} {title}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition",
        active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
      )}
    >
      {children}
    </button>
  );
}

function GeneratingOverlay({
  partialChars,
  isEdit,
  prompt,
}: {
  partialChars: number;
  isEdit: boolean;
  prompt: string;
}) {
  const phasesNew = [
    "Analyzing footprint…",
    "Sizing rooms…",
    "Placing walls…",
    "Adding doors and windows…",
    "Arranging furniture…",
    "Finalizing…",
  ];
  const phasesEdit = [
    "Reading current layout…",
    "Locating affected rooms…",
    "Applying changes…",
    "Validating geometry…",
    "Finalizing…",
  ];
  const phases = isEdit ? phasesEdit : phasesNew;
  const idx = Math.min(phases.length - 1, Math.floor(partialChars / 600));
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/85 backdrop-blur">
      <div className="relative flex h-12 w-12 items-center justify-center">
        <div className="absolute inset-0 animate-ping rounded-full bg-emerald-200/60" />
        <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
          <Building2 size={20} className="text-emerald-700" />
        </div>
      </div>
      <div className="text-sm font-medium text-neutral-800">{phases[idx]}</div>
      <div className="max-w-sm truncate px-4 text-xs italic text-neutral-500" title={prompt}>
        “{prompt}”
      </div>
      <div className="h-1 w-48 overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{ width: `${Math.min(100, (partialChars / 3500) * 100)}%` }}
        />
      </div>
      <div className="font-mono text-[10px] text-neutral-400">{partialChars} chars streamed</div>
    </div>
  );
}

function JsonView({ layout }: { layout: Layout }) {
  return (
    <pre className="h-full overflow-auto bg-neutral-900 p-4 font-mono text-[11px] leading-relaxed text-neutral-100">
      {JSON.stringify(layout, null, 2)}
    </pre>
  );
}

function CompareHeader({
  doneTurns,
  compareTurn,
  currentTurn,
  currentIndex,
  onPickCompare,
  onClose,
  diffSummary,
}: {
  doneTurns: ConvTurn[];
  compareTurn: ConvTurn;
  currentTurn: ConvTurn | null;
  currentIndex: number;
  onPickCompare: (id: string) => void;
  onClose: () => void;
  diffSummary: string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs">
      <span className="font-medium text-violet-900">Comparing</span>
      <select
        value={compareTurn.id}
        onChange={(e) => onPickCompare(e.target.value)}
        className="rounded border border-violet-300 bg-white px-1.5 py-0.5 text-[11px] focus:outline-none"
        title="Pick the version to compare against"
      >
        {doneTurns.map((t, i) => (
          <option key={t.id} value={t.id}>
            v{i + 1} — {t.prompt.slice(0, 40)}
          </option>
        ))}
      </select>
      <ArrowRight size={12} className="text-violet-700" />
      <span className="rounded bg-violet-200 px-1.5 py-0.5 font-mono text-[10px] text-violet-900">
        v{currentIndex + 1} {currentTurn ? `· ${truncate(currentTurn.prompt, 30)}` : ""}
      </span>
      <span className="text-violet-300">·</span>
      <div className="flex flex-wrap items-center gap-1">
        {diffSummary.map((s, i) => (
          <span
            key={i}
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px]",
              s.startsWith("+")
                ? "bg-emerald-100 text-emerald-800"
                : s.startsWith("−") || s.startsWith("-")
                  ? "bg-red-100 text-red-800"
                  : "bg-neutral-200 text-neutral-700"
            )}
          >
            {s}
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="ml-auto rounded p-1 text-violet-700 hover:bg-violet-100"
        title="Exit compare mode"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function SplitCompareView({
  tab,
  beforeLayout,
  afterLayout,
  beforeBadge,
  afterBadge,
  diff,
}: {
  tab: ResultTab;
  beforeLayout: Layout;
  afterLayout: Layout;
  beforeBadge: string;
  afterBadge: string;
  diff: ReturnType<typeof diffLayouts>;
}) {
  const changedIds = new Set([
    ...diff.addedRooms.map((r) => r.id),
    ...diff.removedRooms.map((r) => r.id),
    ...diff.changedRooms.map((c) => c.id),
  ]);
  return (
    <div className="grid h-full grid-cols-2 gap-2 p-2">
      <ComparePane
        badge={beforeBadge}
        badgeColor="border-neutral-300 bg-neutral-100 text-neutral-700"
        layout={beforeLayout}
        tab={tab}
        highlightIds={changedIds}
        side="before"
      />
      <ComparePane
        badge={afterBadge}
        badgeColor="border-violet-300 bg-violet-100 text-violet-800"
        layout={afterLayout}
        tab={tab}
        highlightIds={changedIds}
        side="after"
      />
    </div>
  );
}

function ComparePane({
  badge,
  badgeColor,
  layout,
  tab,
  side,
}: {
  badge: string;
  badgeColor: string;
  layout: Layout;
  tab: ResultTab;
  highlightIds: Set<string>;
  side: "before" | "after";
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div
        className={cn(
          "absolute top-2 left-2 z-20 rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider shadow-sm",
          badgeColor
        )}
      >
        {side === "before" ? "Before" : "After"} · {badge}
      </div>
      <div className="h-full">
        {tab === "2d" && <FloorPlan2D layout={layout} />}
        {tab === "3d" && <Scene3D layout={layout} />}
        {tab === "json" && (
          <pre className="h-full overflow-auto bg-neutral-900 p-3 font-mono text-[10px] leading-relaxed text-neutral-100">
            {JSON.stringify(layout, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
