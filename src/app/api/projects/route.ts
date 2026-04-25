import { NextRequest } from "next/server";
import { z } from "zod";
import { projectsRepo } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const projects = projectsRepo.list();
  return Response.json({ projects });
}

const CreateBody = z.object({
  title: z.string().min(1).max(120).optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const project = projectsRepo.create({ title: parsed.data.title });
  return Response.json({ project }, { status: 201 });
}
