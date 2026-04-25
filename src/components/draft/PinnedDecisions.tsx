"use client";

import { useState, type KeyboardEvent } from "react";
import { Pin as PinIcon, Plus, X, Check, Ban } from "lucide-react";
import type { Pin } from "@/lib/schema";
import { cn } from "@/lib/utils";

interface Props {
  pins: Pin[];
  onChange: (pins: Pin[]) => void;
  disabled?: boolean;
}

const PIN_SUGGESTIONS = [
  { kind: "include" as const, text: "Always include a covered patio" },
  { kind: "include" as const, text: "Master suite must have an en-suite bath" },
  { kind: "include" as const, text: "South-facing windows in living areas" },
  { kind: "avoid" as const, text: "No bathroom opening into the kitchen" },
  { kind: "avoid" as const, text: "No bedroom on the entry side" },
];

function uid() {
  return `pin_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36).slice(-3)}`;
}

export default function PinnedDecisions({ pins, onChange, disabled }: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftKind, setDraftKind] = useState<"include" | "avoid">("include");

  function commit() {
    const text = draft.trim();
    if (!text) return;
    onChange([...pins, { id: uid(), text, kind: draftKind }]);
    setDraft("");
    setAdding(false);
  }

  function remove(id: string) {
    onChange(pins.filter((p) => p.id !== id));
  }

  function toggleKind(id: string) {
    onChange(
      pins.map((p) =>
        p.id === id ? { ...p, kind: p.kind === "include" ? "avoid" : "include" } : p
      )
    );
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      setAdding(false);
      setDraft("");
    }
  }

  const showSuggestions = pins.length === 0 && !adding;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
          <PinIcon size={11} className="text-violet-600" />
          Project rules
          {pins.length > 0 && (
            <span className="rounded bg-neutral-100 px-1 font-mono text-[10px] text-neutral-600">
              {pins.length}
            </span>
          )}
        </span>

        {pins.map((p) => (
          <div
            key={p.id}
            className={cn(
              "group flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition",
              p.kind === "include"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-red-200 bg-red-50 text-red-900"
            )}
          >
            <button
              type="button"
              onClick={() => toggleKind(p.id)}
              disabled={disabled}
              title={
                p.kind === "include"
                  ? "Toggle to AVOID rule"
                  : "Toggle to INCLUDE rule"
              }
              className="flex items-center"
            >
              {p.kind === "include" ? <Check size={11} /> : <Ban size={11} />}
            </button>
            <span title={p.text} className="max-w-[18rem] truncate">
              {p.text}
            </span>
            <button
              type="button"
              onClick={() => remove(p.id)}
              disabled={disabled}
              title="Remove"
              className="rounded-full p-0.5 opacity-50 transition hover:bg-white/60 hover:opacity-100"
            >
              <X size={10} />
            </button>
          </div>
        ))}

        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={disabled}
            className="flex items-center gap-1 rounded-full border border-dashed border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 transition hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-50"
          >
            <Plus size={11} /> Pin a rule
          </button>
        )}

        {adding && (
          <div className="flex items-center gap-1 rounded-full border border-violet-300 bg-violet-50 pl-1.5 pr-1 py-0.5">
            <button
              type="button"
              onClick={() => setDraftKind(draftKind === "include" ? "avoid" : "include")}
              title="Toggle kind"
              className={cn(
                "flex h-4 w-4 items-center justify-center rounded",
                draftKind === "include"
                  ? "text-emerald-700"
                  : "text-red-700"
              )}
            >
              {draftKind === "include" ? <Check size={11} /> : <Ban size={11} />}
            </button>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              onBlur={() => {
                if (!draft.trim()) setAdding(false);
              }}
              placeholder={
                draftKind === "include"
                  ? "Always include …"
                  : "Never include / avoid …"
              }
              maxLength={280}
              className="w-64 bg-transparent text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
            />
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                commit();
              }}
              className="rounded p-0.5 text-violet-700 hover:bg-violet-100"
              title="Save (Enter)"
            >
              <Check size={11} />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setAdding(false);
                setDraft("");
              }}
              className="rounded p-0.5 text-neutral-500 hover:bg-neutral-100"
              title="Cancel (Esc)"
            >
              <X size={11} />
            </button>
          </div>
        )}
      </div>

      {showSuggestions && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-neutral-400">
            Try
          </span>
          {PIN_SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() =>
                onChange([...pins, { id: uid(), text: s.text, kind: s.kind }])
              }
              disabled={disabled}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] text-neutral-600 transition hover:bg-neutral-50",
                s.kind === "include"
                  ? "border-emerald-200 hover:border-emerald-300"
                  : "border-red-200 hover:border-red-300"
              )}
            >
              {s.kind === "include" ? "✓" : "✗"} {s.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
