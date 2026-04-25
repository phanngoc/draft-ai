"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Building2,
  ChevronLeft,
  Plus,
  Trash2,
  Clock,
  Layers,
  ArrowRight,
} from "lucide-react";
import type { ConvProject } from "@/hooks/useProject";

type ProjectListItem = ConvProject & {
  // Server returns these names; we accept the same shape.
};

export default function ProjectsIndex() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects")
      .then(async (r) => {
        if (!r.ok) throw new Error(`Failed to load (${r.status})`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setProjects(data.projects);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Unknown error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function createProject() {
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Failed to create (${res.status})`);
      const data = await res.json();
      router.push(`/draft/${data.project.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create project");
      setCreating(false);
    }
  }

  async function deleteProject(id: string) {
    if (!confirm("Delete this project and all its turns? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed to delete (${res.status})`);
      setProjects((prev) => (prev ?? []).filter((p) => p.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
        <Link href="/" className="flex items-center gap-2 text-neutral-700 hover:text-neutral-900">
          <ChevronLeft size={16} />
          <Building2 size={20} className="text-emerald-600" />
          <span className="text-base font-semibold tracking-tight">DraftedAI</span>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700">
            MVP
          </span>
        </Link>
        <button
          type="button"
          onClick={createProject}
          disabled={creating}
          className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500"
        >
          <Plus size={14} />
          {creating ? "Creating…" : "New project"}
        </button>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Your projects</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Each project keeps its own footprint, conversation history, and generated layouts.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        {projects === null && (
          <div className="rounded-xl border border-dashed border-neutral-200 bg-white p-12 text-center text-sm text-neutral-500">
            Loading projects…
          </div>
        )}

        {projects && projects.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-200 bg-white p-12 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
              <Building2 size={24} className="text-emerald-600" />
            </div>
            <h2 className="text-base font-semibold text-neutral-800">No projects yet</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Start a new project to draw a footprint and chat with the AI architect.
            </p>
            <button
              type="button"
              onClick={createProject}
              disabled={creating}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              <Plus size={14} /> Create your first project
            </button>
          </div>
        )}

        {projects && projects.length > 0 && (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {projects.map((p) => (
              <li
                key={p.id}
                className="group relative rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:shadow"
              >
                <Link
                  href={`/draft/${p.id}`}
                  className="absolute inset-0 z-0 rounded-xl"
                  aria-label={`Open ${p.title}`}
                />
                <div className="relative z-10 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-neutral-900">
                      {p.title}
                    </h3>
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-neutral-500">
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {timeAgo(p.updatedAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers size={11} />
                        {p.footprint ? "Footprint set" : "No footprint"}
                      </span>
                    </div>
                    <p className="mt-2 truncate font-mono text-[10px] text-neutral-400">
                      {p.id}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        deleteProject(p.id);
                      }}
                      title="Delete project"
                      className="rounded p-1.5 text-neutral-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                    <ArrowRight
                      size={14}
                      className="text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-neutral-700"
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}
