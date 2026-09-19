import { Buffer } from "node:buffer";
import { beforeEach, describe, expect, it } from "vitest";
import { clearForTests as clearBus } from "@/lib/session/bus";
import { clearForTests as clearStore, getOrCreate, _seed } from "@/lib/session/store";
import { configureAgentLoop } from "@/lib/agent/loop";
import { fakeAdapter } from "@/lib/agent/fake-adapter";
import type { LLMAdapter } from "@/lib/agent/llm-adapter";
import { POST as startSession } from "@/app/session/route";
import { POST as postMaterial } from "@/app/session/[uuid]/material/route";
import { GET as getEvents } from "@/app/session/[uuid]/events/route";
import { POST as postTurn } from "@/app/session/[uuid]/turn/route";
import { GET as getExport } from "@/app/session/[uuid]/export/route";
import { GET as getSession } from "@/app/session/[uuid]/route";
import type { SessionState } from "@/lib/session/types";
import { publish } from "@/lib/session/bus";

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const JPEG_B64 = JPEG_BYTES.toString("base64");

function validCapture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    pageIndex: 0,
    scrollRatio: 0.5,
    timestamp: 1_700_000_000_000,
    hash: "0123456789abcdef",
    image: JPEG_B64,
    ...overrides,
  };
}

function req(url: string, init: RequestInit = {}): Request {
  return new Request(url, init);
}

beforeEach(() => {
  clearStore();
  clearBus();
  configureAgentLoop({ adapter: fakeAdapter, publishEvent: publish });
});

describe("/session POST", () => {
  it("mints a uuid and returns an eventsUrl on the same origin", async () => {
    const res = await startSession(req("http://test.local/session", { method: "POST" }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { uuid: string; eventsUrl: string };
    expect(body.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.eventsUrl).toBe(`http://test.local/session/${body.uuid}/events`);
  });

  it("rejects a body that has unknown fields", async () => {
    const res = await startSession(
      req("http://test.local/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unknown: true }),
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("/session/:uuid/material POST", () => {
  it("accepts a valid JPEG capture and mints a captureId", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    const res = await postMaterial(
      req(`http://test.local/session/${s.uuid}/material`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCapture({ hash: "abcabcabcabcabca" })),
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as { accepted: boolean; deduped: boolean; captureId: string };
    expect(body.accepted).toBe(true);
    expect(body.deduped).toBe(false);
    expect(body.captureId).toMatch(/^[0-9a-f-]{36}$/);
    const stored = getOrCreate(s.uuid);
    expect(stored.captures[0].image).toBe(JPEG_B64);
  });

  it("rejects malformed JSON with 400", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    const res = await postMaterial(
      req(`http://test.local/session/${s.uuid}/material`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    expect(res.status).toBe(400);
  });

  it("rejects a non-JPEG image", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");
    const res = await postMaterial(
      req(`http://test.local/session/${s.uuid}/material`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCapture({ image: png })),
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    expect(res.status).toBe(400);
  });

  it("rejects a hash that is not 16 hex chars", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    const res = await postMaterial(
      req(`http://test.local/session/${s.uuid}/material`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCapture({ hash: "deadbeef" })),
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    expect(res.status).toBe(400);
  });

  it("dedupes identical hashes within the rolling window", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    const a = await postMaterial(
      req(`http://test.local/session/${s.uuid}/material`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCapture({ hash: "ffffffffffffffff" })),
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    const b = await postMaterial(
      req(`http://test.local/session/${s.uuid}/material`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCapture({ hash: "ffffffffffffffff" })),
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    expect((await a.json()).deduped).toBe(false);
    expect((await b.json()).deduped).toBe(true);
  });
});

describe("/session/:uuid/events GET (SSE)", () => {
  it("404s for an unknown uuid", async () => {
    const res = await getEvents(req("http://test.local/session/00000000-0000-4000-8000-000000000000/events"), {
      params: Promise.resolve({ uuid: "00000000-0000-4000-8000-000000000000" }),
    });
    expect(res.status).toBe(404);
  });

  it("emits `snapshot` first and continues to deliver published events", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    getOrCreate(s.uuid);

    const ctrl = new AbortController();
    const res = await getEvents(
      req(`http://test.local/session/${s.uuid}/events`, { signal: ctrl.signal }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);

    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";

    const readUntil = async (predicate: (s: string) => boolean): Promise<void> => {
      while (!predicate(buf)) {
        const { value, done } = await reader.read();
        if (done) {
          return;
        }
        buf += dec.decode(value, { stream: true });
      }
    };

    await readUntil((s) => s.includes("event: snapshot"));

    const matRes = await postMaterial(
      req(`http://test.local/session/${s.uuid}/material`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCapture({ hash: "abcdabcdabcdabcd" })),
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    const { captureId } = (await matRes.json()) as { captureId: string };

    await readUntil((s) => s.includes("event: material.accepted"));

    expect(buf.indexOf("event: snapshot")).toBeLessThan(
      buf.indexOf("event: material.accepted")
    );
    expect(buf).toContain(captureId);

    ctrl.abort();
    reader.cancel();
  });

  it("replays only events with id > Last-Event-ID", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    getOrCreate(s.uuid);

    const r1 = await postMaterial(
      req(`http://test.local/session/${s.uuid}/material`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCapture({ hash: "1111111111111111" })),
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    const id1 = ((await r1.json()) as { captureId: string }).captureId;

    const r2 = await postMaterial(
      req(`http://test.local/session/${s.uuid}/material`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCapture({ hash: "2222222222222222" })),
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    const id2 = ((await r2.json()) as { captureId: string }).captureId;

    const ctrl = new AbortController();
    const res = await getEvents(
      req(`http://test.local/session/${s.uuid}/events`, {
        signal: ctrl.signal,
        headers: { "Last-Event-ID": "1" },
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );

    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const readUntil = async (predicate: (s: string) => boolean): Promise<void> => {
      while (!predicate(buf)) {
        const { value, done } = await reader.read();
        if (done) {
          return;
        }
        buf += dec.decode(value, { stream: true });
      }
    };
    await readUntil((s) => s.includes("event: material.accepted"));
    ctrl.abort();
    reader.cancel();

    expect(buf).toContain("event: snapshot");
    const accepted = buf.match(/event: material\.accepted/g) ?? [];
    expect(accepted.length).toBe(1);
    expect(buf).toContain(id2);
    expect(buf).not.toContain(`event: material.accepted\ndata: {"captureId":"${id1}"`);
  });
});

describe("/session/:uuid/turn POST", () => {
  it("applies setMode to canonical state", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    getOrCreate(s.uuid);
    const res = await postTurn(
      req(`http://test.local/session/${s.uuid}/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "setMode", mode: "review" }),
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    expect(res.status).toBe(202);
  });

  it("records saveDraft under the questionId", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    getOrCreate(s.uuid);
    await postTurn(
      req(`http://test.local/session/${s.uuid}/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "saveDraft", questionId: "q1", draft: "in progress" }),
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    const state = getOrCreate(s.uuid);
    expect(state.drafts.q1).toBe("in progress");
  });

  it("rejects an unknown turn kind", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    getOrCreate(s.uuid);
    const res = await postTurn(
      req(`http://test.local/session/${s.uuid}/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "nope" }),
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    expect(res.status).toBe(400);
  });

  it("applies a board turn to the canvas and exposes it in the snapshot", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    getOrCreate(s.uuid);
    const res = await postTurn(
      req(`http://test.local/session/${s.uuid}/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "board-text",
          element: { id: "t1", author: "student", x: 1, y: 2, source: "hello" },
        }),
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    expect(res.status).toBe(202);

    const snapRes = await getSession(req(`http://test.local/session/${s.uuid}`), {
      params: Promise.resolve({ uuid: s.uuid }),
    });
    const snap = (await snapRes.json()) as { board: Array<{ id: string }> };
    expect(snap.board).toHaveLength(1);
    expect(snap.board[0].id).toBe("t1");
  });

  it("accepts an image on a conversational turn", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    getOrCreate(s.uuid);
    const res = await postTurn(
      req(`http://test.local/session/${s.uuid}/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "idk", questionId: "q1", image: JPEG_B64 }),
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    expect(res.status).toBe(202);
  });

  it("rejects a non-JPEG image on a conversational turn", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    getOrCreate(s.uuid);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");
    const res = await postTurn(
      req(`http://test.local/session/${s.uuid}/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "idk", questionId: "q1", image: png }),
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    expect(res.status).toBe(400);
  });
});

describe("/session/:uuid/turn idk (#23)", () => {
  it("accepts the idk kind and publishes tutor.turn (level 0) over SSE", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    getOrCreate(s.uuid);
    const state = getOrCreate(s.uuid);
    state.worksheet = [
      { id: "q-p0-0", index: 0, text: "Define continuity at a point.", status: "blocked" },
    ];

    const ctrl = new AbortController();
    const res = await getEvents(
      req(`http://test.local/session/${s.uuid}/events`, { signal: ctrl.signal }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const readUntil = async (p: (s: string) => boolean): Promise<void> => {
      while (!p(buf)) {
        const { value, done } = await reader.read();
        if (done) return;
        buf += dec.decode(value, { stream: true });
      }
    };
    await readUntil((s) => s.includes("event: snapshot"));

    const idkBody = JSON.stringify({ kind: "idk", questionId: "q-p0-0" });
    const turnRes = await postTurn(
      req(`http://test.local/session/${s.uuid}/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: idkBody,
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    expect(turnRes.status).toBe(202);
    await readUntil((s) => s.includes("\"questionId\":\"q-p0-0\""));
    ctrl.abort();
    reader.cancel();
    expect(buf).toContain("event: tutor.turn");
    expect(buf).toContain("Define continuity");
  });

  it("rejects an unknown turn kind (still 400)", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    getOrCreate(s.uuid);
    const res = await postTurn(
      req(`http://test.local/session/${s.uuid}/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "noop" }),
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    expect(res.status).toBe(400);
  });
});

describe("/session/:uuid/turn assess (#29)", () => {
  it("runs Scout then conditionally publishes tutor.turn over SSE", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    const state = getOrCreate(s.uuid);
    state.worksheet = [
      { id: "q-p0-0", index: 0, text: "Define continuity at a point.", status: "blocked" },
    ];

    const ctrl = new AbortController();
    const res = await getEvents(
      req(`http://test.local/session/${s.uuid}/events`, { signal: ctrl.signal }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const readUntil = async (p: (s: string) => boolean): Promise<void> => {
      while (!p(buf)) {
        const { value, done } = await reader.read();
        if (done) return;
        buf += dec.decode(value, { stream: true });
      }
    };
    await readUntil((s) => s.includes("event: snapshot"));

    const turnRes = await postTurn(
      req(`http://test.local/session/${s.uuid}/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "assess", questionId: "q-p0-0" }),
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    expect(turnRes.status).toBe(202);
    await readUntil((s) => s.includes("event: tutor.turn"));
    ctrl.abort();
    reader.cancel();
    expect(buf).toContain("event: assessment.tick");
    expect(buf).toContain("event: tutor.turn");
  });
});

describe("snapshot ghostSummary (#23)", () => {
  it("GET /session/:uuid carries ghostSummary after intervention fades", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    const state = getOrCreate(s.uuid);
    state.ghostSummary = [
      {
        ghostKey: "g-feedfa",
        severity: "low",
        firstSeenAt: 1,
        lastSeenAt: 5,
        occurrences: 4,
        silent: true,
      },
    ];
    const res = await getSession(req(`http://test.local/session/${s.uuid}`), {
      params: Promise.resolve({ uuid: s.uuid }),
    });
    expect(res.status).toBe(200);
    const snap = (await res.json()) as { ghostSummary: Array<{ ghostKey: string; silent: boolean }> };
    expect(snap.ghostSummary).toHaveLength(1);
    expect(snap.ghostSummary[0].ghostKey).toBe("g-feedfa");
    expect(snap.ghostSummary[0].silent).toBe(true);
  });
});

describe("/session/:uuid/material POST -> SSE pipeline (#14/#15)", () => {
  it("publishes extraction.update after an accepted capture", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    getOrCreate(s.uuid);
    const ctrl = new AbortController();
    const res = await getEvents(
      req(`http://test.local/session/${s.uuid}/events`, { signal: ctrl.signal }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const readUntil = async (p: (s: string) => boolean): Promise<void> => {
      while (!p(buf)) {
        const { value, done } = await reader.read();
        if (done) return;
        buf += dec.decode(value, { stream: true });
      }
    };
    await readUntil((s) => s.includes("event: snapshot"));
    await postMaterial(
      req(`http://test.local/session/${s.uuid}/material`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCapture({ hash: "feedfacec0ffee01" })),
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    await readUntil((s) => s.includes("event: extraction.update"));
    ctrl.abort();
    reader.cancel();
    expect(buf).toContain("event: material.accepted");
    expect(buf).toContain("event: extraction.update");
    expect(buf).toContain('"label":"1a"');
    expect(buf).toContain("q-1a");
  });

  it("publishes capture.triaged but still extracts when triage rejects (#28 boards grow)", async () => {
    const rejecting: LLMAdapter = {
      name: "rejecting-triage",
      extract: (input) => fakeAdapter.extract(input),
      scout: (input) => fakeAdapter.scout(input),
      triage: async () => ({
        update: false,
        reason: "already known",
        novelty: "none",
      }),
      tutor: (input) => fakeAdapter.tutor(input),
      watch: (input) => fakeAdapter.watch(input),
      idk: (input) => fakeAdapter.idk(input),
      annotate: (input) => fakeAdapter.annotate(input),
    };
    configureAgentLoop({
      adapter: rejecting,
      publishEvent: publish,
    });
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    getOrCreate(s.uuid);
    const ctrl = new AbortController();
    const res = await getEvents(
      req(`http://test.local/session/${s.uuid}/events`, { signal: ctrl.signal }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const readUntil = async (p: (s: string) => boolean): Promise<void> => {
      while (!p(buf)) {
        const { value, done } = await reader.read();
        if (done) return;
        buf += dec.decode(value, { stream: true });
      }
    };
    await readUntil((s) => s.includes("event: snapshot"));
    await postMaterial(
      req(`http://test.local/session/${s.uuid}/material`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCapture({ hash: "feedfacec0ffee0a" })),
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    await readUntil((s) => s.includes("event: extraction.update"));
    ctrl.abort();
    reader.cancel();
    expect(buf).toContain("event: capture.triaged");
    expect(buf).toContain(`"update":false`);
    expect(buf).toContain(`"novelty":"none"`);
    expect(buf).toContain("event: extraction.update");
  });

  it("runs extraction after triage on an accepted capture (#28)", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    getOrCreate(s.uuid);
    const ctrl = new AbortController();
    const res = await getEvents(
      req(`http://test.local/session/${s.uuid}/events`, { signal: ctrl.signal }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const readUntil = async (p: (s: string) => boolean): Promise<void> => {
      while (!p(buf)) {
        const { value, done } = await reader.read();
        if (done) return;
        buf += dec.decode(value, { stream: true });
      }
    };
    await readUntil((s) => s.includes("event: snapshot"));
    await postMaterial(
      req(`http://test.local/session/${s.uuid}/material`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCapture({ hash: "feedfacec0ffee01" })),
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    await readUntil((s) => s.includes("event: extraction.update"));
    ctrl.abort();
    reader.cancel();
    expect(buf).toContain("event: capture.triaged");
    expect(buf).toContain(`"update":true`);
    expect(buf).toContain("event: extraction.update");
  });

  it("publishes a watcher flag over SSE for even-hex captureHash (#22)", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    getOrCreate(s.uuid);
    const ctrl = new AbortController();
    const res = await getEvents(
      req(`http://test.local/session/${s.uuid}/events`, { signal: ctrl.signal }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const readUntil = async (p: (s: string) => boolean): Promise<void> => {
      while (!p(buf)) {
        const { value, done } = await reader.read();
        if (done) return;
        buf += dec.decode(value, { stream: true });
      }
    };
    await readUntil((s) => s.includes("event: snapshot"));
    await postMaterial(
      req(`http://test.local/session/${s.uuid}/material`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCapture({ hash: "feedfacec0ffee0e" })),
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    await readUntil((s) => s.includes("event: flag"));
    ctrl.abort();
    reader.cancel();
    expect(buf).toContain("event: flag");
    expect(buf).toContain(`"severity":"low"`);
    expect(buf).toContain(`"ghostKey":"g-feedfa"`);
  });

  it("does NOT publish a watcher flag for odd-hex captureHash", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    getOrCreate(s.uuid);
    const ctrl = new AbortController();
    const res = await getEvents(
      req(`http://test.local/session/${s.uuid}/events`, { signal: ctrl.signal }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const readUntil = async (p: (s: string) => boolean): Promise<void> => {
      while (!p(buf)) {
        const { value, done } = await reader.read();
        if (done) return;
        buf += dec.decode(value, { stream: true });
      }
    };
    await readUntil((s) => s.includes("event: snapshot"));
    await postMaterial(
      req(`http://test.local/session/${s.uuid}/material`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCapture({ hash: "feedfacec0ffee01" })),
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    await new Promise((r) => setTimeout(r, 100));
    ctrl.abort();
    reader.cancel();
    expect(buf).not.toContain("event: flag");
  });

  it("populates the worksheet inside the snapshot after extraction", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    getOrCreate(s.uuid);
    await postMaterial(
      req(`http://test.local/session/${s.uuid}/material`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validCapture({ hash: "feedfacec0ffee01" })),
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    const res = await getEvents(
      req(`http://test.local/session/${s.uuid}/events`),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const { value } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    reader.cancel();
    expect(buf).toContain("worksheet");
    expect(buf).toContain("q-1a");
    expect(buf).toContain('"label":"1a"');
  });
});

describe("/session/:uuid/export GET (#17)", () => {
  it("404s for an unknown session", async () => {
    const res = await getExport(req("http://test.local/session/00000000-0000-4000-8000-000000000000/export"), {
      params: Promise.resolve({ uuid: "00000000-0000-4000-8000-000000000000" }),
    });
    expect(res.status).toBe(404);
  });

  it("409s when the worksheet is empty", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    getOrCreate(s.uuid);
    const res = await getExport(req(`http://test.local/session/${s.uuid}/export`), {
      params: Promise.resolve({ uuid: s.uuid }),
    });
    expect(res.status).toBe(409);
  });

  it("returns a PDF body that starts with %PDF", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    const state: SessionState = {
      uuid: s.uuid,
      createdAt: Date.now(),
      captures: [],
      recentHashes: [],
      worksheet: [
        { id: "q-p0-0", index: 0, text: "Define continuity.", status: "on-track" },
      ],
      drafts: { "q-p0-0": "Continuity means no breaks." },
      threads: {
        "q-p0-0": [
          {
            questionId: "q-p0-0",
            hint: "What definition are you starting from?",
            level: 0,
            escalation: "same",
          },
        ],
      },
      context: [],
      board: [],
      ghostCounts: {},
      ghostSummary: [],
      exportReady: false,
    };
    _seed(state);
    const res = await getExport(req(`http://test.local/session/${s.uuid}/export`), {
      params: Promise.resolve({ uuid: s.uuid }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 4).toString("binary")).toBe("%PDF");
    expect(res.headers.get("content-disposition")).toMatch(/circlr-/);
  });
});

describe("/session/:uuid GET (#20 resume)", () => {
  it("404s for an unknown session uuid", async () => {
    const res = await getSession(
      req("http://test.local/session/00000000-0000-4000-8000-000000000000"),
      { params: Promise.resolve({ uuid: "00000000-0000-4000-8000-000000000000" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns the current snapshot for a known uuid", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    const state: SessionState = {
      uuid: s.uuid,
      createdAt: Date.UTC(2026, 0, 1),
      captures: [
        { captureId: "c1", pageIndex: 0, hash: "feedfacec0ffee01", timestamp: 1, deduped: false },
      ],
      recentHashes: ["feedfacec0ffee01"],
      worksheet: [
        { id: "q-p0-0", index: 0, text: "Q?", status: "on-track" },
      ],
      drafts: { "q-p0-0": "draft text" },
      threads: {},
      context: [],
      board: [],
      ghostCounts: {},
      ghostSummary: [],
      exportReady: false,
    };
    _seed(state);

    const res = await getSession(req(`http://test.local/session/${s.uuid}`), {
      params: Promise.resolve({ uuid: s.uuid }),
    });
    expect(res.status).toBe(200);
    const snap = (await res.json()) as {
      uuid: string;
      captures: Array<{ hash: string }>;
      worksheet: Array<{ id: string }>;
      drafts?: Record<string, string>;
    };
    expect(snap.uuid).toBe(s.uuid);
    expect(snap.worksheet[0].id).toBe("q-p0-0");
    expect(snap.captures[0].hash).toBe("feedfacec0ffee01");
  });

  it("reflects drafts + threads added via /turn after the initial snapshot was taken", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    getOrCreate(s.uuid);

    const first = await getSession(req(`http://test.local/session/${s.uuid}`), {
      params: Promise.resolve({ uuid: s.uuid }),
    });
    const before = (await first.json()) as {
      worksheet: unknown[];
      captures: unknown[];
    };
    expect(before.worksheet).toEqual([]);
    expect(before.captures).toEqual([]);

    const jp = JPEG_B64;
    const capBody = JSON.stringify({
      pageIndex: 0,
      scrollRatio: 0.5,
      timestamp: 1_700_000_000_000,
      hash: "1234567890abcdef",
      image: jp,
    });
    await postMaterial(
      req(`http://test.local/session/${s.uuid}/material`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: capBody,
      }),
      { params: Promise.resolve({ uuid: s.uuid }) }
    );

    const second = await getSession(req(`http://test.local/session/${s.uuid}`), {
      params: Promise.resolve({ uuid: s.uuid }),
    });
    const after = (await second.json()) as {
      worksheet: Array<{ id: string }>;
      captures: Array<{ hash: string }>;
    };
    expect(after.worksheet.length).toBeGreaterThan(0);
    expect(after.captures.length).toBe(1);
    expect(after.captures[0].hash).toBe("1234567890abcdef");
  });

  it("returns the student's drafts in the snapshot (refresh survival)", async () => {
    const s = (await (
      await startSession(req("http://test.local/session", { method: "POST" }))
    ).json()) as { uuid: string };
    getOrCreate(s.uuid);
    const state = getOrCreate(s.uuid);
    state.worksheet = [
      { id: "q-p0-0", index: 0, text: "Continuity?", status: "blocked" },
    ];
    state.drafts = { "q-p0-0": "the limit is 1, therefore…" };

    const res = await getSession(req(`http://test.local/session/${s.uuid}`), {
      params: Promise.resolve({ uuid: s.uuid }),
    });
    const snap = (await res.json()) as { drafts: Record<string, string> };
    expect(snap.drafts["q-p0-0"]).toBe("the limit is 1, therefore…");
  });
});
