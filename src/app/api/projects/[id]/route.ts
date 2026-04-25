import { NextRequest } from "next/server";
import { z } from "zod";
import { projectsRepo, turnsRepo } from "@/lib/db";
import { FootprintSchema, PinSchema, ZoneSchema } from "@/lib/schema";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = projectsRepo.get(id);
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  const turns = turnsRepo.listByProject(id);
  return Response.json({ project, turns });
}

const PatchBody = z.object({
  title: z.string().min(1).max(120).optional(),
  footprint: FootprintSchema.nullable().optional(),
  zones: z.array(ZoneSchema).max(50).optional(),
  pins: z.array(PinSchema).max(20).optional(),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = projectsRepo.get(id);
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const updated = projectsRepo.update(id, parsed.data);
  const turns = turnsRepo.listByProject(id);
  return Response.json({ project: updated, turns });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const ok = projectsRepo.delete(id);
  if (!ok) return Response.json({ error: "Project not found" }, { status: 404 });
  return Response.json({ ok: true });
}
