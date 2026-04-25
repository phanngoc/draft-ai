import { NextRequest } from "next/server";
import { turnsRepo } from "@/lib/db";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; turnId: string }> };

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id: projectId, turnId } = await ctx.params;
  const turn = turnsRepo.get(turnId);
  if (!turn || turn.projectId !== projectId) {
    return Response.json({ error: "Turn not found" }, { status: 404 });
  }
  turnsRepo.delete(turnId);
  return Response.json({ ok: true });
}
