// TEMP: remove after E2E — exposes server-only SessionState for inspection.
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
  const g = globalThis as unknown as { __circlrRaw?: unknown[] };
  return Response.json({
    uuid: state.uuid,
    captures: state.captures,
    worksheet: state.worksheet,
    drafts: state.drafts,
    threads: state.threads,
    board: state.board,
    context: state.context,
    raw: g.__circlrRaw ?? [],
  });
}
