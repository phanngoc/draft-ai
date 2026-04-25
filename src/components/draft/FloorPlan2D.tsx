"use client";

import { useMemo, useRef } from "react";
import type {
  Building,
  Door,
  Layout,
  Point,
  SiteFeature,
  Wall,
  Window,
  Zone,
} from "@/lib/schema";
import {
  bbox,
  distance,
  pointOnWall,
  polygonCentroid,
  wallNormal,
} from "@/lib/geometry";
import { Download } from "lucide-react";

interface Props {
  layout: Layout;
  /** All user-drawn zones from the project. Outdoor zones render as
   * authoritative background; building zones are skipped here since the
   * Layout already contains the building footprint + interior detail. */
  zones?: Zone[];
}

// Y-flip helper: world is Y-up, SVG is Y-down.
const sx = (x: number) => x;
const sy = (y: number) => -y;
const svgPt = (p: Point) => `${sx(p[0])},${sy(p[1])}`;
const flat = (pts: Point[]) => pts.map(svgPt).join(" ");

export default function FloorPlan2D({ layout, zones }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  const siteFeatures = useMemo(
    () => layout.site_features ?? [],
    [layout.site_features]
  );
  const buildings = layout.buildings;

  // Outdoor zones drawn by the designer (authoritative — render even if the
  // AI didn't echo them as site_features).
  const outdoorZones = useMemo(
    () => (zones ?? []).filter((z) => z.type !== "building"),
    [zones]
  );

  // Skip site_features that just duplicate an outdoor zone (matched by
  // approximate polygon equality) so we don't double-render the same shape.
  const decorativeSiteFeatures = useMemo(() => {
    if (outdoorZones.length === 0) return siteFeatures;
    return siteFeatures.filter(
      (sf) =>
        !outdoorZones.some(
          (z) =>
            z.type === sf.type &&
            polygonsApproxEqual(z.polygon, sf.polygon)
        )
    );
  }, [siteFeatures, outdoorZones]);

  const allBuildingPts = useMemo(
    () => buildings.flatMap((b) => b.footprint),
    [buildings]
  );

  const view = useMemo(() => {
    // Combined bbox over every building + site features + outdoor zones.
    const allPts: Point[] = [...allBuildingPts];
    for (const sf of siteFeatures) allPts.push(...sf.polygon);
    for (const z of outdoorZones) allPts.push(...z.polygon);
    const b = bbox(allPts.length ? allPts : allBuildingPts);
    const PAD = 2.5; // meters
    const w = b.maxX - b.minX + PAD * 2;
    const h = b.maxY - b.minY + PAD * 2;
    return {
      viewBox: `${b.minX - PAD} ${-b.maxY - PAD} ${w} ${h}`,
      bbox: b,
      pad: PAD,
    };
  }, [allBuildingPts, siteFeatures, outdoorZones]);

  function exportPng() {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const svg64 = btoa(unescape(encodeURIComponent(xml)));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = 2;
      canvas.width = svg.clientWidth * scale;
      canvas.height = svg.clientHeight * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const a = document.createElement("a");
      a.download = "floorplan.png";
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = `data:image/svg+xml;base64,${svg64}`;
  }

  // Overall site bbox is what we already computed (view.bbox), used for
  // background grid, dimension callouts, and corner ornaments.
  const dims = view.bbox;
  const totalW = dims.maxX - dims.minX;
  const totalH = dims.maxY - dims.minY;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <button
        type="button"
        onClick={exportPng}
        title="Export PNG"
        className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700 shadow-sm hover:bg-neutral-50"
      >
        <Download size={12} /> PNG
      </button>
      <svg
        ref={svgRef}
        viewBox={view.viewBox}
        preserveAspectRatio="xMidYMid meet"
        className="block h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="grid"
            x={dims.minX}
            y={-dims.maxY}
            width="1"
            height="1"
            patternUnits="userSpaceOnUse"
          >
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#eef2f7" strokeWidth="0.02" />
          </pattern>
          <pattern
            id="grid-major"
            x={dims.minX}
            y={-dims.maxY}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
          >
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="#cbd5e1" strokeWidth="0.025" />
          </pattern>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
          </marker>
        </defs>

        {/* Background */}
        <rect
          x={dims.minX - view.pad}
          y={-dims.maxY - view.pad}
          width={totalW + view.pad * 2}
          height={totalH + view.pad * 2}
          fill="#ffffff"
        />

        {/* Grid limited to footprint area */}
        <g
          clipPath="url(#footprint-clip)"
          style={{ pointerEvents: "none" }}
        />
        <rect
          x={dims.minX}
          y={-dims.maxY}
          width={totalW}
          height={totalH}
          fill="url(#grid)"
        />
        <rect
          x={dims.minX}
          y={-dims.maxY}
          width={totalW}
          height={totalH}
          fill="url(#grid-major)"
        />

        {/* Outdoor zones (user-drawn) — render first as authoritative background */}
        {outdoorZones.map((z) => (
          <ZoneSymbol key={z.id} zone={z} />
        ))}

        {/* AI decorative site features (trees, planters, etc.) — render on top
            of zones but under buildings */}
        {decorativeSiteFeatures.map((sf) => (
          <SiteFeatureSymbol key={sf.id} feature={sf} />
        ))}

        {/* Buildings — one self-contained drawing per building zone */}
        {buildings.map((b) => (
          <BuildingSymbol key={b.zone_id} building={b} />
        ))}

        {/* Overall dimensions */}
        <DimensionLine
          from={[dims.minX, dims.minY - 1]}
          to={[dims.maxX, dims.minY - 1]}
          label={`${totalW.toFixed(2)} m`}
        />
        <DimensionLine
          from={[dims.minX - 1, dims.minY]}
          to={[dims.minX - 1, dims.maxY]}
          label={`${totalH.toFixed(2)} m`}
          vertical
        />

        {/* Scale bar */}
        <ScaleBar x={dims.maxX - 2} y={dims.minY - 1.6} />

        {/* North arrow */}
        <NorthArrow x={dims.maxX + 0.8} y={dims.maxY - 0.6} />
      </svg>
    </div>
  );
}

function DimensionLine({
  from,
  to,
  label,
  vertical,
}: {
  from: Point;
  to: Point;
  label: string;
  vertical?: boolean;
}) {
  const tickHalf = 0.15;
  const offset = 0.4;
  const tickFrom: [Point, Point] = vertical
    ? [
        [from[0] - tickHalf, from[1]],
        [from[0] + tickHalf, from[1]],
      ]
    : [
        [from[0], from[1] - tickHalf],
        [from[0], from[1] + tickHalf],
      ];
  const tickTo: [Point, Point] = vertical
    ? [
        [to[0] - tickHalf, to[1]],
        [to[0] + tickHalf, to[1]],
      ]
    : [
        [to[0], to[1] - tickHalf],
        [to[0], to[1] + tickHalf],
      ];
  const mid: Point = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const labelOffset: Point = vertical ? [-offset, 0] : [0, offset];

  return (
    <g>
      <line
        x1={sx(from[0])}
        y1={sy(from[1])}
        x2={sx(to[0])}
        y2={sy(to[1])}
        stroke="#475569"
        strokeWidth="0.02"
        markerStart="url(#arrow)"
        markerEnd="url(#arrow)"
      />
      <line
        x1={sx(tickFrom[0][0])}
        y1={sy(tickFrom[0][1])}
        x2={sx(tickFrom[1][0])}
        y2={sy(tickFrom[1][1])}
        stroke="#475569"
        strokeWidth="0.02"
      />
      <line
        x1={sx(tickTo[0][0])}
        y1={sy(tickTo[0][1])}
        x2={sx(tickTo[1][0])}
        y2={sy(tickTo[1][1])}
        stroke="#475569"
        strokeWidth="0.02"
      />
      <text
        x={sx(mid[0] + labelOffset[0])}
        y={sy(mid[1] + labelOffset[1])}
        textAnchor="middle"
        fontSize="0.3"
        fontFamily="system-ui, sans-serif"
        fontWeight="500"
        fill="#1e293b"
        transform={
          vertical
            ? `rotate(-90 ${sx(mid[0] + labelOffset[0])} ${sy(mid[1] + labelOffset[1])})`
            : undefined
        }
      >
        {label}
      </text>
    </g>
  );
}

function WindowSymbol({ wall, window: win }: { wall: Wall; window: Window }) {
  const center = pointOnWall(wall, win.position);
  const len = distance(wall.start, wall.end);
  const dx = (wall.end[0] - wall.start[0]) / len;
  const dy = (wall.end[1] - wall.start[1]) / len;
  const half = win.width / 2;
  const a: Point = [center[0] - dx * half, center[1] - dy * half];
  const b: Point = [center[0] + dx * half, center[1] + dy * half];
  // perpendicular offsets for double-line look
  const nx = -dy * (wall.thickness / 2);
  const ny = dx * (wall.thickness / 2);
  return (
    <g>
      {/* white "gap" to mask wall */}
      <line
        x1={sx(a[0])}
        y1={sy(a[1])}
        x2={sx(b[0])}
        y2={sy(b[1])}
        stroke="white"
        strokeWidth={wall.thickness * 1.05}
      />
      {/* outer glass line */}
      <line
        x1={sx(a[0] + nx)}
        y1={sy(a[1] + ny)}
        x2={sx(b[0] + nx)}
        y2={sy(b[1] + ny)}
        stroke="#0f172a"
        strokeWidth="0.025"
      />
      <line
        x1={sx(a[0] - nx)}
        y1={sy(a[1] - ny)}
        x2={sx(b[0] - nx)}
        y2={sy(b[1] - ny)}
        stroke="#0f172a"
        strokeWidth="0.025"
      />
      {/* center pane line */}
      <line
        x1={sx(a[0])}
        y1={sy(a[1])}
        x2={sx(b[0])}
        y2={sy(b[1])}
        stroke="#0f172a"
        strokeWidth="0.02"
      />
    </g>
  );
}

function DoorSymbol({ wall, door }: { wall: Wall; door: Door }) {
  const center = pointOnWall(wall, door.position);
  const len = distance(wall.start, wall.end);
  const dx = (wall.end[0] - wall.start[0]) / len;
  const dy = (wall.end[1] - wall.start[1]) / len;
  const half = door.width / 2;
  const a: Point = [center[0] - dx * half, center[1] - dy * half];
  const b: Point = [center[0] + dx * half, center[1] + dy * half];
  // perpendicular: pick "inside" direction (heuristic: rotate normal one way)
  const n = wallNormal(wall);
  const swingDir = door.swing === "out" ? -1 : 1;
  const tip: Point = [a[0] + n[0] * door.width * swingDir, a[1] + n[1] * door.width * swingDir];
  // arc from b to tip, sweep ~90deg
  return (
    <g>
      {/* mask wall */}
      <line
        x1={sx(a[0])}
        y1={sy(a[1])}
        x2={sx(b[0])}
        y2={sy(b[1])}
        stroke="white"
        strokeWidth={wall.thickness * 1.05}
      />
      {/* hinge to tip (door panel) */}
      <line
        x1={sx(a[0])}
        y1={sy(a[1])}
        x2={sx(tip[0])}
        y2={sy(tip[1])}
        stroke="#0f172a"
        strokeWidth="0.03"
      />
      {/* swing arc */}
      <path
        d={`M ${sx(tip[0])} ${sy(tip[1])} A ${door.width} ${door.width} 0 0 ${
          swingDir > 0 ? 1 : 0
        } ${sx(b[0])} ${sy(b[1])}`}
        fill="none"
        stroke="#0f172a"
        strokeWidth="0.015"
        strokeDasharray="0.05 0.05"
      />
    </g>
  );
}

function ScaleBar({ x, y }: { x: number; y: number }) {
  // 2m bar with 0.5m subdivisions
  return (
    <g>
      <rect x={sx(x)} y={sy(y)} width="0.5" height="0.08" fill="#0f172a" />
      <rect x={sx(x + 0.5)} y={sy(y)} width="0.5" height="0.08" fill="#ffffff" stroke="#0f172a" strokeWidth="0.015" />
      <rect x={sx(x + 1)} y={sy(y)} width="0.5" height="0.08" fill="#0f172a" />
      <rect x={sx(x + 1.5)} y={sy(y)} width="0.5" height="0.08" fill="#ffffff" stroke="#0f172a" strokeWidth="0.015" />
      <text x={sx(x)} y={sy(y) + 0.3} fontSize="0.22" fontFamily="system-ui" fill="#1e293b">0</text>
      <text x={sx(x + 1)} y={sy(y) + 0.3} fontSize="0.22" fontFamily="system-ui" fill="#1e293b" textAnchor="middle">1m</text>
      <text x={sx(x + 2)} y={sy(y) + 0.3} fontSize="0.22" fontFamily="system-ui" fill="#1e293b" textAnchor="end">2m</text>
    </g>
  );
}

function NorthArrow({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${sx(x)} ${sy(y)})`}>
      <circle r="0.45" fill="white" stroke="#1e293b" strokeWidth="0.025" />
      <polygon points="0,-0.4 0.12,0.05 -0.12,0.05" fill="#0f172a" />
      <polygon points="0,0.05 0.12,0.05 -0.12,0.05" fill="white" stroke="#0f172a" strokeWidth="0.015" />
      <text x="0" y="-0.5" fontSize="0.22" fontFamily="system-ui" fontWeight="700" fill="#0f172a" textAnchor="middle">N</text>
    </g>
  );
}

function polygonsApproxEqual(a: Point[], b: Point[], eps = 0.05): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i][0] - b[i][0]) > eps) return false;
    if (Math.abs(a[i][1] - b[i][1]) > eps) return false;
  }
  return true;
}

function ZoneSymbol({ zone }: { zone: Zone }) {
  // A user-drawn zone shares the same look as a site feature of the same type.
  // Reuse SiteFeatureSymbol semantics by adapting the zone into its shape.
  return (
    <SiteFeatureSymbol
      feature={{
        id: zone.id,
        type: zone.type === "driveway" ? "path" : (zone.type as SiteFeature["type"]),
        name: zone.label,
        polygon: zone.polygon,
      }}
    />
  );
}

function BuildingSymbol({ building }: { building: Building }) {
  const wallById = new Map<string, Wall>();
  for (const w of building.walls) wallById.set(w.id, w);
  return (
    <g>
      {/* Footprint outline (light) */}
      <polygon
        points={flat(building.footprint)}
        fill="#fafafa"
        stroke="#94a3b8"
        strokeWidth="0.04"
        strokeDasharray="0.3 0.2"
      />

      {/* Room polygons */}
      {building.rooms.map((room) => {
        const c = polygonCentroid(room.polygon);
        return (
          <g key={room.id}>
            <polygon
              points={flat(room.polygon)}
              fill={roomColor(room.type)}
              fillOpacity={0.4}
              stroke="#0f172a"
              strokeWidth="0.02"
              strokeOpacity={0.15}
            />
            <text
              x={sx(c[0])}
              y={sy(c[1])}
              textAnchor="middle"
              fontSize="0.35"
              fontFamily="system-ui, sans-serif"
              fontWeight="600"
              fill="#0f172a"
            >
              {room.name}
            </text>
            <text
              x={sx(c[0])}
              y={sy(c[1]) + 0.42}
              textAnchor="middle"
              fontSize="0.27"
              fontFamily="system-ui, sans-serif"
              fill="#475569"
            >
              {room.area.toFixed(1)} m²
            </text>
          </g>
        );
      })}

      {/* Walls */}
      {building.walls.map((w) => (
        <line
          key={w.id}
          x1={sx(w.start[0])}
          y1={sy(w.start[1])}
          x2={sx(w.end[0])}
          y2={sy(w.end[1])}
          stroke="#0f172a"
          strokeWidth={w.thickness}
          strokeLinecap="butt"
        />
      ))}

      {/* Windows */}
      {building.windows.map((win) => {
        const wall = wallById.get(win.wall_id);
        if (!wall) return null;
        return <WindowSymbol key={win.id} wall={wall} window={win} />;
      })}

      {/* Doors */}
      {building.doors.map((d) => {
        const wall = wallById.get(d.wall_id);
        if (!wall) return null;
        return <DoorSymbol key={d.id} wall={wall} door={d} />;
      })}

      {/* Furniture */}
      {building.furniture.map((f) => {
        const [w, depth] = f.dimensions;
        const rad = (f.rotation_deg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const corners: Point[] = [
          [-w / 2, -depth / 2],
          [w / 2, -depth / 2],
          [w / 2, depth / 2],
          [-w / 2, depth / 2],
        ].map(
          ([x, y]) =>
            [
              f.position[0] + x * cos - y * sin,
              f.position[1] + x * sin + y * cos,
            ] as Point
        );
        return (
          <polygon
            key={f.id}
            points={flat(corners)}
            fill={furnitureColor(f.type)}
            fillOpacity={0.6}
            stroke="#475569"
            strokeWidth="0.02"
          />
        );
      })}
    </g>
  );
}

function SiteFeatureSymbol({ feature }: { feature: SiteFeature }) {
  const c = polygonCentroid(feature.polygon);
  const style = siteStyle(feature.type);
  const showLabel = feature.type !== "tree" && feature.type !== "fence";
  return (
    <g>
      <polygon
        points={flat(feature.polygon)}
        fill={style.fill}
        fillOpacity={style.fillOpacity}
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
        strokeDasharray={style.strokeDasharray}
      />
      {feature.type === "tree" && (
        <g>
          {/* Trunk */}
          <circle cx={sx(c[0])} cy={sy(c[1])} r="0.12" fill="#78350f" />
          {/* Canopy outline ring */}
          <circle
            cx={sx(c[0])}
            cy={sy(c[1])}
            r={Math.max(0.4, polygonRadius(feature.polygon, c) * 0.8)}
            fill="none"
            stroke="#166534"
            strokeWidth="0.04"
          />
        </g>
      )}
      {showLabel && (
        <text
          x={sx(c[0])}
          y={sy(c[1])}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="0.28"
          fontFamily="system-ui, sans-serif"
          fontWeight="500"
          fill={style.labelColor}
        >
          {feature.name ?? siteLabel(feature.type)}
        </text>
      )}
    </g>
  );
}

function polygonRadius(polygon: Point[], centroid: Point): number {
  let max = 0;
  for (const p of polygon) {
    const d = Math.hypot(p[0] - centroid[0], p[1] - centroid[1]);
    if (d > max) max = d;
  }
  return max;
}

function siteStyle(type: string): {
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeWidth: string;
  strokeDasharray?: string;
  labelColor: string;
} {
  switch (type) {
    case "garden":
      return {
        fill: "#86efac",
        fillOpacity: 0.55,
        stroke: "#16a34a",
        strokeWidth: "0.04",
        labelColor: "#166534",
      };
    case "lawn":
      return {
        fill: "#bbf7d0",
        fillOpacity: 0.5,
        stroke: "#22c55e",
        strokeWidth: "0.03",
        strokeDasharray: "0.2 0.15",
        labelColor: "#166534",
      };
    case "tree":
      return {
        fill: "#86efac",
        fillOpacity: 0.7,
        stroke: "#166534",
        strokeWidth: "0.04",
        labelColor: "#166534",
      };
    case "deck":
    case "patio_outdoor":
      return {
        fill: "#fde68a",
        fillOpacity: 0.6,
        stroke: "#a16207",
        strokeWidth: "0.04",
        labelColor: "#7c2d12",
      };
    case "pool":
      return {
        fill: "#7dd3fc",
        fillOpacity: 0.65,
        stroke: "#0284c7",
        strokeWidth: "0.05",
        labelColor: "#075985",
      };
    case "parking":
      return {
        fill: "#cbd5e1",
        fillOpacity: 0.55,
        stroke: "#475569",
        strokeWidth: "0.04",
        strokeDasharray: "0.3 0.15",
        labelColor: "#1e293b",
      };
    case "planter":
      return {
        fill: "#bef264",
        fillOpacity: 0.7,
        stroke: "#65a30d",
        strokeWidth: "0.04",
        labelColor: "#365314",
      };
    case "path":
      return {
        fill: "#e5e7eb",
        fillOpacity: 0.7,
        stroke: "#94a3b8",
        strokeWidth: "0.03",
        labelColor: "#334155",
      };
    case "fence":
      return {
        fill: "#92400e",
        fillOpacity: 0.7,
        stroke: "#78350f",
        strokeWidth: "0.06",
        labelColor: "#78350f",
      };
    default:
      return {
        fill: "#e5e7eb",
        fillOpacity: 0.4,
        stroke: "#94a3b8",
        strokeWidth: "0.03",
        labelColor: "#475569",
      };
  }
}

function siteLabel(type: string): string {
  return (
    {
      garden: "Garden",
      lawn: "Lawn",
      tree: "Tree",
      deck: "Deck",
      patio_outdoor: "Patio",
      pool: "Pool",
      parking: "Parking",
      planter: "Planter",
      path: "Path",
      fence: "Fence",
    } as Record<string, string>
  )[type] ?? type;
}

function roomColor(type: string): string {
  switch (type) {
    case "living":
    case "dining":
      return "#fde68a";
    case "kitchen":
      return "#fed7aa";
    case "bedroom":
    case "master_bedroom":
      return "#bae6fd";
    case "bathroom":
    case "toilet":
      return "#bbf7d0";
    case "office":
      return "#ddd6fe";
    case "hallway":
    case "entry":
      return "#e2e8f0";
    case "balcony":
      return "#bef264";
    case "closet":
    case "laundry":
      return "#fecaca";
    case "garage":
      return "#cbd5e1";
    default:
      return "#f1f5f9";
  }
}

function furnitureColor(type: string): string {
  if (type.startsWith("bed")) return "#cbd5e1";
  if (type.startsWith("sofa") || type.startsWith("armchair")) return "#a3a3a3";
  if (type.includes("table") || type.includes("desk")) return "#a8a29e";
  if (type === "stove" || type === "fridge" || type === "kitchen_counter") return "#d1d5db";
  if (type === "toilet" || type === "sink" || type === "bathtub" || type === "shower")
    return "#e7e5e4";
  return "#d4d4d8";
}
