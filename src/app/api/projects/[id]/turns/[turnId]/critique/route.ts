import { NextRequest } from "next/server";
import { CLAUDE_MODEL, CRITIQUE_TOOL, getClient } from "@/lib/claude";
import { projectsRepo, turnsRepo } from "@/lib/db";
import { CritiqueSchema } from "@/lib/schema";
import { CRITIQUE_SYSTEM, buildCritiquePrompt } from "@/lib/prompts";

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
      { error: "Critique requires a completed layout." },
      { status: 400 }
    );
  }
  const project = projectsRepo.get(projectId);

  try {
    const client = getClient();
    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      system: [
        {
          type: "text",
          text: CRITIQUE_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [CRITIQUE_TOOL],
      tool_choice: { type: "tool", name: CRITIQUE_TOOL.name },
      messages: [
        {
          role: "user",
          content: buildCritiquePrompt(turn.layout, project?.pins ?? []),
        },
      ],
    });

    const toolUse = message.content.find(
      (c) => c.type === "tool_use" && c.name === CRITIQUE_TOOL.name
    );
    if (!toolUse || toolUse.type !== "tool_use") {
      return Response.json(
        { error: "Model did not return a critique." },
        { status: 502 }
      );
    }
    const validated = CritiqueSchema.safeParse(toolUse.input);
    if (!validated.success) {
      return Response.json(
        {
          error: `Critique validation failed: ${validated.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ")}`,
        },
        { status: 502 }
      );
    }
    return Response.json({ critique: validated.data, usage: message.usage });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Critique failed" },
      { status: 500 }
    );
  }
}
