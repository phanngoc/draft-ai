import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { LayoutSchema, type Footprint, type Layout, type Pin } from "./schema";

const DB_PATH = path.resolve(process.cwd(), "data", "draft-ai.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`PRAGMA journal_mode = WAL`);
db.exec(`PRAGMA foreign_keys = ON`);

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Untitled Project',
    footprint_json TEXT,
    pins_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS turns (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    layout_json TEXT,
    tool_use_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('streaming', 'done', 'error')),
    error_message TEXT,
    started_at INTEGER NOT NULL,
    completed_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_turns_project_idx ON turns(project_id, idx);
`);

// Idempotent migration for older DBs that pre-date pins_json
try {
  db.exec(`ALTER TABLE projects ADD COLUMN pins_json TEXT`);
} catch {
  // column already exists — fine
}

export type ProjectRow = {
  id: string;
  title: string;
  footprint_json: string | null;
  pins_json: string | null;
  created_at: number;
  updated_at: number;
};

export type TurnRow = {
  id: string;
  project_id: string;
  idx: number;
  prompt: string;
  layout_json: string | null;
  tool_use_id: string | null;
  status: "streaming" | "done" | "error";
  error_message: string | null;
  started_at: number;
  completed_at: number | null;
};

export type Project = {
  id: string;
  title: string;
  footprint: Footprint | null;
  pins: Pin[];
  createdAt: number;
  updatedAt: number;
};

export type Turn = {
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

function rowToProject(r: ProjectRow): Project {
  let pins: Pin[] = [];
  if (r.pins_json) {
    try {
      const parsed = JSON.parse(r.pins_json);
      if (Array.isArray(parsed)) pins = parsed as Pin[];
    } catch {}
  }
  return {
    id: r.id,
    title: r.title,
    footprint: r.footprint_json ? (JSON.parse(r.footprint_json) as Footprint) : null,
    pins,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToTurn(r: TurnRow): Turn {
  let layout: Layout | null = null;
  if (r.layout_json) {
    try {
      // Re-parse through Zod so defaults (site_features=[], etc.) are applied
      // for older rows that pre-date schema additions.
      const raw = JSON.parse(r.layout_json);
      const parsed = LayoutSchema.safeParse(raw);
      if (parsed.success) {
        layout = parsed.data;
      } else {
        // Fallback: keep raw and patch missing arrays so renderers don't crash.
        layout = {
          ...(raw as Layout),
          site_features: Array.isArray(raw?.site_features) ? raw.site_features : [],
          doors: Array.isArray(raw?.doors) ? raw.doors : [],
          windows: Array.isArray(raw?.windows) ? raw.windows : [],
          furniture: Array.isArray(raw?.furniture) ? raw.furniture : [],
        } as Layout;
      }
    } catch {
      layout = null;
    }
  }
  return {
    id: r.id,
    projectId: r.project_id,
    idx: r.idx,
    prompt: r.prompt,
    layout,
    toolUseId: r.tool_use_id,
    status: r.status,
    errorMessage: r.error_message,
    startedAt: r.started_at,
    completedAt: r.completed_at,
  };
}

export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export const projectsRepo = {
  list(): Project[] {
    const rows = db
      .prepare("SELECT * FROM projects ORDER BY updated_at DESC")
      .all() as unknown as ProjectRow[];
    return rows.map(rowToProject);
  },
  get(id: string): Project | null {
    const row = db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(id) as unknown as ProjectRow | undefined;
    return row ? rowToProject(row) : null;
  },
  create({ id, title }: { id?: string; title?: string } = {}): Project {
    const now = Date.now();
    const newId = id ?? uid("p");
    db.prepare(
      "INSERT INTO projects (id, title, footprint_json, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)"
    ).run(newId, title ?? "Untitled Project", now, now);
    return projectsRepo.get(newId)!;
  },
  update(
    id: string,
    patch: { title?: string; footprint?: Footprint | null; pins?: Pin[] }
  ): Project | null {
    const sets: string[] = ["updated_at = ?"];
    const params: (string | number | null)[] = [Date.now()];
    if (patch.title !== undefined) {
      sets.push("title = ?");
      params.push(patch.title);
    }
    if (patch.footprint !== undefined) {
      sets.push("footprint_json = ?");
      params.push(patch.footprint === null ? null : JSON.stringify(patch.footprint));
    }
    if (patch.pins !== undefined) {
      sets.push("pins_json = ?");
      params.push(JSON.stringify(patch.pins));
    }
    params.push(id);
    db.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).run(...params);
    return projectsRepo.get(id);
  },
  delete(id: string): boolean {
    const r = db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    return r.changes > 0;
  },
  touch(id: string) {
    db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(Date.now(), id);
  },
};

export const turnsRepo = {
  listByProject(projectId: string): Turn[] {
    const rows = db
      .prepare("SELECT * FROM turns WHERE project_id = ? ORDER BY idx ASC")
      .all(projectId) as unknown as TurnRow[];
    return rows.map(rowToTurn);
  },
  get(id: string): Turn | null {
    const row = db
      .prepare("SELECT * FROM turns WHERE id = ?")
      .get(id) as unknown as TurnRow | undefined;
    return row ? rowToTurn(row) : null;
  },
  nextIdx(projectId: string): number {
    const r = db
      .prepare("SELECT COALESCE(MAX(idx), -1) + 1 AS n FROM turns WHERE project_id = ?")
      .get(projectId) as unknown as { n: number };
    return r.n;
  },
  create(args: {
    id?: string;
    projectId: string;
    idx?: number;
    prompt: string;
  }): Turn {
    const id = args.id ?? uid("t");
    const idx = args.idx ?? turnsRepo.nextIdx(args.projectId);
    const now = Date.now();
    db.prepare(
      `INSERT INTO turns (id, project_id, idx, prompt, layout_json, tool_use_id, status, error_message, started_at, completed_at)
       VALUES (?, ?, ?, ?, NULL, NULL, 'streaming', NULL, ?, NULL)`
    ).run(id, args.projectId, idx, args.prompt, now);
    projectsRepo.touch(args.projectId);
    return turnsRepo.get(id)!;
  },
  finishDone(
    id: string,
    layout: Layout,
    toolUseId: string
  ): Turn | null {
    db.prepare(
      `UPDATE turns SET status = 'done', layout_json = ?, tool_use_id = ?, completed_at = ?, error_message = NULL WHERE id = ?`
    ).run(JSON.stringify(layout), toolUseId, Date.now(), id);
    const turn = turnsRepo.get(id);
    if (turn) projectsRepo.touch(turn.projectId);
    return turn;
  },
  finishError(id: string, message: string): Turn | null {
    db.prepare(
      `UPDATE turns SET status = 'error', error_message = ?, completed_at = ? WHERE id = ?`
    ).run(message, Date.now(), id);
    const turn = turnsRepo.get(id);
    if (turn) projectsRepo.touch(turn.projectId);
    return turn;
  },
  // Delete this turn AND all turns at higher idx in the project.
  deleteFromIdx(projectId: string, idx: number): number {
    const r = db
      .prepare("DELETE FROM turns WHERE project_id = ? AND idx >= ?")
      .run(projectId, idx);
    projectsRepo.touch(projectId);
    return r.changes as number;
  },
  delete(id: string): boolean {
    const turn = turnsRepo.get(id);
    if (!turn) return false;
    const r = db.prepare("DELETE FROM turns WHERE id = ?").run(id);
    if (r.changes > 0) projectsRepo.touch(turn.projectId);
    return r.changes > 0;
  },
  // Mark all currently "streaming" turns as errored (server crash recovery on startup).
  abandonStaleStreaming() {
    db.prepare(
      `UPDATE turns SET status = 'error', error_message = 'Generation interrupted (server restart)', completed_at = ? WHERE status = 'streaming'`
    ).run(Date.now());
  },
};

// Recovery: any turns left in 'streaming' from a previous run are stale.
turnsRepo.abandonStaleStreaming();
