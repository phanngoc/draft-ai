import { NextRequest } from "next/server";
import { projectsRepo, turnsRepo } from "@/lib/db";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = projectsRepo.get(id);
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  const cleared = turnsRepo.deleteFromIdx(id, 0);
  return Response.json({ ok: true, cleared });
}
