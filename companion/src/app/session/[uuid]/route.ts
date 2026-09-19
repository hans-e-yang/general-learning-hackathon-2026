import { buildSnapshot } from "@/lib/session/snapshot";
import { get } from "@/lib/session/store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ uuid: string }> }
): Promise<Response> {
  const { uuid } = await ctx.params;
  const state = get(uuid);
  if (!state) {
    return new Response("Session not found", { status: 404 });
  }
  return Response.json(buildSnapshot(state), {
    headers: {
      "cache-control": "no-store",
    },
  });
}
