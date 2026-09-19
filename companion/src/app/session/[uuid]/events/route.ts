import { subscribe, replayAfter } from "@/lib/session/bus";
import { buildSnapshot } from "@/lib/session/snapshot";
import { get } from "@/lib/session/store";

export const runtime = "nodejs";

function encodeEvent(id: number, evt: { type: string; data: unknown }): Uint8Array {
  const payload = `id: ${id}\nevent: ${evt.type}\ndata: ${JSON.stringify(evt.data)}\n\n`;
  return new TextEncoder().encode(payload);
}

function encodeComment(text: string): Uint8Array {
  return new TextEncoder().encode(`: ${text}\n\n`);
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ uuid: string }> }
): Promise<Response> {
  const { uuid } = await ctx.params;
  const state = get(uuid);
  if (!state) {
    return new Response("Session not found", { status: 404 });
  }

  const lastHeader = req.headers.get("Last-Event-ID");
  const lastId = lastHeader ? Number(lastHeader) || 0 : 0;

  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (chunk: Uint8Array): void => {
        try {
          controller.enqueue(chunk);
        } catch {
          /* closed */
        }
      };

      write(encodeEvent(0, { type: "snapshot", data: buildSnapshot(state) }));

      const replay = replayAfter(uuid, lastId);
      for (const w of replay) {
        write(encodeEvent(w.id, w.evt));
      }

      unsubscribe = subscribe(uuid, (w) => write(encodeEvent(w.id, w.evt)));

      heartbeat = setInterval(() => write(encodeComment("ping")), 15_000);

      const cleanup = (): void => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
