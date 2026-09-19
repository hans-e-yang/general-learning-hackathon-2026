import { Buffer } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearForTests, freshSession, _seed } from "@/lib/session/store";
import type { ContextEntry, SessionState } from "@/lib/session/types";
import { GET as getInspector } from "@/app/session/[uuid]/inspector/route";

const JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString("base64");
const UUID = "sess-1";

function seedSession(): SessionState {
  const s = freshSession(UUID, 1000);
  s.captures.push({
    captureId: "cap-1",
    pageIndex: 0,
    hash: "0123456789abcdef",
    timestamp: 2000,
    deduped: false,
    image: JPEG_B64,
  });
  const entry: ContextEntry = {
    id: "ctx-1",
    at: 2001,
    kind: "capture",
    captureId: "cap-1",
    captureHash: "0123456789abcdef",
    pageIndex: 0,
    image: JPEG_B64,
    triage: { update: true, reason: "new questions", novelty: "new-questions" },
  };
  s.context.push(entry);
  _seed(s);
  return s;
}

function callInspector(query = ""): Promise<Response> {
  return getInspector(new Request(`http://test.local/session/${UUID}/inspector${query}`), {
    params: Promise.resolve({ uuid: UUID }),
  });
}

const originalNodeEnv = process.env.NODE_ENV;
const originalFlag = process.env.CIRCLR_INSPECTOR;

beforeEach(() => {
  clearForTests();
  process.env.NODE_ENV = "test";
  delete process.env.CIRCLR_INSPECTOR;
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalFlag === undefined) delete process.env.CIRCLR_INSPECTOR;
  else process.env.CIRCLR_INSPECTOR = originalFlag;
});

describe("GET /session/:uuid/inspector", () => {
  it("returns captures with images and the context transcript", async () => {
    seedSession();
    const res = await callInspector();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      captures: { captureId: string; image?: string }[];
      context: { triage?: { novelty?: string }; image?: string }[];
    };
    expect(body.captures[0].captureId).toBe("cap-1");
    expect(body.captures[0].image).toBe(JPEG_B64);
    expect(body.context[0].triage?.novelty).toBe("new-questions");
    expect(body.context[0].image).toBe(JPEG_B64);
  });

  it("strips base64 images when ?images=0", async () => {
    seedSession();
    const res = await callInspector("?images=0");
    const body = (await res.json()) as {
      captures: { image?: string }[];
      context: { image?: string }[];
    };
    expect(body.captures[0].image).toBeUndefined();
    expect(body.context[0].image).toBeUndefined();
  });

  it("includes board-snapshot and annotation entries and strips their images", async () => {
    const s = seedSession();
    const snapshot: ContextEntry = {
      id: "ctx-2",
      at: 2002,
      kind: "board-snapshot",
      questionId: "q1",
      image: JPEG_B64,
    };
    const annotation: ContextEntry = {
      id: "ctx-3",
      at: 2003,
      kind: "annotation",
      trigger: "idle",
      sourceId: "ctx-2",
      questionId: "q1",
      prompt: [{ role: "user", content: "mark it" }],
      input: { questionText: "x", image: JPEG_B64 },
      output: [],
      published: [{ type: "board.annotate" }],
    };
    s.context.push(snapshot, annotation);
    _seed(s);

    const full = (await (await callInspector()).json()) as {
      context: { kind: string; image?: string; input?: { image?: string } }[];
    };
    expect(full.context.find((c) => c.kind === "board-snapshot")?.image).toBe(JPEG_B64);
    expect(full.context.find((c) => c.kind === "annotation")?.input?.image).toBe(JPEG_B64);

    const meta = (await (await callInspector("?images=0")).json()) as {
      context: { kind: string; image?: string; input?: { image?: string } }[];
    };
    expect(meta.context.find((c) => c.kind === "board-snapshot")?.image).toBeUndefined();
    expect(meta.context.find((c) => c.kind === "annotation")?.input?.image).toBeUndefined();
  });

  it("404s for an unknown session", async () => {
    const res = await getInspector(
      new Request("http://test.local/session/missing/inspector"),
      { params: Promise.resolve({ uuid: "missing" }) }
    );
    expect(res.status).toBe(404);
  });

  it("is disabled in production unless CIRCLR_INSPECTOR=1", async () => {
    seedSession();
    process.env.NODE_ENV = "production";
    expect((await callInspector()).status).toBe(404);
    process.env.CIRCLR_INSPECTOR = "1";
    expect((await callInspector()).status).toBe(200);
  });
});
