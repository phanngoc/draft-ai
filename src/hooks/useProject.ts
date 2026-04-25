"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Critique, Footprint, Layout, Pin } from "@/lib/schema";
import { LayoutSchema } from "@/lib/schema";

export type ConvTurn = {
  id: string;
  prompt: string;
  layout: Layout | null;
  toolUseId: string | null;
  status: "streaming" | "done" | "error";
  errorMessage?: string;
  partialChars: number;
  startedAt: number;
  completedAt?: number;
};

export type ConvProject = {
  id: string;
  title: string;
  footprint: Footprint | null;
  pins: Pin[];
  createdAt: number;
  updatedAt: number;
};

type ServerTurn = {
  id: string;
  projectId: string;
  idx: number;
  prompt: string;
  layout: Layout | null;
  toolUseId: string | null;
  status: "streaming" | "done" | "error";
  errorMessage: string | null;
  startedAt: number;
  completedAt: number | null;
};

function toConvTurn(t: ServerTurn): ConvTurn {
  return {
    id: t.id,
    prompt: t.prompt,
    layout: t.layout,
    toolUseId: t.toolUseId,
    status: t.status,
    errorMessage: t.errorMessage ?? undefined,
    partialChars: 0,
    startedAt: t.startedAt,
    completedAt: t.completedAt ?? undefined,
  };
}

export function useProject(projectId: string) {
  const [project, setProject] = useState<ConvProject | null>(null);
  const [turns, setTurns] = useState<ConvTurn[]>([]);
  const [currentTurnId, setCurrentTurnId] = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState<{
    state: "loading" | "ready" | "error";
    error?: string;
  }>({ state: "loading" });
  const isLoading = loadStatus.state === "loading";
  const loadError = loadStatus.state === "error" ? loadStatus.error ?? null : null;
  const abortRef = useRef<AbortController | null>(null);

  const streamingTurnId = useMemo(
    () => turns.find((t) => t.status === "streaming")?.id ?? null,
    [turns]
  );
  const isStreaming = streamingTurnId !== null;

  const currentTurn = useMemo(
    () => turns.find((t) => t.id === currentTurnId) ?? null,
    [turns, currentTurnId]
  );
  const layout: Layout | null = currentTurn?.layout ?? null;

  // Initial load
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}`)
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.error ?? `Failed to load project (${r.status})`);
        }
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setProject(data.project);
        const initialTurns = (data.turns as ServerTurn[]).map(toConvTurn);
        setTurns(initialTurns);
        const done = [...initialTurns].reverse().find((t) => t.status === "done");
        setCurrentTurnId(done?.id ?? initialTurns[initialTurns.length - 1]?.id ?? null);
        setLoadStatus({ state: "ready" });
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadStatus({
          state: "error",
          error: e instanceof Error ? e.message : "Unknown error",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const updateTurn = useCallback(
    (id: string, patch: Partial<ConvTurn>) =>
      setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t))),
    []
  );

  const setFootprint = useCallback(
    async (footprint: Footprint | null) => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ footprint }),
      });
      if (!res.ok) throw new Error(`Failed to save footprint (${res.status})`);
      const data = await res.json();
      setProject(data.project);
      // Server now keeps all turns across footprint changes; turns whose
      // embedded footprint no longer matches will be flagged "stale" by the UI.
      setTurns((data.turns as ServerTurn[]).map(toConvTurn));
    },
    [projectId]
  );

  const setTitle = useCallback(
    async (title: string) => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error(`Failed to save title (${res.status})`);
      const data = await res.json();
      setProject(data.project);
    },
    [projectId]
  );

  const setPins = useCallback(
    async (pins: Pin[]) => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pins }),
      });
      if (!res.ok) throw new Error(`Failed to save pins (${res.status})`);
      const data = await res.json();
      setProject(data.project);
    },
    [projectId]
  );

  const walkthrough = useCallback(
    async (turnId: string): Promise<string> => {
      const res = await fetch(
        `/api/projects/${projectId}/turns/${turnId}/walkthrough`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Walkthrough failed (${res.status})`);
      return data.narrative as string;
    },
    [projectId]
  );

  const critique = useCallback(
    async (turnId: string): Promise<Critique> => {
      const res = await fetch(
        `/api/projects/${projectId}/turns/${turnId}/critique`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Critique failed (${res.status})`);
      return data.critique as Critique;
    },
    [projectId]
  );

  const runGenerate = useCallback(
    async (prompt: string, editTurnId?: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Insert optimistic turn locally so UI updates immediately
      const optimisticId = `optim_${Math.random().toString(36).slice(2, 8)}`;
      const optimisticTurn: ConvTurn = {
        id: optimisticId,
        prompt,
        layout: null,
        toolUseId: null,
        status: "streaming",
        partialChars: 0,
        startedAt: Date.now(),
      };

      // Truncate locally for edit
      if (editTurnId) {
        setTurns((prev) => {
          const idx = prev.findIndex((t) => t.id === editTurnId);
          if (idx === -1) return [...prev, optimisticTurn];
          return [...prev.slice(0, idx), optimisticTurn];
        });
      } else {
        setTurns((prev) => [...prev, optimisticTurn]);
      }
      setCurrentTurnId(optimisticId);

      let realTurnId: string | null = null;

      const finalizeError = (msg: string) => {
        const id = realTurnId ?? optimisticId;
        updateTurn(id, {
          status: "error",
          errorMessage: msg,
          completedAt: Date.now(),
        });
      };

      try {
        const res = await fetch(`/api/projects/${projectId}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, editTurnId }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          let msg = `Request failed (${res.status})`;
          try {
            const data = await res.json();
            if (data?.error) msg = data.error;
          } catch {}
          throw new Error(msg);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const ev of events) {
            const line = ev.trim();
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            let parsed: unknown;
            try {
              parsed = JSON.parse(payload);
            } catch {
              continue;
            }
            if (!parsed || typeof parsed !== "object") continue;
            const e = parsed as Record<string, unknown>;
            if (e.type === "start" && typeof e.turnId === "string") {
              realTurnId = e.turnId;
              // Replace optimistic id with real one
              setTurns((prev) =>
                prev.map((t) => (t.id === optimisticId ? { ...t, id: e.turnId as string } : t))
              );
              setCurrentTurnId(e.turnId);
            } else if (e.type === "progress" && typeof e.partialChars === "number") {
              const id = realTurnId ?? optimisticId;
              updateTurn(id, { partialChars: e.partialChars });
            } else if (e.type === "done") {
              const v = LayoutSchema.safeParse(e.layout);
              const id = realTurnId ?? optimisticId;
              if (v.success) {
                updateTurn(id, {
                  layout: v.data,
                  toolUseId: typeof e.toolUseId === "string" ? e.toolUseId : null,
                  status: "done",
                  completedAt: Date.now(),
                });
              } else {
                finalizeError("Server returned invalid layout shape.");
              }
            } else if (e.type === "error") {
              finalizeError(
                typeof e.message === "string" ? e.message : "Unknown server error"
              );
            }
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        finalizeError(err instanceof Error ? err.message : "Unknown error");
      }
    },
    [projectId, updateTurn]
  );

  const send = useCallback(
    (prompt: string) => {
      void runGenerate(prompt);
    },
    [runGenerate]
  );

  const editTurn = useCallback(
    (turnId: string, newPrompt: string) => {
      void runGenerate(newPrompt, turnId);
    },
    [runGenerate]
  );

  const restore = useCallback((turnId: string) => {
    setCurrentTurnId(turnId);
  }, []);

  const deleteTurn = useCallback(
    async (turnId: string) => {
      const res = await fetch(`/api/projects/${projectId}/turns/${turnId}`, {
        method: "DELETE",
      });
      if (!res.ok) return;
      setTurns((prev) => prev.filter((t) => t.id !== turnId));
      setCurrentTurnId((cur) => (cur === turnId ? null : cur));
    },
    [projectId]
  );

  const clear = useCallback(async () => {
    abortRef.current?.abort();
    const res = await fetch(`/api/projects/${projectId}/turns`, { method: "DELETE" });
    if (!res.ok) return;
    setTurns([]);
    setCurrentTurnId(null);
  }, [projectId]);

  return {
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
  };
}
