"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { InspectorPayload } from "@/lib/inspector";
import type { ContextEntry } from "@/lib/session/types";

const SESSION_KEY = "circlr-session-uuid";
const SSE_EVENT_TYPES = [
  "snapshot",
  "material.accepted",
  "capture.triaged",
  "extraction.update",
  "assessment.tick",
  "tutor.turn",
  "flag",
  "error",
  "board.annotate",
  "board.element",
] as const;

function imageSrc(image?: string): string | undefined {
  if (!image) return undefined;
  return image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;
}

function resolveUuid(): string | null {
  if (typeof window === "undefined") return null;
  const fromQuery = new URLSearchParams(window.location.search).get("s");
  if (fromQuery) return fromQuery;
  try {
    return window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function subscribeUuid(onStoreChange: () => void) {
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

function entryImage(entry: ContextEntry): string | undefined {
  if (entry.kind === "capture" || entry.kind === "draft") return entry.image;
  if (entry.kind === "tutor" || entry.kind === "idk") return entry.material.image;
  if (entry.kind === "board-snapshot") return entry.image;
  if (entry.kind === "annotation") return entry.input.image;
  return undefined;
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2 text-[11px] leading-relaxed">
      <span className="w-20 shrink-0 text-zinc-500">{k}</span>
      <span className="min-w-0 break-words text-zinc-300">{v}</span>
    </div>
  );
}

function Thumb({ src, caption }: { src?: string; caption?: string }) {
  if (!src) return null;
  return (
    <figure className="m-0 mt-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="inspected capture"
        className="max-h-40 w-full rounded border border-zinc-800 bg-black object-contain"
      />
      {caption ? <figcaption className="mt-1 text-[10px] text-zinc-500">{caption}</figcaption> : null}
    </figure>
  );
}

/** Explain what a thumbnail is, since annotation images are captured before marks are cleared. */
function thumbCaption(entry: ContextEntry): string | undefined {
  if (entry.kind === "board-snapshot") return "canvas sent to the backend";
  if (entry.kind === "annotation") return "canvas as sent (may include prior Tutor marks)";
  return undefined;
}

function EntryBody({ entry }: { entry: ContextEntry }) {
  switch (entry.kind) {
    case "capture":
      return (
        <>
          <Line k="capture" v={entry.captureId.slice(0, 8)} />
          <Line k="page" v={String(entry.pageIndex)} />
          <Line k="hash" v={entry.captureHash} />
          {entry.triage ? (
            <Line
              k="triage"
              v={`${entry.triage.update ? "update" : "no-update"}${
                entry.triage.novelty ? ` (${entry.triage.novelty})` : ""
              } — ${entry.triage.reason}`}
            />
          ) : null}
        </>
      );
    case "extraction":
      return (
        <>
          <Line k="partial" v={String(entry.partial)} />
          <ul className="mt-1 space-y-1">
            {entry.questions.map((q) => (
              <li key={q.id} className="flex gap-2 text-[11px]">
                <span className="shrink-0 font-semibold text-teal-300">
                  {q.label ?? q.index}
                </span>
                <span className="min-w-0 break-words text-zinc-300">{q.text}</span>
              </li>
            ))}
          </ul>
        </>
      );
    case "draft":
      return (
        <>
          <Line k="question" v={entry.questionId.slice(0, 8)} />
          <Line k="draft" v={entry.draft || "(empty)"} />
          {entry.assessment ? (
            <Line k="assessment" v={`${entry.assessment.status} — ${entry.assessment.reasoning}`} />
          ) : null}
        </>
      );
    case "tutor":
    case "idk":
      return (
        <>
          <Line
            k="input"
            v={
              entry.input.kind === "turn"
                ? entry.input.turn.kind
                : `watch ${entry.input.captureHash.slice(0, 8)}`
            }
          />
          <Line
            k="hint"
            v={`[L${entry.output.level} ${entry.output.escalation}] ${entry.output.hint}`}
          />
          <Line
            k="material"
            v={
              entry.material.questionText ??
              entry.material.captureHash ??
              "(none)"
            }
          />
          {entry.prompt.length > 0 ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-[11px] text-zinc-500">
                prompt ({entry.prompt.length})
              </summary>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-zinc-950 p-2 text-[10px] text-zinc-400">
                {entry.prompt
                  .map((m) => `[${m.role}]\n${m.content}`)
                  .join("\n\n")}
              </pre>
            </details>
          ) : null}
        </>
      );
    case "watch":
      return (
        <>
          <Line k="flag" v={String(entry.verdict.flag)} />
          <Line k="reasoning" v={entry.verdict.reasoning} />
        </>
      );
    case "board-snapshot":
      return (
        <>
          <Line k="request" v="annotate" />
          <Line k="question" v={entry.questionId?.slice(0, 8) ?? "(none)"} />
        </>
      );
    case "annotation": {
      const counts: Record<string, number> = {};
      const notes: string[] = [];
      for (const mark of entry.output) {
        counts[mark.kind] = (counts[mark.kind] ?? 0) + 1;
        if (mark.kind === "board-text") notes.push(mark.element.source);
      }
      return (
        <>
          <Line k="trigger" v={entry.trigger} />
          {entry.sourceId ? <Line k="source" v={entry.sourceId.slice(0, 8)} /> : null}
          <Line
            k="input"
            v={
              entry.input.hint ??
              entry.input.message ??
              entry.input.draftText ??
              entry.input.questionText ??
              "(none)"
            }
          />
          {entry.input.captureHash ? (
            <Line k="capture" v={entry.input.captureHash.slice(0, 8)} />
          ) : null}
          <Line
            k="output"
            v={
              entry.output.length === 0
                ? "none \u2014 LLM returned an empty annotations array (nothing to flag)"
                : Object.entries(counts)
                    .map(([kind, n]) => `${kind.replace("board-", "")}\u00d7${n}`)
                    .join(", ")
            }
          />
          {notes.length > 0 ? <Line k="notes" v={notes.join(" | ")} /> : null}
          <Line
            k="published"
            v={
              entry.published.length > 0
                ? entry.published.map((p) => p.type).join(", ")
                : "(none)"
            }
          />
          {entry.error ? <Line k="error" v={entry.error} /> : null}
          {entry.prompt.length > 0 ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-[11px] text-zinc-500">
                prompt ({entry.prompt.length})
              </summary>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-zinc-950 p-2 text-[10px] text-zinc-400">
                {entry.prompt
                  .map((m) => `[${m.role}]\n${m.content}`)
                  .join("\n\n")}
              </pre>
            </details>
          ) : null}
        </>
      );
    }
    case "board":
      return <Line k="turn" v={entry.turn.kind} />;
  }
}

function kindColor(kind: ContextEntry["kind"]): string {
  switch (kind) {
    case "capture":
      return "text-sky-300 border-sky-800";
    case "extraction":
      return "text-teal-300 border-teal-800";
    case "draft":
      return "text-amber-300 border-amber-800";
    case "tutor":
    case "idk":
      return "text-fuchsia-300 border-fuchsia-800";
    case "watch":
      return "text-orange-300 border-orange-800";
    case "board":
      return "text-zinc-400 border-zinc-700";
    case "board-snapshot":
      return "text-indigo-300 border-indigo-800";
    case "annotation":
      return "text-emerald-300 border-emerald-800";
  }
}

export function InspectorClient() {
  const uuid = useSyncExternalStore(subscribeUuid, resolveUuid, () => null);
  const [payload, setPayload] = useState<InspectorPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const load = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/session/${id}/inspector`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? "Session not found (or the inspector is disabled)"
            : `HTTP ${res.status}`,
        );
      }
      setPayload((await res.json()) as InspectorPayload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inspector data");
    }
  }, []);

  useEffect(() => {
    if (!uuid) return;
    const es = new EventSource(`/session/${uuid}/events`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(uuid), 300);
    };
    // Deferred initial pull; the SSE `snapshot` frame also triggers a refresh.
    const initial = setTimeout(() => void load(uuid), 0);
    for (const type of SSE_EVENT_TYPES) es.addEventListener(type, schedule);
    return () => {
      for (const type of SSE_EVENT_TYPES) es.removeEventListener(type, schedule);
      if (timer) clearTimeout(timer);
      clearTimeout(initial);
      es.close();
    };
  }, [uuid, load]);

  const captures = useMemo(() => (payload ? [...payload.captures].reverse() : []), [payload]);
  const context = useMemo(() => (payload ? [...payload.context].reverse() : []), [payload]);

  return (
    <div className="flex h-dvh flex-col bg-zinc-950 font-mono text-zinc-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-2.5 text-xs">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            connected ? "bg-teal-400" : "bg-red-400"
          }`}
          aria-hidden="true"
        />
        <h1 className="m-0 text-sm">Circlr inspector</h1>
        {uuid ? (
          <a
            href={`/?s=${encodeURIComponent(uuid)}`}
            className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-300 no-underline hover:border-teal-500 hover:text-teal-300"
          >
            ← Board
          </a>
        ) : null}
        <span className="ml-auto text-zinc-500">
          {payload ? `${payload.captures.length} captures` : "no data"}
        </span>
        <span className="text-zinc-500">{uuid ? `session ${uuid.slice(0, 8)}` : "no session"}</span>
      </header>

      {error ? (
        <p className="border-b border-red-900 bg-red-950/40 px-4 py-2 text-xs text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      {!uuid ? (
        <main className="flex flex-1 items-center justify-center p-6 text-sm text-zinc-500">
          No session id. Open this page with <code className="mx-1">?s=&lt;uuid&gt;</code> or open a
          Session in the companion first.
        </main>
      ) : (
        <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
          <section className="flex min-h-0 flex-col border-r border-zinc-800">
            <h2 className="border-b border-zinc-800 px-4 py-2 text-[11px] uppercase tracking-widest text-zinc-500">
              Screenshot materials sent
            </h2>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {captures.length === 0 ? (
                <p className="p-6 text-center text-xs text-zinc-500">
                  Waiting for captures… click Circlr on a document page.
                </p>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                  {captures.map((c, i) => (
                    <div key={c.captureId} className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
                      <Thumb src={imageSrc(c.image)} />
                      <div className="space-y-0.5 p-2 text-[10px] text-zinc-400">
                        <div className="flex justify-between gap-2">
                          <span className="text-teal-300">#{captures.length - i}</span>
                          <span>page {c.pageIndex}</span>
                        </div>
                        <div>hash {c.hash}</div>
                        <div>t {new Date(c.timestamp).toLocaleTimeString()}</div>
                        {c.deduped ? <div className="text-amber-300">deduped</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col">
            <h2 className="border-b border-zinc-800 px-4 py-2 text-[11px] uppercase tracking-widest text-zinc-500">
              Question context derived from images
            </h2>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {payload && payload.worksheet.length > 0 ? (
                <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                  <div className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">
                    worksheet
                  </div>
                  <ul className="space-y-1">
                    {payload.worksheet.map((q) => (
                      <li key={q.id} className="flex gap-2 text-[11px]">
                        <span className="shrink-0 font-semibold text-teal-300">{q.label ?? q.index}</span>
                        <span className="min-w-0 break-words text-zinc-300">{q.text}</span>
                        <span className="ml-auto shrink-0 text-zinc-500">{q.status}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {context.length === 0 ? (
                <p className="p-6 text-center text-xs text-zinc-500">No context yet.</p>
              ) : (
                <ol className="space-y-2">
                  {context.map((entry) => (
                    <li key={entry.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] ${kindColor(entry.kind)}`}>
                          {entry.kind}
                        </span>
                        {entry.questionId ? (
                          <span className="text-[10px] text-zinc-500">
                            q {entry.questionId.slice(0, 8)}
                          </span>
                        ) : null}
                        <span className="ml-auto text-[10px] text-zinc-500">
                          {new Date(entry.at).toLocaleTimeString()}
                        </span>
                      </div>
                      <EntryBody entry={entry} />
                      <Thumb src={imageSrc(entryImage(entry))} caption={thumbCaption(entry)} />
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
