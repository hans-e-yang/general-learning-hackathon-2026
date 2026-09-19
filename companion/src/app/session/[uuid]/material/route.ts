import { MaterialCaptureSchema } from "@/lib/contracts";
import { publish } from "@/lib/session/bus";
import { assessAllDrafts, extractFromCapture, triageOnCapture, watchOnCapture } from "@/lib/agent";
import { recordCapture } from "@/lib/session/store";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ uuid: string }> }
): Promise<Response> {
  const { uuid } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = MaterialCaptureSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid material capture", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { captureId, deduped } = recordCapture(
    uuid,
    parsed.data.hash,
    parsed.data.pageIndex,
    parsed.data.timestamp,
    parsed.data.image
  );
  if (!deduped) {
    publish(uuid, {
      type: "material.accepted",
      data: { captureId, deduped: false },
    });
    // Triage still publishes novelty for the UI/context, but boards must grow
    // even when the model mis-labels a scroll as redundant (e.g. missed 5a/5b).
    await triageOnCapture(
      uuid,
      captureId,
      parsed.data.hash,
      parsed.data.pageIndex,
      parsed.data.image
    );
    await extractFromCapture(uuid, parsed.data.hash, parsed.data.pageIndex, parsed.data.image);
    await assessAllDrafts(uuid, {
      captureHash: parsed.data.hash,
      pageIndex: parsed.data.pageIndex,
    });
    await watchOnCapture(uuid, parsed.data.hash, parsed.data.pageIndex, parsed.data.image);
  }
  return Response.json({ accepted: true, deduped, captureId }, { status: 202 });
}
