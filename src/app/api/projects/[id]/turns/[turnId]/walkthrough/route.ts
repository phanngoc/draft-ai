import { NextRequest } from "next/server";
import { CLAUDE_MODEL, getClient } from "@/lib/claude";
import { turnsRepo } from "@/lib/db";
import { WALKTHROUGH_SYSTEM, buildWalkthroughPrompt } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string; turnId: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id: projectId, turnId } = await ctx.params;
  const turn = turnsRepo.get(turnId);
  if (!turn || turn.projectId !== projectId) {
    return Response.json({ error: "Turn not found" }, { status: 404 });
  }
  if (turn.status !== "done" || !turn.layout) {
    return Response.json(
      { error: "Walkthrough requires a completed layout." },
      { status: 400 }
    );
  }

  try {
    const client = getClient();
    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1200,
      system: [
        {
          type: "text",
          text: WALKTHROUGH_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        { role: "user", content: buildWalkthroughPrompt(turn.layout) },
      ],
    });

    const text = message.content
      .filter((c) => c.type === "text")
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("\n")
      .trim();

    if (!text) {
      return Response.json(
        { error: "Model did not return a narrative." },
        { status: 502 }
      );
    }

    return Response.json({ narrative: text, usage: message.usage });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Walkthrough failed",
      },
      { status: 500 }
    );
  }
}
