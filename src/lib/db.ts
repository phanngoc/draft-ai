import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import {
  LayoutSchema,
  LegacyLayoutSchema,
  legacyLayoutToV2,
  type Footprint,
  type Layout,
  type Pin,
  type Zone,
} from "./schema";

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

// Idempotent migrations for older DBs.
try {
  db.exec(`ALTER TABLE projects ADD COLUMN pins_json TEXT`);
} catch {
  // column already exists — fine
}
try {
  db.exec(`ALTER TABLE projects ADD COLUMN zones_json TEXT`);
} catch {
  // column already exists — fine
}

export type ProjectRow = {
  id: string;
  title: string;
  footprint_json: string | null;
  zones_json: string | null;
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
  /** Legacy single-footprint accessor — always reflects the first building zone if any. */
  footprint: Footprint | null;
  /** v2: full site plan as a list of typed zones. */
  zones: Zone[];
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
  // Resolve zones with legacy fallback: an old project only has footprint_json.
  let zones: Zone[] = [];
  if (r.zones_json) {
    try {
      const parsed = JSON.parse(r.zones_json);
      if (Array.isArray(parsed)) zones = parsed as Zone[];
    } catch {}
  }
  let footprint: Footprint | null = null;
  if (r.footprint_json) {
    try {
      footprint = JSON.parse(r.footprint_json) as Footprint;
    } catch {}
  }
  // If we have a legacy footprint but no zones yet, synthesise a single building zone.
  if (zones.length === 0 && footprint) {
    zones = [
      {
        id: "z_main",
        type: "building",
        polygon: footprint.points,
        label: "Main building",
      },
    ];
  }
  // Keep legacy `footprint` accessor pointing at the first building zone.
  if (!footprint) {
    const b = zones.find((z) => z.type === "building");
    if (b) footprint = { points: b.polygon };
  }
  return {
    id: r.id,
    title: r.title,
    footprint,
    zones,
    pins,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToTurn(r: TurnRow): Turn {
  let layout: Layout | null = null;
  if (r.layout_json) {
    try {
      const raw = JSON.parse(r.layout_json);
      // Try v2 first, then upgrade legacy v1 (single `building` field).
      const v2 = LayoutSchema.safeParse(raw);
      if (v2.success) {
        layout = v2.data;
      } else {
        const legacy = LegacyLayoutSchema.safeParse(raw);
        if (legacy.success) {
          layout = legacyLayoutToV2(legacy.data);
        } else if (raw && typeof raw === "object") {
          // Best-effort fallback: hand-patch missing arrays so renderers don't crash.
          if (Array.isArray((raw as Layout).buildings)) {
            layout = {
              buildings: (raw as Layout).buildings,
              site_features: Array.isArray((raw as Layout).site_features)
                ? (raw as Layout).site_features
                : [],
              notes: (raw as Layout).notes,
            };
          } else if ((raw as { building?: unknown }).building) {
            // Looks legacy but malformed; manually shape it.
            const b = (raw as { building: { footprint: [number, number][]; floor_height?: number } })
              .building;
            layout = {
              buildings: [
                {
                  zone_id: "z_main",
                  footprint: b.footprint,
                  floor_height: b.floor_height ?? 2.8,
                  walls: Array.isArray((raw as { walls?: unknown }).walls)
                    ? ((raw as { walls: import("./schema").Wall[] }).walls)
                    : [],
                  rooms: Array.isArray((raw as { rooms?: unknown }).rooms)
                    ? ((raw as { rooms: import("./schema").Room[] }).rooms)
                    : [],
                  doors: Array.isArray((raw as { doors?: unknown }).doors)
                    ? ((raw as { doors: import("./schema").Door[] }).doors)
                    : [],
                  windows: Array.isArray((raw as { windows?: unknown }).windows)
                    ? ((raw as { windows: import("./schema").Window[] }).windows)
                    : [],
                  furniture: Array.isArray((raw as { furniture?: unknown }).furniture)
                    ? ((raw as { furniture: import("./schema").Furniture[] }).furniture)
                    : [],
                },
              ],
              site_features: Array.isArray((raw as { site_features?: unknown }).site_features)
                ? ((raw as { site_features: import("./schema").SiteFeature[] }).site_features)
                : [],
              notes: (raw as { notes?: string }).notes,
            };
          }
        }
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
    patch: {
      title?: string;
      footprint?: Footprint | null;
      zones?: Zone[];
      pins?: Pin[];
    }
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
    if (patch.zones !== undefined) {
      sets.push("zones_json = ?");
      params.push(JSON.stringify(patch.zones));
      // Mirror the first building zone into legacy footprint_json so any code
      // still reading footprint stays consistent.
      const firstBuilding = patch.zones.find((z) => z.type === "building");
      sets.push("footprint_json = ?");
      params.push(
        firstBuilding ? JSON.stringify({ points: firstBuilding.polygon }) : null
      );
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
