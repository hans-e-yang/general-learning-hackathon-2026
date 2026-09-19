import { randomUUID } from "node:crypto";
import { SessionInitRequestSchema } from "@/lib/contracts";
import { freshSession, getOrCreate } from "@/lib/session/store";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  let body: unknown = {};
  if (req.headers.get("content-type")?.includes("application/json")) {
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid json" }, { status: 400 });
    }
  }
  const parsed = SessionInitRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid session init", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const uuid = randomUUID();
  getOrCreate(uuid, () => freshSession(uuid));
  const url = new URL(req.url);
  return Response.json(
    {
      uuid,
      eventsUrl: `${url.protocol}//${url.host}/session/${uuid}/events`,
    },
    { status: 201 }
  );
}
