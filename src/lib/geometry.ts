import type { Point, Wall } from "./schema";

export function polygonArea(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

export function polygonCentroid(points: Point[]): Point {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    const cross = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
    a += cross;
  }
  if (a === 0) {
    const sx = points.reduce((s, p) => s + p[0], 0);
    const sy = points.reduce((s, p) => s + p[1], 0);
    return [sx / points.length, sy / points.length];
  }
  a *= 0.5;
  return [cx / (6 * a), cy / (6 * a)];
}

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function snapToGrid(value: number, step = 0.1): number {
  return Math.round(value / step) * step;
}

export function snapPointToGrid(point: Point, step = 0.1): Point {
  return [snapToGrid(point[0], step), snapToGrid(point[1], step)];
}

export function distance(a: Point, b: Point): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

export function lerp(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function wallVector(wall: Wall): { dx: number; dy: number; length: number } {
  const dx = wall.end[0] - wall.start[0];
  const dy = wall.end[1] - wall.start[1];
  return { dx, dy, length: Math.sqrt(dx * dx + dy * dy) };
}

export function wallNormal(wall: Wall): Point {
  const { dx, dy, length } = wallVector(wall);
  if (length === 0) return [0, 0];
  return [-dy / length, dx / length];
}

export function pointOnWall(wall: Wall, t: number): Point {
  return lerp(wall.start, wall.end, t);
}

export function bbox(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function rectanglePoints(
  x: number,
  y: number,
  width: number,
  height: number
): Point[] {
  return [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
}

export function pointsApproxEqual(
  a: Point[] | undefined | null,
  b: Point[] | undefined | null,
  eps = 0.05
): boolean {
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i][0] - b[i][0]) > eps) return false;
    if (Math.abs(a[i][1] - b[i][1]) > eps) return false;
  }
  return true;
}

export function ensureCounterClockwise(points: Point[]): Point[] {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += (x2 - x1) * (y2 + y1);
  }
  return sum > 0 ? [...points].reverse() : points;
}
