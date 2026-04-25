"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Line, Rect, Circle, Group } from "react-konva";
import type Konva from "konva";
import { ensureCounterClockwise, polygonArea, snapPointToGrid } from "@/lib/geometry";
import type { Footprint, Point } from "@/lib/schema";
import { Square, Pentagon, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type DrawingTool = "rect" | "polygon";

interface Props {
  width: number;
  height: number;
  initialFootprint?: Footprint | null;
  onFootprintChange: (footprint: Footprint | null) => void;
}

const PX_PER_M = 28;
const GRID_M = 1;
const SNAP_M = 0.5;
const ORIGIN_X = 30;
const ORIGIN_Y = 30;

export default function DrawingCanvas({
  width,
  height,
  initialFootprint,
  onFootprintChange,
}: Props) {
  const [tool, setTool] = useState<DrawingTool>("rect");
  const [rectStart, setRectStart] = useState<Point | null>(null);
  const [rectEnd, setRectEnd] = useState<Point | null>(null);
  const [polyPoints, setPolyPoints] = useState<Point[]>([]);
  const [hover, setHover] = useState<Point | null>(null);
  const [committed, setCommitted] = useState<Point[] | null>(
    initialFootprint?.points ?? null
  );
  const stageRef = useRef<Konva.Stage>(null);

  // Sync committed shape from props when the parent loads or replaces the footprint.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCommitted(initialFootprint?.points ?? null);
  }, [initialFootprint]);

  function canvasToWorld(cx: number, cy: number): Point {
    const x = (cx - ORIGIN_X) / PX_PER_M;
    const y = (height - cy - ORIGIN_Y) / PX_PER_M;
    return snapPointToGrid([x, y], SNAP_M);
  }
  function worldToCanvas(p: Point): [number, number] {
    return [p[0] * PX_PER_M + ORIGIN_X, height - (p[1] * PX_PER_M + ORIGIN_Y)];
  }
  function flatPolyline(points: Point[]): number[] {
    return points.flatMap(worldToCanvas);
  }

  function commit(points: Point[]) {
    const cleaned = ensureCounterClockwise(points);
    setCommitted(cleaned);
    onFootprintChange({ points: cleaned });
  }

  function reset() {
    setRectStart(null);
    setRectEnd(null);
    setPolyPoints([]);
    setHover(null);
    setCommitted(null);
    onFootprintChange(null);
  }

  // Compute grid lines once
  const grid = useMemo(() => {
    const lines: { points: number[]; major: boolean }[] = [];
    const widthM = (width - ORIGIN_X * 2) / PX_PER_M;
    const heightM = (height - ORIGIN_Y * 2) / PX_PER_M;
    for (let x = 0; x <= widthM; x += GRID_M) {
      const major = x % 5 === 0;
      const [x1, y1] = worldToCanvas([x, 0]);
      const [x2, y2] = worldToCanvas([x, heightM]);
      lines.push({ points: [x1, y1, x2, y2], major });
    }
    for (let y = 0; y <= heightM; y += GRID_M) {
      const major = y % 5 === 0;
      const [x1, y1] = worldToCanvas([0, y]);
      const [x2, y2] = worldToCanvas([widthM, y]);
      lines.push({ points: [x1, y1, x2, y2], major });
    }
    return lines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  function onMouseMove() {
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    setHover(canvasToWorld(pos.x, pos.y));
  }

  function onMouseDown() {
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const wp = canvasToWorld(pos.x, pos.y);
    if (tool === "rect") {
      if (committed) reset();
      setRectStart(wp);
      setRectEnd(wp);
    } else {
      if (committed) {
        setCommitted(null);
        onFootprintChange(null);
      }
      setPolyPoints((prev) => [...prev, wp]);
    }
  }

  function onMouseMoveDrag() {
    if (tool !== "rect" || !rectStart) return;
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    setRectEnd(canvasToWorld(pos.x, pos.y));
  }

  function onMouseUp() {
    if (tool !== "rect") return;
    if (!rectStart || !rectEnd) return;
    const [x1, y1] = rectStart;
    const [x2, y2] = rectEnd;
    if (Math.abs(x2 - x1) < 0.5 || Math.abs(y2 - y1) < 0.5) {
      setRectStart(null);
      setRectEnd(null);
      return;
    }
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const pts: Point[] = [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
    ];
    commit(pts);
    setRectStart(null);
    setRectEnd(null);
  }

  function onDblClick() {
    if (tool !== "polygon" || polyPoints.length < 3) return;
    commit(polyPoints);
    setPolyPoints([]);
  }

  // Keyboard support: Enter to close polygon, Escape to reset
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter" && tool === "polygon" && polyPoints.length >= 3) {
        commit(polyPoints);
        setPolyPoints([]);
      } else if (e.key === "Escape") {
        reset();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, polyPoints]);

  // Live preview rectangle
  let liveRect: Point[] | null = null;
  if (tool === "rect" && rectStart && rectEnd) {
    const [x1, y1] = rectStart;
    const [x2, y2] = rectEnd;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    liveRect = [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
    ];
  }

  const liveArea = liveRect ? polygonArea(liveRect) : null;
  const committedArea = committed ? polygonArea(committed) : null;

  return (
    <div className="relative">
      <div className="absolute top-2 left-2 z-10 flex gap-1 rounded-lg border border-neutral-200 bg-white/90 p-1 shadow-sm backdrop-blur">
        <ToolButton active={tool === "rect"} onClick={() => setTool("rect")} title="Rectangle (drag)">
          <Square size={16} />
        </ToolButton>
        <ToolButton
          active={tool === "polygon"}
          onClick={() => setTool("polygon")}
          title="Polygon (click points, Enter or double-click to close)"
        >
          <Pentagon size={16} />
        </ToolButton>
        <div className="mx-1 w-px bg-neutral-200" />
        <ToolButton onClick={reset} title="Clear (Esc)">
          <Trash2 size={16} />
        </ToolButton>
      </div>
      <div className="absolute bottom-2 right-2 z-10 rounded-md bg-white/90 px-2 py-1 text-xs text-neutral-600 shadow-sm">
        {hover && (
          <span className="font-mono">
            x: {hover[0].toFixed(1)}m, y: {hover[1].toFixed(1)}m
          </span>
        )}
        {liveArea !== null && (
          <span className="ml-2 font-mono text-neutral-900">
            {liveRect![1][0] - liveRect![0][0]}×{liveRect![2][1] - liveRect![1][1]}m · {liveArea.toFixed(1)} m²
          </span>
        )}
        {committedArea !== null && !liveArea && (
          <span className="ml-2 font-mono text-emerald-700">
            ✓ {committedArea.toFixed(1)} m²
          </span>
        )}
      </div>

      <Stage
        ref={stageRef}
        width={width}
        height={height}
        onMouseMove={() => {
          onMouseMove();
          onMouseMoveDrag();
        }}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onDblClick={onDblClick}
        className="rounded-lg border border-neutral-200 bg-white"
      >
        <Layer listening={false}>
          <Rect x={0} y={0} width={width} height={height} fill="#fafafa" />
          {grid.map((g, i) => (
            <Line
              key={i}
              points={g.points}
              stroke={g.major ? "#cbd5e1" : "#e5e7eb"}
              strokeWidth={g.major ? 1 : 0.5}
            />
          ))}
        </Layer>

        <Layer>
          {liveRect && (
            <Line
              points={flatPolyline(liveRect)}
              closed
              stroke="#0284c7"
              strokeWidth={1.5}
              fill="rgba(56,189,248,0.18)"
              dash={[4, 4]}
            />
          )}
          {committed && (
            <Group>
              <Line
                points={flatPolyline(committed)}
                closed
                stroke="#0f172a"
                strokeWidth={2}
                fill="rgba(15,23,42,0.06)"
              />
              {committed.map((p, i) => {
                const [cx, cy] = worldToCanvas(p);
                return <Circle key={i} x={cx} y={cy} radius={3} fill="#0f172a" />;
              })}
            </Group>
          )}
          {tool === "polygon" && polyPoints.length > 0 && (
            <Group>
              <Line
                points={[
                  ...flatPolyline(polyPoints),
                  ...(hover ? worldToCanvas(hover) : []),
                ]}
                stroke="#0284c7"
                strokeWidth={1.5}
                dash={[4, 4]}
              />
              {polyPoints.map((p, i) => {
                const [cx, cy] = worldToCanvas(p);
                return <Circle key={i} x={cx} y={cy} radius={4} fill="#0284c7" />;
              })}
            </Group>
          )}
        </Layer>
      </Stage>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md text-neutral-700 transition",
        active ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"
      )}
    >
      {children}
    </button>
  );
}
