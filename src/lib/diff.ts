import type { Building, Layout, Room } from "./schema";

export type RoomChange = {
  id: string;
  before: Room;
  after: Room;
  areaDelta: number; // after.area - before.area
  renamed: boolean;
};

export type LayoutDiff = {
  addedRooms: Room[];
  removedRooms: Room[];
  changedRooms: RoomChange[];
  unchangedCount: number;
  windowCountDelta: number;
  doorCountDelta: number;
  furnitureCountDelta: number;
  siteFeatureCountDelta: number;
  totalAreaBefore: number;
  totalAreaAfter: number;
};

const AREA_EPS = 0.05; // m² — ignore tiny float jitter

// Aggregate per-building arrays into one array (rooms / walls / doors / windows / furniture)
function flatten<T extends keyof Building>(
  buildings: Building[],
  key: T
): Building[T] extends Array<infer U> ? U[] : never {
  return buildings.flatMap((b) => b[key] as unknown as never[]) as never;
}

export function diffLayouts(prev: Layout, curr: Layout): LayoutDiff {
  const prevRooms = flatten(prev.buildings, "rooms") as Room[];
  const currRooms = flatten(curr.buildings, "rooms") as Room[];
  const prevById = new Map(prevRooms.map((r) => [r.id, r]));
  const currById = new Map(currRooms.map((r) => [r.id, r]));

  const addedRooms: Room[] = [];
  const removedRooms: Room[] = [];
  const changedRooms: RoomChange[] = [];
  let unchangedCount = 0;

  for (const [id, after] of currById) {
    const before = prevById.get(id);
    if (!before) {
      addedRooms.push(after);
    } else {
      const areaDelta = after.area - before.area;
      const renamed = before.name !== after.name;
      if (Math.abs(areaDelta) > AREA_EPS || renamed) {
        changedRooms.push({ id, before, after, areaDelta, renamed });
      } else {
        unchangedCount += 1;
      }
    }
  }
  for (const [id, before] of prevById) {
    if (!currById.has(id)) removedRooms.push(before);
  }

  const totalAreaBefore = prevRooms.reduce((s, r) => s + r.area, 0);
  const totalAreaAfter = currRooms.reduce((s, r) => s + r.area, 0);

  const prevWindows = prev.buildings.reduce((s, b) => s + b.windows.length, 0);
  const currWindows = curr.buildings.reduce((s, b) => s + b.windows.length, 0);
  const prevDoors = prev.buildings.reduce((s, b) => s + b.doors.length, 0);
  const currDoors = curr.buildings.reduce((s, b) => s + b.doors.length, 0);
  const prevFurn = prev.buildings.reduce((s, b) => s + b.furniture.length, 0);
  const currFurn = curr.buildings.reduce((s, b) => s + b.furniture.length, 0);

  return {
    addedRooms,
    removedRooms,
    changedRooms,
    unchangedCount,
    windowCountDelta: currWindows - prevWindows,
    doorCountDelta: currDoors - prevDoors,
    furnitureCountDelta: currFurn - prevFurn,
    siteFeatureCountDelta:
      (curr.site_features?.length ?? 0) - (prev.site_features?.length ?? 0),
    totalAreaBefore,
    totalAreaAfter,
  };
}

export function summarizeDiff(diff: LayoutDiff): string[] {
  const parts: string[] = [];
  if (diff.addedRooms.length) {
    parts.push(
      `+${diff.addedRooms.length} room${diff.addedRooms.length > 1 ? "s" : ""}: ${diff.addedRooms
        .map((r) => r.name)
        .join(", ")}`
    );
  }
  if (diff.removedRooms.length) {
    parts.push(
      `−${diff.removedRooms.length} room${diff.removedRooms.length > 1 ? "s" : ""}: ${diff.removedRooms
        .map((r) => r.name)
        .join(", ")}`
    );
  }
  if (diff.changedRooms.length) {
    parts.push(`${diff.changedRooms.length} resized/renamed`);
  }
  if (diff.windowCountDelta !== 0) {
    parts.push(`${signed(diff.windowCountDelta)} window`);
  }
  if (diff.doorCountDelta !== 0) {
    parts.push(`${signed(diff.doorCountDelta)} door`);
  }
  if (diff.furnitureCountDelta !== 0) {
    parts.push(`${signed(diff.furnitureCountDelta)} furniture`);
  }
  if (diff.siteFeatureCountDelta !== 0) {
    parts.push(`${signed(diff.siteFeatureCountDelta)} site element`);
  }
  if (parts.length === 0) parts.push("No structural changes");
  return parts;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}
