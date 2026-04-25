"use client";

import { Suspense, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Environment,
  OrbitControls,
  PerspectiveCamera,
  ContactShadows,
  Sky,
} from "@react-three/drei";
import * as THREE from "three";
import type { Furniture, Layout, Point, SiteFeature, Wall } from "@/lib/schema";
import { bbox, distance, polygonCentroid } from "@/lib/geometry";
import { Compass, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  layout: Layout;
}

type ViewMode = "perspective" | "top" | "iso";

export default function Scene3D({ layout }: Props) {
  const [view, setView] = useState<ViewMode>("perspective");
  const [showShadows, setShowShadows] = useState(true);

  // Compose a center + span over the building footprint AND site features so the
  // camera frames everything (e.g. a garden wraps around the house).
  const center = useMemo(() => {
    const allPts: Point[] = [...layout.building.footprint];
    for (const sf of layout.site_features) allPts.push(...sf.polygon);
    const c = polygonCentroid(allPts.length ? allPts : layout.building.footprint);
    return c;
  }, [layout]);

  const b = useMemo(() => {
    const allPts: Point[] = [...layout.building.footprint];
    for (const sf of layout.site_features) allPts.push(...sf.polygon);
    return bbox(allPts.length ? allPts : layout.building.footprint);
  }, [layout]);
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY);

  const cameraSpec = useMemo(() => {
    const dist = span * 1.6;
    if (view === "top") {
      return {
        position: [center[0], span * 1.4, -center[1]] as [number, number, number],
        fov: 35,
      };
    }
    if (view === "iso") {
      return {
        position: [
          center[0] + span * 0.9,
          span * 0.95,
          -center[1] + span * 0.9,
        ] as [number, number, number],
        fov: 30,
      };
    }
    return {
      position: [
        center[0] + dist * 0.6,
        span * 0.7,
        -center[1] + dist * 0.85,
      ] as [number, number, number],
      fov: 45,
    };
  }, [view, span, center]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-neutral-200 bg-gradient-to-b from-sky-50 to-neutral-100">
      <div className="absolute top-2 left-2 z-10 flex gap-1 rounded-lg border border-neutral-200 bg-white/90 p-1 shadow-sm backdrop-blur">
        <ViewBtn active={view === "perspective"} onClick={() => setView("perspective")}>
          Perspective
        </ViewBtn>
        <ViewBtn active={view === "iso"} onClick={() => setView("iso")}>
          Isometric
        </ViewBtn>
        <ViewBtn active={view === "top"} onClick={() => setView("top")}>
          Top
        </ViewBtn>
        <div className="mx-1 w-px bg-neutral-200" />
        <button
          type="button"
          title="Toggle shadows"
          onClick={() => setShowShadows((s) => !s)}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md transition",
            showShadows ? "bg-amber-200 text-amber-900" : "hover:bg-neutral-100 text-neutral-700"
          )}
        >
          <Sun size={14} />
        </button>
      </div>

      <Canvas shadows={showShadows} dpr={[1, 2]}>
        <PerspectiveCamera
          makeDefault
          position={cameraSpec.position}
          fov={cameraSpec.fov}
          near={0.1}
          far={500}
        />
        <OrbitControls
          target={[center[0], 1.4, -center[1]]}
          enablePan
          enableZoom
          maxPolarAngle={Math.PI / 2 - 0.05}
          minDistance={3}
          maxDistance={span * 4}
        />

        <ambientLight intensity={0.55} />
        <directionalLight
          position={[span, span * 1.5, -span]}
          intensity={1.4}
          castShadow={showShadows}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-near={1}
          shadow-camera-far={span * 6}
          shadow-camera-left={-span * 1.5}
          shadow-camera-right={span * 1.5}
          shadow-camera-top={span * 1.5}
          shadow-camera-bottom={-span * 1.5}
          shadow-bias={-0.0005}
        />

        <Suspense fallback={null}>
          <Sky distance={400000} sunPosition={[20, 30, 10]} inclination={0.5} azimuth={0.25} />
          <Environment preset="apartment" />
        </Suspense>

        {/* Ground (grass) */}
        <mesh
          rotation-x={-Math.PI / 2}
          position={[center[0], -0.005, -center[1]]}
          receiveShadow
        >
          <planeGeometry args={[span * 6, span * 6]} />
          <meshStandardMaterial color="#86b673" roughness={1} />
        </mesh>

        {/* Floor of building */}
        <BuildingFloor footprint={layout.building.footprint} />

        {/* Site features (gardens, trees, decks, etc.) — render between ground and walls */}
        {layout.site_features.map((sf) => (
          <SiteFeatureMesh key={sf.id} feature={sf} />
        ))}

        {/* Walls */}
        {layout.walls.map((w) => (
          <WallMesh key={w.id} wall={w} height={layout.building.floor_height} />
        ))}

        {/* Furniture */}
        {layout.furniture.map((f) => (
          <FurnitureMesh key={f.id} item={f} />
        ))}

        {/* Soft ground shadow under building */}
        <ContactShadows
          position={[center[0], 0.001, -center[1]]}
          opacity={0.35}
          scale={span * 2.5}
          blur={2.4}
          far={4}
        />
      </Canvas>

      <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-[11px] text-neutral-600 shadow-sm">
        <Compass size={12} /> Drag to orbit · scroll to zoom
      </div>
    </div>
  );
}

function ViewBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2 py-1 text-xs transition",
        active ? "bg-neutral-900 text-white" : "hover:bg-neutral-100 text-neutral-700"
      )}
    >
      {children}
    </button>
  );
}

function BuildingFloor({ footprint }: { footprint: Point[] }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    if (footprint.length === 0) return s;
    s.moveTo(footprint[0][0], -footprint[0][1]);
    for (let i = 1; i < footprint.length; i++) {
      s.lineTo(footprint[i][0], -footprint[i][1]);
    }
    s.closePath();
    return s;
  }, [footprint]);
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color="#d6c5a3" roughness={0.85} metalness={0} />
    </mesh>
  );
}

function WallMesh({ wall, height }: { wall: Wall; height: number }) {
  const length = distance(wall.start, wall.end);
  const cx = (wall.start[0] + wall.end[0]) / 2;
  const cy = (wall.start[1] + wall.end[1]) / 2;
  const dx = wall.end[0] - wall.start[0];
  const dy = wall.end[1] - wall.start[1];
  // Default box length axis is X. Rotate around Y so X aligns with wall vector.
  // 3D coords: (cx, h/2, -cy), rotation y = -atan2(-dy, dx) = atan2(dy, dx) reversed because z = -y
  const angle = Math.atan2(-dy, dx);
  return (
    <mesh
      position={[cx, height / 2, -cy]}
      rotation={[0, angle, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[length, height, wall.thickness]} />
      <meshStandardMaterial color={wall.type === "exterior" ? "#f5f1ea" : "#fafafa"} roughness={0.9} />
    </mesh>
  );
}

function siteShape(polygon: Point[]): THREE.Shape {
  const s = new THREE.Shape();
  if (polygon.length === 0) return s;
  s.moveTo(polygon[0][0], -polygon[0][1]);
  for (let i = 1; i < polygon.length; i++) {
    s.lineTo(polygon[i][0], -polygon[i][1]);
  }
  s.closePath();
  return s;
}

function siteRadius(polygon: Point[], centroid: Point): number {
  let max = 0;
  for (const p of polygon) {
    const d = Math.hypot(p[0] - centroid[0], p[1] - centroid[1]);
    if (d > max) max = d;
  }
  return max;
}

function SiteFeatureMesh({ feature }: { feature: SiteFeature }) {
  const c = polygonCentroid(feature.polygon);

  if (feature.type === "tree") {
    const r = Math.max(0.4, siteRadius(feature.polygon, c) * 0.7);
    return (
      <group position={[c[0], 0, -c[1]]}>
        {/* Trunk */}
        <mesh position={[0, 0.6, 0]} castShadow>
          <cylinderGeometry args={[0.1, 0.14, 1.2, 10]} />
          <meshStandardMaterial color="#78350f" roughness={1} />
        </mesh>
        {/* Canopy */}
        <mesh position={[0, 1.6, 0]} castShadow>
          <sphereGeometry args={[r, 12, 10]} />
          <meshStandardMaterial color="#15803d" roughness={1} />
        </mesh>
      </group>
    );
  }

  if (feature.type === "fence") {
    // Render as low extruded strip following the polygon outline.
    const shape = siteShape(feature.polygon);
    return (
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <extrudeGeometry args={[shape, { depth: 0.05, bevelEnabled: false }]} />
        <meshStandardMaterial color="#92400e" roughness={1} />
      </mesh>
    );
  }

  if (feature.type === "planter") {
    // Slight raised box.
    const shape = siteShape(feature.polygon);
    return (
      <mesh position={[0, 0, 0]} castShadow receiveShadow>
        <extrudeGeometry args={[shape, { depth: 0.4, bevelEnabled: false }]} />
        <meshStandardMaterial color="#65a30d" roughness={0.95} />
      </mesh>
    );
  }

  // Flat patches: garden, lawn, deck, patio_outdoor, pool, parking, path
  const yOffset =
    feature.type === "deck" || feature.type === "patio_outdoor"
      ? 0.06
      : feature.type === "pool"
        ? -0.05
        : 0.005; // sit just above ground to avoid z-fighting
  const color = sitePatchColor(feature.type);
  const shape = siteShape(feature.polygon);
  return (
    <mesh
      position={[0, yOffset, 0]}
      rotation-x={-Math.PI / 2}
      receiveShadow
    >
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial
        color={color.fill}
        roughness={color.roughness}
        metalness={feature.type === "pool" ? 0.3 : 0}
        transparent={feature.type === "pool"}
        opacity={feature.type === "pool" ? 0.85 : 1}
      />
    </mesh>
  );
}

function sitePatchColor(type: string): { fill: string; roughness: number } {
  switch (type) {
    case "garden":
      return { fill: "#4ade80", roughness: 1 };
    case "lawn":
      return { fill: "#86efac", roughness: 1 };
    case "deck":
      return { fill: "#a98c63", roughness: 0.7 };
    case "patio_outdoor":
      return { fill: "#d6c5a3", roughness: 0.85 };
    case "pool":
      return { fill: "#0ea5e9", roughness: 0.1 };
    case "parking":
      return { fill: "#475569", roughness: 0.95 };
    case "path":
      return { fill: "#cbd5e1", roughness: 0.9 };
    default:
      return { fill: "#9ca3af", roughness: 0.9 };
  }
}

function FurnitureMesh({ item }: { item: Furniture }) {
  const [w, depth, h] = item.dimensions;
  const angle = (-item.rotation_deg * Math.PI) / 180;
  const color = furniture3DColor(item.type);
  const yOffset = h / 2;

  // Use cylinder for round-ish items
  if (item.type === "toilet" || item.type === "sink") {
    return (
      <mesh
        position={[item.position[0], yOffset, -item.position[1]]}
        rotation={[0, angle, 0]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[Math.min(w, depth) / 2, Math.min(w, depth) / 2, h, 24]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
    );
  }
  if (item.type === "plant") {
    return (
      <group position={[item.position[0], 0, -item.position[1]]} rotation={[0, angle, 0]}>
        <mesh position={[0, 0.15, 0]} castShadow>
          <cylinderGeometry args={[w / 4, w / 3, 0.3, 16]} />
          <meshStandardMaterial color="#8b5a2b" />
        </mesh>
        <mesh position={[0, 0.6, 0]} castShadow>
          <sphereGeometry args={[Math.max(w, depth) / 2, 16, 16]} />
          <meshStandardMaterial color="#6aa84f" roughness={1} />
        </mesh>
      </group>
    );
  }

  return (
    <mesh
      position={[item.position[0], yOffset, -item.position[1]]}
      rotation={[0, angle, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[w, h, depth]} />
      <meshStandardMaterial color={color} roughness={0.7} />
    </mesh>
  );
}

function furniture3DColor(type: string): string {
  if (type.startsWith("bed")) return "#dbeafe";
  if (type === "sofa" || type === "armchair") return "#94a3b8";
  if (type.includes("table") || type === "desk" || type === "tv_stand") return "#a98c63";
  if (type === "kitchen_counter") return "#e7e5e4";
  if (type === "stove") return "#3f3f46";
  if (type === "fridge") return "#e5e7eb";
  if (type === "wardrobe" || type === "chair") return "#a16207";
  if (type === "bathtub" || type === "shower") return "#f1f5f9";
  if (type === "rug") return "#d97706";
  return "#cbd5e1";
}
