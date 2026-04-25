import { z } from "zod";

export const PointSchema = z
  .tuple([z.number(), z.number()])
  .describe("Point as [x, y] in meters. Origin (0,0) is bottom-left.");

export const FootprintSchema = z.object({
  points: z
    .array(PointSchema)
    .min(3)
    .describe("Closed polygon vertices in counter-clockwise order, units in meters."),
});

export const RoomTypeSchema = z.enum([
  "living",
  "dining",
  "kitchen",
  "bedroom",
  "master_bedroom",
  "bathroom",
  "toilet",
  "office",
  "hallway",
  "entry",
  "balcony",
  "closet",
  "laundry",
  "stairs",
  "garage",
  "other",
]);

export const RoomSchema = z.object({
  id: z.string().describe("Unique room id, e.g. 'r1'"),
  name: z.string().describe("Human readable room name, e.g. 'Master Bedroom'"),
  type: RoomTypeSchema,
  polygon: z
    .array(PointSchema)
    .min(3)
    .describe("Inner room polygon (interior face of walls), CCW order, in meters."),
  area: z.number().positive().describe("Approximate floor area in square meters."),
  description: z.string().optional(),
});

export const WallTypeSchema = z.enum(["exterior", "interior"]);

export const WallSchema = z.object({
  id: z.string().describe("Unique wall id, e.g. 'w1'"),
  start: PointSchema,
  end: PointSchema,
  thickness: z
    .number()
    .positive()
    .describe("Wall thickness in meters, typical 0.1-0.25."),
  type: WallTypeSchema,
});

export const DoorSchema = z.object({
  id: z.string(),
  wall_id: z.string().describe("ID of the wall this door is on."),
  position: z
    .number()
    .min(0)
    .max(1)
    .describe("Center position along the wall, 0..1 from wall.start to wall.end."),
  width: z.number().positive().describe("Door width in meters, typical 0.8-1.0."),
  height: z.number().positive().default(2.1),
  hinge: z.enum(["left", "right"]).default("left"),
  swing: z.enum(["in", "out"]).default("in"),
});

export const WindowSchema = z.object({
  id: z.string(),
  wall_id: z.string().describe("ID of the wall this window is on (must be exterior)."),
  position: z.number().min(0).max(1),
  width: z.number().positive().describe("Window width in meters."),
  height: z.number().positive().describe("Window pane height in meters."),
  sill_height: z
    .number()
    .min(0)
    .default(0.9)
    .describe("Bottom of window above floor, typical 0.9 (1.1 for kitchen)."),
});

export const FurnitureTypeSchema = z.enum([
  "bed_single",
  "bed_double",
  "bed_queen",
  "bed_king",
  "sofa",
  "armchair",
  "coffee_table",
  "dining_table",
  "chair",
  "kitchen_counter",
  "stove",
  "fridge",
  "sink",
  "toilet",
  "bathtub",
  "shower",
  "desk",
  "wardrobe",
  "tv_stand",
  "rug",
  "plant",
]);

export const FurnitureSchema = z.object({
  id: z.string(),
  type: FurnitureTypeSchema,
  room_id: z.string(),
  position: PointSchema.describe("Center of footprint in meters."),
  rotation_deg: z
    .number()
    .default(0)
    .describe("Rotation in degrees, 0 = facing +Y, CCW positive."),
  dimensions: z
    .tuple([z.number().positive(), z.number().positive(), z.number().positive()])
    .describe("[width_x, depth_y, height_z] in meters."),
});

export const SiteFeatureTypeSchema = z.enum([
  "garden",
  "lawn",
  "tree",
  "deck",
  "patio_outdoor",
  "pool",
  "parking",
  "planter",
  "path",
  "fence",
]);
export type SiteFeatureType = z.infer<typeof SiteFeatureTypeSchema>;

export const SiteFeatureSchema = z.object({
  id: z.string().describe("Unique site feature id, e.g. 'sf_garden_n'"),
  type: SiteFeatureTypeSchema,
  name: z.string().optional().describe("Optional human-readable label, e.g. 'North garden'"),
  polygon: z
    .array(PointSchema)
    .min(3)
    .describe(
      "CCW polygon in meters in the SAME world coordinate system as the building footprint. Site features are typically placed OUTSIDE the building footprint, in a ~15m halo around it."
    ),
  notes: z.string().optional(),
});
export type SiteFeature = z.infer<typeof SiteFeatureSchema>;

export const LayoutSchema = z.object({
  building: z.object({
    footprint: z.array(PointSchema).min(3),
    floor_height: z
      .number()
      .positive()
      .default(2.8)
      .describe("Interior ceiling height in meters."),
  }),
  walls: z.array(WallSchema).min(1),
  rooms: z.array(RoomSchema).min(1),
  doors: z.array(DoorSchema).default([]),
  windows: z.array(WindowSchema).default([]),
  furniture: z.array(FurnitureSchema).default([]),
  site_features: z
    .array(SiteFeatureSchema)
    .default([])
    .describe(
      "Outdoor features placed around the building (gardens, trees, parking, decks, pools, etc.). NOT rooms — they live outside the footprint."
    ),
  notes: z
    .string()
    .optional()
    .describe("Brief 1-2 sentence summary of the design choice."),
});

export type Point = z.infer<typeof PointSchema>;
export type Footprint = z.infer<typeof FootprintSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type RoomType = z.infer<typeof RoomTypeSchema>;
export type Wall = z.infer<typeof WallSchema>;
export type Door = z.infer<typeof DoorSchema>;
export type Window = z.infer<typeof WindowSchema>;
export type Furniture = z.infer<typeof FurnitureSchema>;
export type FurnitureType = z.infer<typeof FurnitureTypeSchema>;
export type Layout = z.infer<typeof LayoutSchema>;

export const PinSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(280),
  kind: z.enum(["include", "avoid"]).default("include"),
});
export type Pin = z.infer<typeof PinSchema>;

export const CritiqueIssueSchema = z.object({
  id: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  title: z.string().min(1),
  description: z.string().min(1),
  affected_rooms: z.array(z.string()).default([]),
  suggested_fix: z
    .string()
    .describe("A specific, actionable instruction phrased as a refinement prompt the user could send to the AI."),
});
export type CritiqueIssue = z.infer<typeof CritiqueIssueSchema>;

export const CritiqueSchema = z.object({
  overall: z.string().describe("1-2 sentence overall verdict on the design."),
  score_out_of_10: z.number().min(0).max(10),
  issues: z.array(CritiqueIssueSchema).max(10),
});
export type Critique = z.infer<typeof CritiqueSchema>;

export const PriorTurnSchema = z.object({
  prompt: z.string().min(1).max(2000),
  layout: LayoutSchema,
  toolUseId: z.string().min(1),
});
export type PriorTurn = z.infer<typeof PriorTurnSchema>;

export const ConversationRequestSchema = z.object({
  footprint: FootprintSchema,
  priorTurns: z.array(PriorTurnSchema).default([]),
  newPrompt: z.string().min(1).max(2000),
});
export type ConversationRequest = z.infer<typeof ConversationRequestSchema>;
