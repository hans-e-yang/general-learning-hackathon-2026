import { buildExportBlocks } from "@/lib/export/blocks";
import { generateExport } from "@/lib/export/pdf";
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

  const blocks = buildExportBlocks(state);
  if (blocks.length === 0) {
    return new Response("Nothing to export yet (no questions captured)", { status: 409 });
  }

  const { buffer } = await generateExport({
    uuid,
    blocks,
    mode: state.mode ?? "assignment",
    generatedAt: Date.now(),
  });

  const filename = `circlr-${uuid}.pdf`;
  return new Response(buffer, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-length": String(buffer.byteLength),
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
