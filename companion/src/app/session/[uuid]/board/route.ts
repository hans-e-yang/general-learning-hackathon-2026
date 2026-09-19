import { BoardCheckRequestSchema } from "@/lib/contracts";
import { checkBoard } from "@/lib/agent";
import { get } from "@/lib/session/store";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ uuid: string }> }
): Promise<Response> {
  const { uuid } = await ctx.params;
  if (!get(uuid)) {
    return new Response("Session not found", { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = BoardCheckRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid board check", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  await checkBoard(uuid, parsed.data);

  return new Response(null, { status: 202 });
}
