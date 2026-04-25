"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  Sparkles,
  Loader2,
  RotateCcw,
  Eye,
  Pencil,
  X,
  AlertCircle,
  Check,
  Trash2,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConvTurn } from "@/hooks/useProject";

interface Props {
  turns: ConvTurn[];
  currentTurnId: string | null;
  isStreaming: boolean;
  hasFootprint: boolean;
  staleTurnIds?: Set<string>;
  prefillSignal?: { text: string; nonce: number } | null;
  onSend: (prompt: string) => void;
  onEditTurn: (turnId: string, newPrompt: string) => void;
  onRestore: (turnId: string) => void;
  onClear: () => void;
  onDeleteTurn?: (turnId: string) => void;
}

const SUGGESTIONS = [
  "modern 3-bedroom family home with open kitchen and a home office",
  "compact studio with a cozy reading nook by the window",
  "Japanese-style minimalist house, 2 bedrooms, en-suite bathroom",
  "bungalow with master suite, guest room, and large covered patio",
];

const FOLLOW_UP_SUGGESTIONS = [
  "make the master bedroom larger",
  "add a TV in the living room",
  "swap the kitchen and bathroom positions",
  "add another window on the south wall",
];

export default function ConversationPanel({
  turns,
  currentTurnId,
  isStreaming,
  hasFootprint,
  staleTurnIds,
  prefillSignal,
  onSend,
  onEditTurn,
  onRestore,
  onClear,
  onDeleteTurn,
}: Props) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const editingTurn = useMemo(
    () => (editingId ? turns.find((t) => t.id === editingId) ?? null : null),
    [editingId, turns]
  );

  const lastDoneTurn = useMemo(
    () => [...turns].reverse().find((t) => t.status === "done") ?? null,
    [turns]
  );

  // Auto-scroll history to the active turn
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-turn-id="${currentTurnId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [currentTurnId, turns.length]);

  // External prefill (e.g. critique "Apply fix" button)
  useEffect(() => {
    if (!prefillSignal) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(prefillSignal.text);
    setEditingId(null);
    requestAnimationFrame(() => {
      taRef.current?.focus();
      taRef.current?.setSelectionRange(
        prefillSignal.text.length,
        prefillSignal.text.length
      );
    });
  }, [prefillSignal]);

  function startEdit(turn: ConvTurn) {
    setEditingId(turn.id);
    setDraft(turn.prompt);
    requestAnimationFrame(() => taRef.current?.focus());
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft("");
  }

  function submit() {
    const trimmed = draft.trim();
    if (!trimmed || !hasFootprint || isStreaming) return;
    if (editingId) {
      onEditTurn(editingId, trimmed);
      setEditingId(null);
    } else {
      onSend(trimmed);
    }
    setDraft("");
  }

  function variant() {
    if (!lastDoneTurn || !hasFootprint || isStreaming) return;
    onSend(lastDoneTurn.prompt);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape" && editingId) {
      cancelEdit();
    }
  }

  const disabled = !hasFootprint || draft.trim().length === 0 || isStreaming;
  const disabledReason = !hasFootprint
    ? "Draw a footprint on the canvas first."
    : draft.trim().length === 0
      ? "Type a message."
      : isStreaming
        ? "Wait for the current generation to finish."
        : null;

  const sendLabel = editingId ? "Save edit" : turns.length === 0 ? "Generate" : "Send";

  const suggestions = turns.length === 0 ? SUGGESTIONS : FOLLOW_UP_SUGGESTIONS;

  return (
    <div className="flex flex-col gap-2">
      {/* History */}
      {turns.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            <span className="flex items-center gap-1.5">
              <MessageCircle size={12} /> Conversation · {turns.length} {turns.length === 1 ? "turn" : "turns"}
            </span>
            <button
              type="button"
              onClick={() => {
                if (confirm("Clear the entire conversation? The footprint stays.")) {
                  onClear();
                  cancelEdit();
                }
              }}
              className="flex items-center gap-1 rounded text-neutral-500 hover:text-red-600"
              title="Clear conversation"
            >
              <Trash2 size={12} /> Clear
            </button>
          </div>
          <div ref={listRef} className="max-h-40 overflow-y-auto p-1.5">
            {turns.map((turn, i) => (
              <TurnRow
                key={turn.id}
                turn={turn}
                index={i + 1}
                active={turn.id === currentTurnId}
                editing={turn.id === editingId}
                stale={staleTurnIds?.has(turn.id) ?? false}
                onRestore={() => onRestore(turn.id)}
                onEdit={() => startEdit(turn)}
                onRetry={() => onSend(turn.prompt)}
                onDelete={
                  onDeleteTurn
                    ? () => {
                        if (
                          confirm(
                            `Delete turn ${i + 1}? Earlier and later turns are kept; the gap is closed.`
                          )
                        ) {
                          onDeleteTurn(turn.id);
                          if (turn.id === editingId) cancelEdit();
                        }
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        {editingTurn && (
          <div className="flex items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-900">
            <span className="flex items-center gap-1.5">
              <Pencil size={12} />
              Editing turn {turns.findIndex((t) => t.id === editingId) + 1}. Saving will discard later turns.
            </span>
            <button
              type="button"
              onClick={cancelEdit}
              className="flex items-center gap-1 rounded text-amber-900 hover:text-amber-700"
            >
              <X size={12} /> Cancel
            </button>
          </div>
        )}
        <div className="flex items-start gap-2 p-2">
          <div className="flex-1">
            <textarea
              ref={taRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={onKey}
              rows={2}
              placeholder={
                turns.length === 0
                  ? "Describe your dream home — e.g. 'Modern 3-bedroom house with open kitchen'"
                  : "Refine your design — e.g. 'add a TV in the living room' or 'make the master bigger'"
              }
              className="w-full resize-none rounded-md border border-transparent bg-transparent px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-200 focus:outline-none"
              maxLength={2000}
            />
            {focused && !draft && turns.length === 0 && (
              <div className="flex flex-wrap gap-1 px-3 pb-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setDraft(s);
                    }}
                    className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] text-neutral-600 hover:bg-neutral-100"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={submit}
              disabled={disabled}
              title={disabledReason ?? undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition",
                disabled
                  ? "cursor-not-allowed bg-neutral-100 text-neutral-400"
                  : editingId
                    ? "bg-amber-600 text-white hover:bg-amber-700"
                    : "bg-neutral-900 text-white hover:bg-neutral-800"
              )}
            >
              {isStreaming ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Working
                </>
              ) : editingId ? (
                <>
                  <Check size={14} /> {sendLabel}
                </>
              ) : (
                <>
                  <Sparkles size={14} /> {sendLabel}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={variant}
              disabled={!lastDoneTurn || isStreaming || !hasFootprint}
              title="Regenerate with the most recent prompt"
              className={cn(
                "flex items-center justify-center gap-1 rounded-md border px-3 py-1.5 text-xs transition",
                !lastDoneTurn || isStreaming || !hasFootprint
                  ? "cursor-not-allowed border-neutral-200 text-neutral-400"
                  : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"
              )}
            >
              <RotateCcw size={12} /> Variant
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-neutral-100 px-3 py-1.5 text-[11px] text-neutral-500">
          <span>
            {disabledReason && draft.length === 0 && !hasFootprint ? (
              <span className="font-medium text-amber-700">⚠ {disabledReason}</span>
            ) : (
              <>
                <span className="font-medium text-neutral-700">Enter</span> to send · {draft.length}/2000
              </>
            )}
          </span>
          <span className="text-neutral-400">DraftedAI · Claude Sonnet 4.6</span>
        </div>
      </div>
    </div>
  );
}

function TurnRow({
  turn,
  index,
  active,
  editing,
  stale,
  onRestore,
  onEdit,
  onRetry,
  onDelete,
}: {
  turn: ConvTurn;
  index: number;
  active: boolean;
  editing: boolean;
  stale: boolean;
  onRestore: () => void;
  onEdit: () => void;
  onRetry: () => void;
  onDelete?: () => void;
}) {
  const duration =
    turn.completedAt && turn.startedAt
      ? `${((turn.completedAt - turn.startedAt) / 1000).toFixed(1)}s`
      : null;
  const isError = turn.status === "error";

  return (
    <div
      data-turn-id={turn.id}
      className={cn(
        "group rounded-md transition",
        active && !isError ? "bg-emerald-50" : "",
        isError ? "bg-red-50" : "",
        !active && !isError && "hover:bg-neutral-50",
        editing && "ring-2 ring-amber-300"
      )}
    >
      <div className="flex items-center gap-2 px-2 py-1.5 text-xs">
        <button
          type="button"
          onClick={onRestore}
          title="View this version"
          className={cn(
            "flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
            isError
              ? "bg-red-600 text-white"
              : active
                ? "bg-emerald-600 text-white"
                : "bg-neutral-100 text-neutral-600"
          )}
        >
          v{index}
        </button>
        {stale && (
          <span
            className="shrink-0 rounded bg-amber-100 px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-800"
            title="Generated for a previous footprint shape — view-only"
          >
            stale
          </span>
        )}
        <div
          className="flex-1 cursor-pointer truncate text-neutral-800"
          onClick={onRestore}
          title={turn.prompt}
        >
          {turn.prompt}
        </div>
        <div className="shrink-0 text-[10px] text-neutral-500">
          {turn.status === "streaming" && (
            <span className="flex items-center gap-1 font-mono text-emerald-700">
              <Loader2 size={10} className="animate-spin" /> {turn.partialChars}
            </span>
          )}
          {turn.status === "done" && (
            <span className="flex items-center gap-1 font-mono text-neutral-500">
              <Check size={10} className="text-emerald-600" /> {duration}
            </span>
          )}
          {turn.status === "error" && (
            <span className="flex items-center gap-1 font-mono text-red-700">
              <AlertCircle size={10} /> error
            </span>
          )}
        </div>
        <div
          className={cn(
            "flex shrink-0 items-center gap-0.5 transition",
            isError ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          <button
            type="button"
            onClick={onRestore}
            title="View this version"
            className="rounded p-1 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900"
          >
            <Eye size={12} />
          </button>
          <button
            type="button"
            onClick={onEdit}
            title="Edit this turn (later turns will be discarded)"
            className="rounded p-1 text-neutral-500 hover:bg-amber-100 hover:text-amber-700"
          >
            <Pencil size={12} />
          </button>
          {isError && (
            <button
              type="button"
              onClick={onRetry}
              title="Try again with the same prompt"
              className="rounded p-1 text-red-700 hover:bg-red-100"
            >
              <RotateCcw size={12} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              title="Delete this turn"
              className="rounded p-1 text-neutral-500 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
      {isError && turn.errorMessage && (
        <div className="border-t border-red-200 bg-red-50 px-3 py-1.5 text-[11px] text-red-800">
          <span className="font-medium">Why it failed:</span> {turn.errorMessage}
        </div>
      )}
    </div>
  );
}
