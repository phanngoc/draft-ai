"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Line, Rect, Circle, Group } from "react-konva";
import type Konva from "konva";
import { ensureCounterClockwise, polygonArea, polygonCentroid, snapPointToGrid } from "@/lib/geometry";
import type { Point, Zone, ZoneType } from "@/lib/schema";
import { Square, Pentagon, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type DrawingTool = "rect" | "polygon";

interface Props {
  width: number;
  height: number;
  initialZones?: Zone[];
  onZonesChange: (zones: Zone[]) => void;
}

const PX_PER_M = 28;
const GRID_M = 1;
const SNAP_M = 0.5;
const ORIGIN_X = 30;
const ORIGIN_Y = 30;

const ZONE_TYPES: { type: ZoneType; label: string; emoji: string }[] = [
  { type: "building", label: "Building", emoji: "🏠" },
  { type: "garden", label: "Garden", emoji: "🌿" },
  { type: "lawn", label: "Lawn", emoji: "🌱" },
  { type: "deck", label: "Deck", emoji: "🪵" },
  { type: "patio_outdoor", label: "Patio", emoji: "🪨" },
  { type: "pool", label: "Pool", emoji: "🏊" },
  { type: "parking", label: "Parking", emoji: "🚗" },
  { type: "driveway", label: "Driveway", emoji: "🛣️" },
  { type: "path", label: "Path", emoji: "🚶" },
  { type: "fence", label: "Fence", emoji: "🪶" },
  { type: "planter", label: "Planter", emoji: "🪴" },
];

const ZONE_STYLE: Record<ZoneType, { fill: string; stroke: string; label: string }> = {
  building: { fill: "rgba(15,23,42,0.18)", stroke: "#0f172a", label: "#0f172a" },
  garden: { fill: "rgba(34,197,94,0.28)", stroke: "#16a34a", label: "#166534" },
  lawn: { fill: "rgba(132,204,22,0.22)", stroke: "#65a30d", label: "#3f6212" },
  deck: { fill: "rgba(180,140,80,0.30)", stroke: "#a16207", label: "#7c2d12" },
  patio_outdoor: { fill: "rgba(214,197,163,0.45)", stroke: "#a98c63", label: "#7c2d12" },
  pool: { fill: "rgba(56,189,248,0.45)", stroke: "#0284c7", label: "#075985" },
  parking: { fill: "rgba(100,116,139,0.30)", stroke: "#475569", label: "#1e293b" },
  driveway: { fill: "rgba(120,113,108,0.25)", stroke: "#57534e", label: "#1c1917" },
  path: { fill: "rgba(203,213,225,0.55)", stroke: "#94a3b8", label: "#334155" },
  fence: { fill: "rgba(146,64,14,0.55)", stroke: "#78350f", label: "#78350f" },
  planter: { fill: "rgba(190,242,100,0.55)", stroke: "#65a30d", label: "#365314" },
};

function uid(prefix = "z"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

export default function DrawingCanvas({
  width,
  height,
  initialZones,
  onZonesChange,
}: Props) {
  const [tool, setTool] = useState<DrawingTool>("rect");
  const [zoneType, setZoneType] = useState<ZoneType>("building");
  const [rectStart, setRectStart] = useState<Point | null>(null);
  const [rectEnd, setRectEnd] = useState<Point | null>(null);
  const [polyPoints, setPolyPoints] = useState<Point[]>([]);
  const [hover, setHover] = useState<Point | null>(null);
  const [zones, setZones] = useState<Zone[]>(initialZones ?? []);
  const stageRef = useRef<Konva.Stage>(null);

  // Sync zones from props when the parent loads them.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setZones(initialZones ?? []);
  }, [initialZones]);

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

  function commitZone(points: Point[]) {
    const cleaned = ensureCounterClockwise(points);
    const newZone: Zone = {
      id: uid(zoneType === "building" ? "z_b" : "z"),
      type: zoneType,
      polygon: cleaned,
      label: defaultLabelForType(zoneType, zones),
    };
    const next = [...zones, newZone];
    setZones(next);
    onZonesChange(next);
  }

  function removeZone(id: string) {
    const next = zones.filter((z) => z.id !== id);
    setZones(next);
    onZonesChange(next);
  }

  function clearAll() {
    setRectStart(null);
    setRectEnd(null);
    setPolyPoints([]);
    setHover(null);
    setZones([]);
    onZonesChange([]);
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
      setRectStart(wp);
      setRectEnd(wp);
    } else {
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
    commitZone(pts);
    setRectStart(null);
    setRectEnd(null);
  }

  function onDblClick() {
    if (tool !== "polygon" || polyPoints.length < 3) return;
    commitZone(polyPoints);
    setPolyPoints([]);
  }

  // Keyboard support: Enter to close polygon, Escape to cancel current draw.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter" && tool === "polygon" && polyPoints.length >= 3) {
        commitZone(polyPoints);
        setPolyPoints([]);
      } else if (e.key === "Escape") {
        setRectStart(null);
        setRectEnd(null);
        setPolyPoints([]);
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
  const totalArea = zones
    .filter((z) => z.type === "building")
    .reduce((s, z) => s + polygonArea(z.polygon), 0);
  const liveStyle = ZONE_STYLE[zoneType];

  return (
    <div className="relative">
      {/* Top toolbar: tool + zone-type chips */}
      <div className="absolute top-2 left-2 right-2 z-10 flex flex-wrap items-center gap-1">
        <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white/95 p-1 shadow-sm backdrop-blur">
          <ToolButton active={tool === "rect"} onClick={() => setTool("rect")} title="Rectangle (drag)">
            <Square size={14} />
          </ToolButton>
          <ToolButton
            active={tool === "polygon"}
            onClick={() => setTool("polygon")}
            title="Polygon (click points, Enter or double-click to close)"
          >
            <Pentagon size={14} />
          </ToolButton>
          <div className="mx-0.5 w-px self-stretch bg-neutral-200" />
          <ToolButton onClick={clearAll} title="Clear all zones">
            <Trash2 size={14} />
          </ToolButton>
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-neutral-200 bg-white/95 p-1 shadow-sm backdrop-blur">
          {ZONE_TYPES.map((z) => {
            const active = z.type === zoneType;
            const style = ZONE_STYLE[z.type];
            return (
              <button
                key={z.type}
                type="button"
                onClick={() => setZoneType(z.type)}
                title={`Draw a ${z.label.toLowerCase()} zone`}
                className={cn(
                  "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition",
                  active
                    ? "ring-1 ring-offset-1 ring-neutral-900"
                    : "hover:bg-neutral-100"
                )}
                style={
                  active
                    ? { background: style.fill, color: style.label, borderColor: style.stroke }
                    : { color: style.label }
                }
              >
                <span aria-hidden>{z.emoji}</span>
                <span>{z.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom-left: zone list with × delete */}
      {zones.length > 0 && (
        <div className="absolute bottom-2 left-2 z-10 flex max-w-[60%] flex-wrap gap-1 rounded-md bg-white/90 p-1 text-[11px] shadow-sm backdrop-blur">
          {zones.map((z) => {
            const style = ZONE_STYLE[z.type];
            return (
              <span
                key={z.id}
                className="flex items-center gap-1 rounded-full border px-1.5 py-0.5"
                style={{
                  background: style.fill,
                  color: style.label,
                  borderColor: style.stroke,
                }}
              >
                <span className="font-mono text-[10px] uppercase tracking-wider">{z.type}</span>
                <span className="opacity-70">
                  {polygonArea(z.polygon).toFixed(1)} m²
                </span>
                <button
                  type="button"
                  onClick={() => removeZone(z.id)}
                  title="Remove zone"
                  className="ml-0.5 rounded-full p-0.5 hover:bg-white/40"
                >
                  <X size={10} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Bottom-right: cursor coords + areas */}
      <div className="absolute bottom-2 right-2 z-10 rounded-md bg-white/90 px-2 py-1 text-xs text-neutral-600 shadow-sm">
        {hover && (
          <span className="font-mono">
            x: {hover[0].toFixed(1)}m, y: {hover[1].toFixed(1)}m
          </span>
        )}
        {liveArea !== null && (
          <span className="ml-2 font-mono text-neutral-900">
            {(liveRect![1][0] - liveRect![0][0]).toFixed(1)}×{(liveRect![2][1] - liveRect![1][1]).toFixed(1)}m · {liveArea.toFixed(1)} m²
          </span>
        )}
        {totalArea > 0 && !liveArea && (
          <span className="ml-2 font-mono text-emerald-700">
            ✓ {totalArea.toFixed(1)} m² built
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
          {/* Committed zones */}
          {zones.map((z) => {
            const style = ZONE_STYLE[z.type];
            const c = polygonCentroid(z.polygon);
            const [cx, cy] = worldToCanvas(c);
            return (
              <Group key={z.id}>
                <Line
                  points={flatPolyline(z.polygon)}
                  closed
                  stroke={style.stroke}
                  strokeWidth={2}
                  fill={style.fill}
                />
                {/* Label centroid: small text via Konva would need import; skip for now. */}
                {z.polygon.map((p, i) => {
                  const [px, py] = worldToCanvas(p);
                  return <Circle key={i} x={px} y={py} radius={2.5} fill={style.stroke} />;
                })}
                {/* Type marker dot in centre (visual cue) */}
                <Circle x={cx} y={cy} radius={2} fill={style.stroke} opacity={0.4} />
              </Group>
            );
          })}

          {/* Live rectangle preview */}
          {liveRect && (
            <Line
              points={flatPolyline(liveRect)}
              closed
              stroke={liveStyle.stroke}
              strokeWidth={1.5}
              fill={liveStyle.fill}
              dash={[4, 4]}
            />
          )}

          {/* In-progress polygon */}
          {tool === "polygon" && polyPoints.length > 0 && (
            <Group>
              <Line
                points={[
                  ...flatPolyline(polyPoints),
                  ...(hover ? worldToCanvas(hover) : []),
                ]}
                stroke={liveStyle.stroke}
                strokeWidth={1.5}
                dash={[4, 4]}
              />
              {polyPoints.map((p, i) => {
                const [cx, cy] = worldToCanvas(p);
                return <Circle key={i} x={cx} y={cy} radius={4} fill={liveStyle.stroke} />;
              })}
            </Group>
          )}
        </Layer>
      </Stage>
    </div>
  );
}

function defaultLabelForType(type: ZoneType, existing: Zone[]): string {
  const sameType = existing.filter((z) => z.type === type).length;
  const base = type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ");
  return sameType > 0 ? `${base} ${sameType + 1}` : base;
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
        "flex h-7 w-7 items-center justify-center rounded-md text-neutral-700 transition",
        active ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"
      )}
    >
      {children}
    </button>
  );
}
