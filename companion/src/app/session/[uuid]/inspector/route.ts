import { isInspectorEnabled, type InspectorPayload } from "@/lib/inspector";
import { get } from "@/lib/session/store";
import type { ContextEntry } from "@/lib/session/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Drop base64 image payloads when the caller asks for a metadata-only view. */
function withoutImages(entry: ContextEntry): ContextEntry {
  const copy: Record<string, unknown> = { ...entry };
  if ("image" in copy) delete copy.image;
  for (const key of ["material", "input"] as const) {
    const nested = copy[key];
    if (nested && typeof nested === "object") {
      const next: Record<string, unknown> = { ...(nested as Record<string, unknown>) };
      delete next.image;
      copy[key] = next;
    }
  }
  return copy as unknown as ContextEntry;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ uuid: string }> }
): Promise<Response> {
  if (!isInspectorEnabled()) {
    return new Response("Not found", { status: 404 });
  }
  const { uuid } = await ctx.params;
  const state = get(uuid);
  if (!state) {
    return new Response("Session not found", { status: 404 });
  }

  const withImages = new URL(req.url).searchParams.get("images") !== "0";
  const payload: InspectorPayload = {
    uuid: state.uuid,
    mode: state.mode,
    createdAt: state.createdAt,
    worksheet: state.worksheet.map((q) => ({ ...q })),
    drafts: { ...state.drafts },
    threads: Object.fromEntries(
      Object.entries(state.threads).map(([k, turns]) => [k, turns.map((t) => ({ ...t }))])
    ),
    ghostSummary: state.ghostSummary.map((g) => ({ ...g })),
    captures: state.captures.map((c) => ({
      ...c,
      image: withImages ? c.image : undefined,
    })),
    context: withImages ? state.context : state.context.map(withoutImages),
  };

  return Response.json(payload, {
    headers: { "cache-control": "no-store" },
  });
}
