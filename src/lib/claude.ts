import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { CritiqueSchema, LayoutSchema } from "./schema";

let _client: Anthropic | null = null;
export function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.local.example to .env.local and add your key."
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

// zod 4 ships with first-class JSON Schema conversion.
const layoutJsonSchema = z.toJSONSchema(LayoutSchema, {
  target: "draft-2020-12",
  reused: "inline",
}) as Record<string, unknown>;

export const LAYOUT_TOOL = {
  name: "submit_layout",
  description:
    "Submit the complete architectural layout: walls, rooms, doors, windows, and furniture for the given building footprint.",
  input_schema: {
    ...layoutJsonSchema,
    type: "object",
  } as Anthropic.Tool["input_schema"],
};

const critiqueJsonSchema = z.toJSONSchema(CritiqueSchema, {
  target: "draft-2020-12",
  reused: "inline",
}) as Record<string, unknown>;

export const CRITIQUE_TOOL = {
  name: "submit_critique",
  description:
    "Submit a structured architectural critique of the given layout: overall verdict, score 0-10, and a list of specific issues with suggested fixes.",
  input_schema: {
    ...critiqueJsonSchema,
    type: "object",
  } as Anthropic.Tool["input_schema"],
};

export const CLAUDE_MODEL = "claude-sonnet-4-6";
