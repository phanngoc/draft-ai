import { NextRequest } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL, LAYOUT_TOOL, getClient } from "@/lib/claude";
import { LayoutSchema, type Pin, type Zone } from "@/lib/schema";
import { SYSTEM_PROMPT, buildFollowUpPrompt, buildUserPrompt } from "@/lib/prompts";
import { projectsRepo, turnsRepo, type Turn } from "@/lib/db";
import { pointsApproxEqual } from "@/lib/geometry";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 90;

type SseEvent =
  | { type: "start"; turnId: string }
  | { type: "progress"; partialChars: number }
  | {
      type: "done";
      turnId: string;
      layout: unknown;
      toolUseId: string;
      notes?: string;
    }
  | { type: "error"; turnId: string | null; message: string };

function encodeEvent(event: SseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

const Body = z.object({
  prompt: z.string().min(1).max(2000),
  // If provided, this turn (and all later turns) are replaced with the new prompt.
  editTurnId: z.string().optional(),
});

function buildMessages(
  zones: Zone[],
  priorTurns: Turn[],
  newPrompt: string,
  pins: Pin[]
): Anthropic.MessageParam[] {
  const msgs: Anthropic.MessageParam[] = [];

  for (let i = 0; i < priorTurns.length; i++) {
    const turn = priorTurns[i];
    if (i === 0) {
      msgs.push({
        role: "user",
        content: buildUserPrompt(zones, turn.prompt, pins),
      });
    } else {
      const prev = priorTurns[i - 1];
      msgs.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: prev.toolUseId!,
            content: "Layout received.",
          },
          { type: "text", text: buildFollowUpPrompt(turn.prompt, pins) },
        ],
      });
    }
    msgs.push({
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: turn.toolUseId!,
          name: LAYOUT_TOOL.name,
          input: turn.layout as unknown as Record<string, unknown>,
        },
      ],
    });
  }

  if (priorTurns.length === 0) {
    msgs.push({
      role: "user",
      content: buildUserPrompt(zones, newPrompt, pins),
    });
  } else {
    const last = priorTurns[priorTurns.length - 1];
    msgs.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: last.toolUseId!,
          content: "Layout received.",
        },
        { type: "text", text: buildFollowUpPrompt(newPrompt, pins) },
      ],
    });
  }

  return msgs;
}

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id: projectId } = await ctx.params;
  const project = projectsRepo.get(projectId);
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  const buildingZones = project.zones.filter((z) => z.type === "building");
  if (buildingZones.length === 0) {
    return Response.json(
      { error: "Project needs at least one zone of type 'building' before generating." },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { prompt, editTurnId } = parsed.data;

  // A turn is "fresh" (usable as conversation context) if every building zone in
  // the layout still matches a building zone in the current project (matched by
  // zone_id). If any building zone has been re-drawn, we exclude that turn
  // (otherwise Claude would see contradictory geometry between turns).
  function isFreshTurn(t: Turn): boolean {
    if (t.status !== "done" || !t.layout || !t.toolUseId) return false;
    for (const lb of t.layout.buildings) {
      const zone = buildingZones.find((z) => z.id === lb.zone_id);
      if (!zone) return false;
      if (!pointsApproxEqual(lb.footprint, zone.polygon)) return false;
    }
    return true;
  }

  let priorTurns: Turn[];
  let newIdx: number;
  if (editTurnId) {
    const existing = turnsRepo.get(editTurnId);
    if (!existing || existing.projectId !== projectId) {
      return Response.json({ error: "Turn not found in project" }, { status: 404 });
    }
    // Truncate everything from existing.idx onward, then append at that idx.
    turnsRepo.deleteFromIdx(projectId, existing.idx);
    newIdx = existing.idx;
    priorTurns = turnsRepo
      .listByProject(projectId)
      .filter((t) => t.idx < newIdx && isFreshTurn(t));
  } else {
    priorTurns = turnsRepo.listByProject(projectId).filter(isFreshTurn);
    newIdx = turnsRepo.nextIdx(projectId);
  }

  // Insert "streaming" turn now so it shows up if user reloads / lists turns
  const newTurn = turnsRepo.create({
    projectId,
    idx: newIdx,
    prompt,
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: SseEvent) => controller.enqueue(encodeEvent(event));
      try {
        send({ type: "start", turnId: newTurn.id });

        const client = getClient();
        const messages = buildMessages(
          project.zones,
          priorTurns,
          prompt,
          project.pins ?? []
        );

        const messageStream = client.messages.stream({
          model: CLAUDE_MODEL,
          max_tokens: 8000,
          system: [
            {
              type: "text",
              text: SYSTEM_PROMPT,
              cache_control: { type: "ephemeral" },
            },
          ],
          tools: [LAYOUT_TOOL],
          tool_choice: { type: "tool", name: LAYOUT_TOOL.name },
          messages,
        });

        let partialJson = "";
        let lastSent = 0;

        for await (const event of messageStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "input_json_delta"
          ) {
            partialJson += event.delta.partial_json;
            if (partialJson.length - lastSent >= 200) {
              lastSent = partialJson.length;
              send({ type: "progress", partialChars: partialJson.length });
            }
          }
        }

        const finalMessage = await messageStream.finalMessage();
        const toolUse = finalMessage.content.find(
          (c) => c.type === "tool_use" && c.name === LAYOUT_TOOL.name
        );
        if (!toolUse || toolUse.type !== "tool_use") {
          throw new Error("Model did not return a tool_use response.");
        }
        const validated = LayoutSchema.safeParse(toolUse.input);
        if (!validated.success) {
          throw new Error(
            `Layout validation failed: ${validated.error.issues
              .slice(0, 3)
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; ")}`
          );
        }
        turnsRepo.finishDone(newTurn.id, validated.data, toolUse.id);
        send({
          type: "done",
          turnId: newTurn.id,
          layout: validated.data,
          toolUseId: toolUse.id,
          notes: validated.data.notes,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error generating layout";
        turnsRepo.finishError(newTurn.id, message);
        send({ type: "error", turnId: newTurn.id, message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
