import { describe, expect, it } from "vitest";
import {
  bbox,
  distance,
  ensureCounterClockwise,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  rectanglePoints,
  snapToGrid,
} from "./geometry";

describe("geometry", () => {
  it("polygonArea computes area of a unit square", () => {
    expect(polygonArea(rectanglePoints(0, 0, 1, 1))).toBe(1);
  });

  it("polygonArea handles 10x8 rectangle", () => {
    expect(polygonArea(rectanglePoints(0, 0, 10, 8))).toBe(80);
  });

  it("polygonCentroid of unit square is (0.5, 0.5)", () => {
    const c = polygonCentroid(rectanglePoints(0, 0, 1, 1));
    expect(c[0]).toBeCloseTo(0.5);
    expect(c[1]).toBeCloseTo(0.5);
  });

  it("pointInPolygon detects inside / outside", () => {
    const square = rectanglePoints(0, 0, 10, 10);
    expect(pointInPolygon([5, 5], square)).toBe(true);
    expect(pointInPolygon([15, 5], square)).toBe(false);
  });

  it("snapToGrid snaps to 0.1m default", () => {
    expect(snapToGrid(1.234)).toBeCloseTo(1.2);
    expect(snapToGrid(1.27)).toBeCloseTo(1.3);
  });

  it("distance is Euclidean", () => {
    expect(distance([0, 0], [3, 4])).toBe(5);
  });

  it("bbox finds min/max", () => {
    const b = bbox([
      [1, 2],
      [5, 0],
      [3, 7],
    ]);
    expect(b).toEqual({ minX: 1, minY: 0, maxX: 5, maxY: 7 });
  });

  it("ensureCounterClockwise reverses CW polygons", () => {
    const cw = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ] as [number, number][];
    const result = ensureCounterClockwise(cw);
    expect(result[0]).toEqual([1, 0]);
  });
});
