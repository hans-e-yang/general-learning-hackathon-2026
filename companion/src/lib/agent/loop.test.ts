import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearForTests as clearBus, type BusEvent } from "@/lib/session/bus";
import { clearForTests as clearStore, _seed, get } from "@/lib/session/store";
import type { SessionState } from "@/lib/session/types";
import { fakeAdapter } from "./fake-adapter";
import type { LLMAdapter } from "./llm-adapter";
import {
  assessAllDrafts,
  assessDraft,
  checkBoard,
  configureAgentLoop,
  extractFromCapture,
  processTurn,
  triageOnCapture,
  watchOnCapture,
} from "./loop";

function capture(): { events: BusEvent[]; publisher: typeof import("@/lib/session/bus").publish } {
  const events: BusEvent[] = [];
  const publisher = ((uuid: string, evt: import("@/lib/contracts").SseEvent) => {
    const out = { id: events.length + 1, evt };
    events.push(out);
    return out;
  }) as typeof import("@/lib/session/bus").publish;
  return { events, publisher };
}

function seedSession(uuid: string, partial: Partial<SessionState> = {}): SessionState {
  const base: SessionState = {
    uuid,
    createdAt: Date.now(),
    captures: [],
    recentHashes: [],
    worksheet: [],
    drafts: {},
    threads: {},
    context: [],
    board: [],
    ghostCounts: {},
    ghostSummary: [],
    exportReady: false,
    ...partial,
  };
  _seed(base);
  return base;
}

function stubAdapter(overrides: Partial<LLMAdapter> = {}): LLMAdapter {
  return {
    name: "stub",
    extract: async () => [],
    scout: async () => ({ status: "on-track", reasoning: "stub", escalate: true }),
    triage: async () => ({ update: true, reason: "stub" }),
    tutor: async (input) => ({
      questionId: input.questionId,
      hint: "stub hint",
      level: 0,
      escalation: "same",
    }),
    watch: async () => ({ flag: false, reasoning: "stub" }),
    idk: async (input) => ({
      questionId: input.questionId,
      hint: "stub hint",
      level: 0,
      escalation: "same",
    }),
    annotate: async () => [],
    ...overrides,
  };
}

beforeEach(() => {
  clearStore();
  clearBus();
});

describe("agent/loop saveDraft + setMode", () => {
  it("setMode updates mode on the session state", async () => {
    const { publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1");
    await processTurn("u1", { kind: "setMode", mode: "review" });
    const state = get("u1");
    expect(state?.mode).toBe("review");
  });

  it("saveDraft stores the draft under the questionId", async () => {
    const { publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", { worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }] });
    await processTurn("u1", { kind: "saveDraft", questionId: "q1", draft: "drafting..." });
    const state = get("u1");
    expect(state?.drafts.q1).toBe("drafting...");
  });

  it("saveDraft triggers a Scout tick when the draft is non-empty (#15)", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
      captures: [
        { captureId: "c1", pageIndex: 0, hash: "abcabcabcabcabca", timestamp: 1, deduped: false },
      ],
    });
    await processTurn("u1", {
      kind: "saveDraft",
      questionId: "q1",
      draft: "by definition, sin x ~ x for small x, therefore the limit is 1.",
    });
    const tick = events.find((e) => e.evt.type === "assessment.tick");
    expect(tick).toBeDefined();
    const data = tick?.evt.type === "assessment.tick" ? tick.evt.data : null;
    expect(data?.questionId).toBe("q1");
  });

  it("saveDraft skips the Scout tick when the draft is empty", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", { worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }] });
    await processTurn("u1", { kind: "saveDraft", questionId: "q1", draft: "" });
    expect(events.find((e) => e.evt.type === "assessment.tick")).toBeUndefined();
  });
});

describe("agent/loop requestCheck", () => {
  it("publishes a tutor.turn and an assessment.tick, growing the thread", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
      captures: [
        { captureId: "c1", pageIndex: 0, hash: "abcabcabcabcabca", timestamp: 1, deduped: false },
      ],
      drafts: { q1: "I am trying to expand using the small-angle approximation, therefore..." },
    });

    await processTurn("u1", { kind: "requestCheck", questionId: "q1" });

    const types = events.map((e) => e.evt.type);
    expect(types).toContain("tutor.turn");
    expect(types).toContain("assessment.tick");

    const tutor = events.find((e) => e.evt.type === "tutor.turn")!;
    const tutorData = tutor.evt.type === "tutor.turn" ? tutor.evt.data : null;
    expect(tutorData).not.toBeNull();
    expect(tutorData!.questionId).toBe("q1");
    expect(tutorData!.level).toBeGreaterThanOrEqual(0);
    expect(tutorData!.level).toBeLessThanOrEqual(3);

    const state = get("u1");
    expect(state?.threads.q1.length).toBe(1);
    expect(state?.threads.q1[0].hint).toBe(tutorData!.hint);
  });
});

describe("agent/loop ask", () => {
  it("echoes the student message into the tutor hint", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
      captures: [
        { captureId: "c1", pageIndex: 0, hash: "abcabcabcabcabca", timestamp: 1, deduped: false },
      ],
    });

    await processTurn("u1", {
      kind: "ask",
      questionId: "q1",
      message: "what does small-angle mean?",
    });

    const tutor = events.find((e) => e.evt.type === "tutor.turn")!;
    const data = tutor.evt.type === "tutor.turn" ? tutor.evt.data : null;
    expect(data?.hint).toContain("what does small-angle mean?");
  });
});

describe("agent/loop context memory", () => {
  it("records the full prompt, user input, and AI output for an ask turn", async () => {
    const { publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
      captures: [
        {
          captureId: "c1",
          pageIndex: 0,
          hash: "abcabcabcabcabca",
          timestamp: 1,
          deduped: false,
          image: "data:image/jpeg;base64,AAAA",
        },
      ],
    });

    const turn = { kind: "ask" as const, questionId: "q1", message: "why?" };
    await processTurn("u1", turn);

    const state = get("u1")!;
    // ask records the tutor turn, then the annotation pass it triggers.
    expect(state.context.map((c) => c.kind)).toEqual(["tutor", "annotation"]);
    const [entry] = state.context;
    expect(entry.kind).toBe("tutor");
    if (entry.kind !== "tutor") throw new Error("expected tutor entry");
    expect(entry.input).toEqual({ kind: "turn", turn });
    expect(entry.questionId).toBe("q1");
    expect(entry.prompt.map((m) => m.role)).toEqual(["system", "user"]);
    expect(entry.prompt[1].content).toContain("why?");
    expect(entry.material.questionText).toBe("x");
    expect(entry.material.captureId).toBe("c1");
    expect(entry.material.captureHash).toBe("abcabcabcabcabca");
    expect(entry.material.image).toBe("data:image/jpeg;base64,AAAA");
    expect(entry.output).toEqual(state.threads.q1[0]);

    const annotation = state.context[1];
    if (annotation.kind !== "annotation") throw new Error("expected annotation entry");
    expect(annotation.trigger).toBe("ask");
    expect(annotation.sourceId).toBe(entry.id);
  });

  it("records the whole conversation: extraction, answer, assessment, tutor", async () => {
    const { publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1");

    await extractFromCapture("u1", "feedfacec0ffee01", 0);
    const extracted = get("u1")!.worksheet;
    expect(extracted.length).toBeGreaterThan(0);
    const qid = extracted[0].id;

    await processTurn("u1", { kind: "saveDraft", questionId: qid, draft: "my attempt, therefore" });
    await processTurn("u1", { kind: "requestCheck", questionId: qid });

    const kinds = get("u1")!.context.map((c) => c.kind);
    // extraction (question) -> draft (student answer) -> tutor (hint)
    // -> annotation (tutor marks) -> draft (post-check tick)
    expect(kinds).toEqual(["extraction", "draft", "tutor", "annotation", "draft"]);

    const extraction = get("u1")!.context[0];
    if (extraction.kind !== "extraction") throw new Error("expected extraction");
    expect(extraction.questions.map((q) => q.id)).toContain(qid);
  });

  it("records a capture entry with its triage verdict", async () => {
    const { publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1");

    await triageOnCapture("u1", "cap-1", "feedfacec0ffee01", 0);

    const captures = get("u1")!.context.filter((c) => c.kind === "capture");
    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({ kind: "capture", captureId: "cap-1", pageIndex: 0 });
    expect(captures[0].triage?.reason.length).toBeGreaterThan(0);
  });

  it("does not record context for setMode (no conversational event)", async () => {
    const { publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
    });

    await processTurn("u1", { kind: "setMode", mode: "review" });

    expect(get("u1")?.context).toHaveLength(0);
  });

  it("records the student answer and its assessment on saveDraft", async () => {
    const { publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
    });

    await processTurn("u1", { kind: "saveDraft", questionId: "q1", draft: "hello" });

    const state = get("u1")!;
    const drafts = state.context.filter((c) => c.kind === "draft");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      kind: "draft",
      questionId: "q1",
      draft: "hello",
      questionText: "x",
    });
    expect(drafts[0].assessment?.reasoning.length).toBeGreaterThan(0);
  });

  it("records a context entry for an idk turn", async () => {
    const { publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
    });

    await processTurn("u1", { kind: "idk", questionId: "q1" });

    const state = get("u1")!;
    // idk records the turn, then the annotation pass it triggers.
    expect(state.context.map((c) => c.kind)).toEqual(["idk", "annotation"]);
    expect(state.context[0].output).toEqual(state.threads.q1[0]);
    const annotation = state.context[1];
    if (annotation.kind !== "annotation") throw new Error("expected annotation entry");
    expect(annotation.trigger).toBe("idk");
    expect(annotation.sourceId).toBe(state.context[0].id);
  });
});

describe("agent/loop annotation passes", () => {
  const IMG = "data:image/jpeg;base64,/9j/AAAA";

  it("records a board-snapshot then an annotation for an idle turn", async () => {
    const { publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
    });

    await processTurn("u1", { kind: "annotate", questionId: "q1", image: IMG });

    const state = get("u1")!;
    expect(state.context.map((c) => c.kind)).toEqual(["board-snapshot", "annotation"]);

    const snapshot = state.context[0];
    if (snapshot.kind !== "board-snapshot") throw new Error("expected board-snapshot");
    expect(snapshot.questionId).toBe("q1");
    expect(snapshot.image).toBe(IMG);

    const annotation = state.context[1];
    if (annotation.kind !== "annotation") throw new Error("expected annotation");
    expect(annotation.trigger).toBe("idle");
    expect(annotation.sourceId).toBe(snapshot.id);
    expect(annotation.input.image).toBe(IMG);
    expect(annotation.input.questionText).toBe("x");
    expect(annotation.prompt.length).toBeGreaterThan(0);
    expect(annotation.error).toBeUndefined();
    expect(annotation.output.length).toBeGreaterThan(0);
    // One clear frame plus one element frame per emitted mark.
    expect(annotation.published).toHaveLength(annotation.output.length + 1);
    expect(annotation.published[0].type).toBe("board.annotate");
  });

  it("records a failed annotation pass with its error and no marks", async () => {
    const { publisher } = capture();
    configureAgentLoop({
      adapter: stubAdapter({
        annotate: async () => {
          throw new Error("boom");
        },
      }),
      publishEvent: publisher,
    });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
    });

    await processTurn("u1", { kind: "annotate", questionId: "q1", image: IMG });

    const annotation = get("u1")!.context.find((c) => c.kind === "annotation");
    if (annotation?.kind !== "annotation") throw new Error("expected annotation");
    expect(annotation.error).toBe("boom");
    expect(annotation.output).toEqual([]);
    expect(annotation.published).toEqual([]);
  });

  it("stores nothing when the inspector is disabled", async () => {
    const { publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
    });

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CIRCLR_INSPECTOR", "");
    try {
      await processTurn("u1", { kind: "annotate", questionId: "q1", image: IMG });
      expect(get("u1")!.context).toHaveLength(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("agent/loop image turns", () => {
  const IMG = "data:image/jpeg;base64,/9j/AAAA";

  it("threads the turn image into scout and records it on the draft entry", async () => {
    const seen: Array<string | undefined> = [];
    const { publisher } = capture();
    configureAgentLoop({
      adapter: stubAdapter({
        scout: async (input) => {
          seen.push(input.image);
          return { status: "on-track", reasoning: "ok", escalate: true };
        },
      }),
      publishEvent: publisher,
    });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
    });

    await processTurn("u1", { kind: "saveDraft", questionId: "q1", draft: "attempt", image: IMG });

    expect(seen).toEqual([IMG]);
    const draft = get("u1")!.context.find((c) => c.kind === "draft");
    expect(draft?.image).toBe(IMG);
  });

  it("threads the turn image into tutor and records it on the tutor material", async () => {
    const seen: Array<string | undefined> = [];
    const { publisher } = capture();
    configureAgentLoop({
      adapter: stubAdapter({
        tutor: async (input) => {
          seen.push(input.image);
          return { questionId: input.questionId, hint: "hint", level: 0, escalation: "same" };
        },
      }),
      publishEvent: publisher,
    });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
    });

    await processTurn("u1", { kind: "requestCheck", questionId: "q1", image: IMG });

    expect(seen[0]).toBe(IMG);
    const tutor = get("u1")!.context.find((c) => c.kind === "tutor");
    if (tutor?.kind !== "tutor") throw new Error("expected tutor entry");
    expect(tutor.material.image).toBe(IMG);
  });

  it("threads the turn image into idk", async () => {
    let seen: string | undefined;
    const { publisher } = capture();
    configureAgentLoop({
      adapter: stubAdapter({
        idk: async (input) => {
          seen = input.image;
          return { questionId: input.questionId, hint: "hint", level: 0, escalation: "same" };
        },
      }),
      publishEvent: publisher,
    });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
    });

    await processTurn("u1", { kind: "idk", questionId: "q1", image: IMG });

    expect(seen).toBe(IMG);
  });

  it("does not attach an image when the turn omits it", async () => {
    const seen: Array<string | undefined> = [];
    const { publisher } = capture();
    configureAgentLoop({
      adapter: stubAdapter({
        scout: async (input) => {
          seen.push(input.image);
          return { status: "on-track", reasoning: "ok", escalate: true };
        },
      }),
      publishEvent: publisher,
    });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
    });

    await processTurn("u1", { kind: "saveDraft", questionId: "q1", draft: "attempt" });

    expect(seen).toEqual([undefined]);
  });
});

describe("agent/loop canvas", () => {
  it("applies a student board-pen turn and publishes board.element", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1");

    await processTurn("u1", {
      kind: "board-pen",
      element: {
        id: "pen-1",
        author: "student",
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 5 },
        ],
      },
    });

    const state = get("u1")!;
    expect(state.board).toHaveLength(1);
    expect(state.board[0]).toMatchObject({ id: "pen-1", tool: "pen", author: "student" });
    const evt = events.find((e) => e.evt.type === "board.element");
    expect(evt).toBeDefined();
  });

  it("removes an element on board-remove and mirrors board.remove", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      board: [
        {
          id: "pen-1",
          tool: "pen",
          author: "student",
          points: [{ x: 0, y: 0 }],
          color: "#1a1a1a",
          strokeWidth: 2,
        },
      ],
    });

    await processTurn("u1", { kind: "board-remove", elementId: "pen-1" });

    expect(get("u1")!.board).toHaveLength(0);
    const evt = events.find((e) => e.evt.type === "board.remove");
    expect(evt?.evt.type === "board.remove" && evt.evt.data.elementId).toBe("pen-1");
  });

  it("appends a tutor annotation after a requestCheck", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x?", status: "blocked" }],
    });

    await processTurn("u1", { kind: "requestCheck", questionId: "q1" });

    const state = get("u1")!;
    expect(state.board.some((el) => el.author === "tutor")).toBe(true);
    const evt = events.find((e) => e.evt.type === "board.element");
    expect(evt).toBeDefined();
    expect(
      evt?.evt.type === "board.element" ? evt.evt.data.questionId : undefined,
    ).toBe("q1");
  });

  it("keeps the tutor turn when annotate throws", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({
      adapter: stubAdapter({
        annotate: async () => {
          throw new Error("annotation offline");
        },
      }),
      publishEvent: publisher,
    });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x?", status: "blocked" }],
    });

    await processTurn("u1", { kind: "requestCheck", questionId: "q1" });

    expect(events.some((e) => e.evt.type === "tutor.turn")).toBe(true);
    expect(get("u1")!.board).toHaveLength(0);
  });

  it("annotates from an idle canvas image, replacing prior tutor marks", async () => {
    const IMG = "data:image/jpeg;base64,/9j/AAAA";
    const { events, publisher } = capture();
    const seen: Array<string | undefined> = [];
    configureAgentLoop({
      adapter: stubAdapter({
        annotate: async (input) => {
          seen.push(input.image);
          return [
            {
              kind: "board-text",
              element: {
                id: "tutor-1",
                author: "tutor",
                x: 4,
                y: 8,
                source: "check the sign",
              },
            },
          ];
        },
      }),
      publishEvent: publisher,
    });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x?", status: "blocked" }],
      board: [
        {
          id: "stale-tutor",
          tool: "text",
          author: "tutor",
          x: 0,
          y: 0,
          source: "old mark",
          color: "#b85c38",
          width: 180,
          fontSize: 16,
        },
        {
          id: "student-1",
          tool: "pen",
          author: "student",
          points: [{ x: 0, y: 0 }],
          color: "#1a1a1a",
          strokeWidth: 2,
        },
      ],
    });

    await processTurn("u1", { kind: "annotate", questionId: "q1", image: IMG });

    expect(seen).toEqual([IMG]);
    const types = events.map((e) => e.evt.type);
    expect(types).toContain("board.annotate");
    expect(types.indexOf("board.annotate")).toBeLessThan(
      types.indexOf("board.element"),
    );
    const state = get("u1")!;
    expect(state.board.some((el) => el.id === "stale-tutor")).toBe(false);
    expect(state.board.some((el) => el.id === "student-1")).toBe(true);
    expect(state.board.some((el) => el.id === "tutor-1")).toBe(true);
    const evt = events.find((e) => e.evt.type === "board.element");
    expect(
      evt?.evt.type === "board.element" ? evt.evt.data.questionId : undefined,
    ).toBe("q1");
  });

  it("dismissAnnotation clears tutor marks and keeps student ink", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      board: [
        {
          id: "stale-tutor",
          tool: "text",
          author: "tutor",
          x: 0,
          y: 0,
          source: "old",
          color: "#b85c38",
          width: 180,
          fontSize: 16,
        },
        {
          id: "student-1",
          tool: "pen",
          author: "student",
          points: [{ x: 0, y: 0 }],
          color: "#1a1a1a",
          strokeWidth: 2,
        },
      ],
    });

    await processTurn("u1", { kind: "dismissAnnotation", questionId: "q1" });

    const state = get("u1")!;
    expect(state.board.some((el) => el.author === "tutor")).toBe(false);
    expect(state.board.some((el) => el.id === "student-1")).toBe(true);
    const evt = events.find((e) => e.evt.type === "board.annotate");
    expect(evt).toBeDefined();
    expect(
      evt?.evt.type === "board.annotate" ? evt.evt.data.questionId : undefined,
    ).toBe("q1");
  });
});

describe("agent/loop extract (#14)", () => {
  it("populates the worksheet from a fresh capture and emits extraction.update", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1");
    await extractFromCapture("u1", "feedfacec0ffee01", 0);
    const state = get("u1");
    expect(state?.worksheet.length).toBeGreaterThan(0);
    for (const q of state!.worksheet) {
      expect(q.status).toBe("blocked");
      expect(q.id).toMatch(/^q-/);
      expect(q.label?.length).toBeGreaterThan(0);
    }
    const upd = events.find((e) => e.evt.type === "extraction.update");
    expect(upd).toBeDefined();
    const data = upd?.evt.type === "extraction.update" ? upd.evt.data : null;
    expect(data?.partial).toBe(false);
    expect(Array.isArray(data?.questions)).toBe(true);
  });

  it("does not duplicate questions when extract returns the same ids again", async () => {
    const { publisher } = capture();
    const fixed = [
      { id: "q-1a", index: 0, text: "Part a", label: "1a" },
      { id: "q-1b", index: 1, text: "Part b", label: "1b" },
    ];
    const stub: LLMAdapter = {
      ...fakeAdapter,
      extract: async () => fixed,
    };
    configureAgentLoop({ adapter: stub, publishEvent: publisher });
    seedSession("u1");
    await extractFromCapture("u1", "feedfacec0ffee01", 0);
    const firstLen = get("u1")?.worksheet.length;
    expect(firstLen).toBe(2);
    await extractFromCapture("u1", "feedfacec0ffee01", 0);
    const secondLen = get("u1")?.worksheet.length;
    expect(secondLen).toBe(firstLen);
    expect(get("u1")?.worksheet.map((q) => q.id)).toEqual(["q-1a", "q-1b"]);
  });

  it("keeps the worksheet in printed problem order even if the model returns shuffled", async () => {
    const { publisher } = capture();
    const shuffled = [
      { id: "q-2", index: 0, text: "Problem two", label: "2" },
      { id: "q-1b", index: 1, text: "Part b", label: "1b" },
      { id: "q-10", index: 2, text: "Problem ten", label: "10" },
      { id: "q-1a", index: 3, text: "Part a", label: "1a" },
    ];
    const stub: LLMAdapter = { ...fakeAdapter, extract: async () => shuffled };
    configureAgentLoop({ adapter: stub, publishEvent: publisher });
    seedSession("u1");
    await extractFromCapture("u1", "feedfacec0ffee01", 0);
    const state = get("u1")!;
    expect(state.worksheet.map((q) => q.label)).toEqual(["1a", "1b", "2", "10"]);
    expect(state.worksheet.map((q) => q.index)).toEqual([0, 1, 2, 3]);
  });

  it("extends the worksheet when later extracts unlock new question ids", async () => {
    const { publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1");
    await extractFromCapture("u1", "feedfacec0ffee01", 0);
    const before = get("u1")?.worksheet.length ?? 0;
    expect(before).toBe(3);
    await extractFromCapture("u1", "feedfacec0ffee02", 0);
    const after = get("u1")?.worksheet.length ?? 0;
    expect(after).toBeGreaterThan(before);
    expect(get("u1")?.worksheet.map((q) => q.label)).toEqual(
      expect.arrayContaining(["1a", "1b", "1c", "1d", "2"]),
    );
  });
});

describe("agent/loop continuous Scout (#15)", () => {
  it("assessDraft emits a tick for non-empty drafts", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
      drafts: { q1: "yes because of small-angle approximation" },
      captures: [
        { captureId: "c1", pageIndex: 0, hash: "abcabcabcabcabca", timestamp: 1, deduped: false },
      ],
    });
    await assessDraft("u1", "q1");
    const tick = events.find((e) => e.evt.type === "assessment.tick");
    expect(tick).toBeDefined();
  });

  it("assessAllDrafts emits a tick for every non-empty draft", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [
        { id: "q1", index: 0, text: "x", status: "blocked" },
        { id: "q2", index: 1, text: "y", status: "blocked" },
        { id: "q3", index: 2, text: "z", status: "blocked" },
      ],
      drafts: { q1: "a", q2: "b because", q3: "" },
      captures: [
        { captureId: "c1", pageIndex: 0, hash: "abcabcabcabcabca", timestamp: 1, deduped: false },
      ],
    });
    await assessAllDrafts("u1", { captureHash: "abcabcabcabcabca", pageIndex: 0 });
    const ticks = events.filter((e) => e.evt.type === "assessment.tick");
    expect(ticks).toHaveLength(2);
    const ids = ticks
      .map((e) => (e.evt.type === "assessment.tick" ? e.evt.data.questionId : null))
      .sort();
    expect(ids).toEqual(["q1", "q2"]);
  });
});

describe("agent/loop Socratic thread (#16)", () => {
  it("escalates hint level across multiple requestCheck turns", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
      captures: [
        { captureId: "c1", pageIndex: 0, hash: "abcabcabcabcabca", timestamp: 1, deduped: false },
      ],
    });

    await processTurn("u1", { kind: "requestCheck", questionId: "q1" });
    await processTurn("u1", { kind: "requestCheck", questionId: "q1" });
    await processTurn("u1", { kind: "requestCheck", questionId: "q1" });

    const tutorEvents = events.filter((e) => e.evt.type === "tutor.turn");
    expect(tutorEvents).toHaveLength(3);
    const state = get("u1");
    expect(state?.threads.q1.length).toBe(3);
    const levels = state!.threads.q1.map((t) => t.level);
    expect(levels[0]).toBe(1);
    expect(levels[2]).toBe(3);
    for (const lv of levels) {
      expect(lv).toBeGreaterThanOrEqual(0);
      expect(lv).toBeLessThanOrEqual(3);
    }
  });

  it("level ramps down when the draft shows reasoning between turns", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
      captures: [
        { captureId: "c1", pageIndex: 0, hash: "abcabcabcabcabca", timestamp: 1, deduped: false },
      ],
    });

    await processTurn("u1", {
      kind: "saveDraft",
      questionId: "q1",
      draft: "By definition, the limit is 1, therefore the chain holds.",
    });
    await processTurn("u1", { kind: "requestCheck", questionId: "q1" });

    const firstTutor = events.find((e) => e.evt.type === "tutor.turn");
    expect(firstTutor).toBeDefined();
    const data = firstTutor!.evt.type === "tutor.turn" ? firstTutor!.evt.data : null;
    expect(data?.escalation).toBe("down");
    expect(data?.level).toBe(0);
  });

  it("threads are scoped to the questionId", async () => {
    const { publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [
        { id: "q1", index: 0, text: "x", status: "blocked" },
        { id: "q2", index: 1, text: "y", status: "blocked" },
      ],
    });
    await processTurn("u1", { kind: "requestCheck", questionId: "q1" });
    await processTurn("u1", { kind: "requestCheck", questionId: "q2" });
    await processTurn("u1", { kind: "requestCheck", questionId: "q1" });
    const state = get("u1");
    expect(state?.threads.q1.length).toBe(2);
    expect(state?.threads.q2.length).toBe(1);
  });
});

describe("agent/loop watcher (#22)", () => {
  it("watchOnCapture publishes a flag event when the verdict flags", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      captures: [
        { captureId: "c1", pageIndex: 0, hash: "feedfacec0ffee0e", timestamp: 1, deduped: false },
      ],
      worksheet: [{ id: "q-p0-0", index: 0, text: "Continuity?", status: "blocked" }],
    });
    const verdict = await watchOnCapture("u1", "feedfacec0ffee0e", 0);
    expect(verdict?.flag).toBe(true);
    const flag = events.find((e) => e.evt.type === "flag");
    expect(flag).toBeDefined();
    const data = flag!.evt.type === "flag" ? flag!.evt.data : null;
    expect(data?.questionId).toBe("q-p0-0");
    expect(data?.severity).toBe("low");
    expect(data?.ghostKey).toMatch(/^g-feedfa/);
  });

  it("watchOnCapture does NOT publish a flag when the verdict is no-flag", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      captures: [
        { captureId: "c1", pageIndex: 0, hash: "1234567890abcdef", timestamp: 1, deduped: false },
      ],
      worksheet: [{ id: "q-p0-0", index: 0, text: "Continuity?", status: "blocked" }],
    });
    const verdict = await watchOnCapture("u1", "1234567890abcdef", 0);
    expect(verdict?.flag).toBe(false);
    expect(events.find((e) => e.evt.type === "flag")).toBeUndefined();
  });

  it("watchOnCapture fires once per accepted checkpoint (not on dedup)", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      captures: [
        { captureId: "c1", pageIndex: 0, hash: "feedfacec0ffee0e", timestamp: 1, deduped: false },
        { captureId: "c1", pageIndex: 0, hash: "feedfacec0ffee0e", timestamp: 2, deduped: true },
      ],
      worksheet: [{ id: "q-p0-0", index: 0, text: "x", status: "blocked" }],
    });
    await watchOnCapture("u1", "feedfacec0ffee0e", 0);
    await watchOnCapture("u1", "feedfacec0ffee0e", 0);
    const flags = events.filter((e) => e.evt.type === "flag");
    expect(flags).toHaveLength(2);
  });
});

describe("agent/loop intervention ladder (#23)", () => {
  it("first two flags emit tutor.turn; the third flag is silent", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      captures: [
        { captureId: "c1", pageIndex: 0, hash: "feedfacec0ffee0e", timestamp: 1, deduped: false },
      ],
      worksheet: [{ id: "q-p0-0", index: 0, text: "Continuity?", status: "blocked" }],
    });

    const HASH = "feedfacec0ffee0e";
    await watchOnCapture("u1", HASH, 0);
    await watchOnCapture("u1", HASH, 0);
    await watchOnCapture("u1", HASH, 0);

    const tutorEvents = events.filter((e) => e.evt.type === "tutor.turn");
    expect(tutorEvents.length).toBe(2);
    const flagEvents = events.filter((e) => e.evt.type === "flag");
    expect(flagEvents.length).toBe(3);
  });

  it("interruptions trend to zero: distinct ghosts produce N interventions, N+1 to silence", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      captures: [
        { captureId: "c1", pageIndex: 0, hash: "0000000000000000", timestamp: 1, deduped: false },
      ],
      worksheet: [{ id: "q-p0-0", index: 0, text: "x", status: "blocked" }],
    });

    await watchOnCapture("u1", "0000000000000000", 0);
    await watchOnCapture("u1", "111122223333aaaa", 0);
    await watchOnCapture("u1", "0000000000000000", 0);
    await watchOnCapture("u1", "111122223333aaaa", 0);

    const flags = events.filter((e) => e.evt.type === "flag");
    const tutorEvents = events.filter((e) => e.evt.type === "tutor.turn");
    expect(flags.length).toBe(4);
    expect(tutorEvents.length).toBe(4);

    const state = get("u1");
    expect(state?.ghostCounts["g-000000"]).toBe(2);
    expect(state?.ghostCounts["g-111122"]).toBe(2);
    const g0 = state?.ghostSummary.find((g) => g.ghostKey === "g-000000");
    const g1 = state?.ghostSummary.find((g) => g.ghostKey === "g-111122");
    expect(g0?.silent).toBe(false);
    expect(g1?.silent).toBe(false);
  });

  it("silenced ghosts surface in ghostSummary for the wrap-up autopsy", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      captures: [
        { captureId: "c1", pageIndex: 0, hash: "feedfacec0ffee0e", timestamp: 1, deduped: false },
      ],
      worksheet: [{ id: "q-p0-0", index: 0, text: "x", status: "blocked" }],
    });

    const HASH = "feedfacec0ffee0e";
    await watchOnCapture("u1", HASH, 0);
    await watchOnCapture("u1", HASH, 0);
    await watchOnCapture("u1", HASH, 0);
    await watchOnCapture("u1", HASH, 0);

    const state = get("u1");
    expect(state?.ghostCounts["g-feedfa"]).toBe(4);
    const summary = state?.ghostSummary.find((g) => g.ghostKey === "g-feedfa");
    expect(summary).toBeDefined();
    expect(summary?.silent).toBe(true);
    expect(summary?.occurrences).toBe(4);
  });
});

describe("agent/loop IDK (#23)", () => {
  it("processTurn idk returns the smallest unblock (level 0) on the SSE", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [
        { id: "q-p0-0", index: 0, text: "Why does sin(x)/x approach 1?", status: "blocked" },
      ],
    });
    await processTurn("u1", { kind: "idk", questionId: "q-p0-0" });
    const tutor = events.find((e) => e.evt.type === "tutor.turn");
    expect(tutor).toBeDefined();
    const data = tutor!.evt.type === "tutor.turn" ? tutor!.evt.data : null;
    expect(data?.level).toBe(0);
    expect(data?.hint).toContain("Why does sin(x)/x approach 1?");
  });

  it("idk never returns a final answer (reuses the never-final-answer check)", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [
        { id: "q-p0-0", index: 0, text: "What is the answer to everything?", status: "blocked" },
      ],
    });
    await processTurn("u1", { kind: "idk", questionId: "q-p0-0" });
    const tutor = events.find((e) => e.evt.type === "tutor.turn")!;
    const data = tutor.evt.type === "tutor.turn" ? tutor.evt.data : null;
    const lower = data?.hint.toLowerCase() ?? "";
    expect(lower).not.toMatch(/the answer is/);
    expect(lower).not.toMatch(/final answer/);
  });
});

describe("agent/loop capture triage (#28)", () => {
  it("publishes capture.triaged and returns the verdict for a new frame", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1");
    const update = await triageOnCapture("u1", "cap-1", "feedfacec0ffee01", 0);
    expect(update).toBe(true);
    const evt = events.find((e) => e.evt.type === "capture.triaged");
    expect(evt).toBeDefined();
    const data = evt!.evt.type === "capture.triaged" ? evt!.evt.data : null;
    expect(data?.captureId).toBe("cap-1");
    expect(data?.update).toBe(true);
    expect(data?.novelty).toBe("new-questions");
  });

  it("returns false for a redundant frame", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({
      adapter: stubAdapter({
        triage: async () => ({
          update: false,
          reason: "already known",
          novelty: "none",
        }),
      }),
      publishEvent: publisher,
    });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
      captures: [
        { captureId: "c1", pageIndex: 0, hash: "feedfacec0ffee01", timestamp: 1, deduped: false },
      ],
    });
    const update = await triageOnCapture("u1", "cap-2", "feedfacec0ffee0a", 0);
    expect(update).toBe(false);
    const evt = events.find((e) => e.evt.type === "capture.triaged")!;
    const data = evt.evt.type === "capture.triaged" ? evt.evt.data : null;
    expect(data?.update).toBe(false);
    expect(data?.novelty).toBe("none");
  });

  it("fails open (accepts the update) when the triage adapter throws", async () => {
    const { events, publisher } = capture();
    const adapter = stubAdapter({
      triage: async () => {
        throw new Error("boom");
      },
    });
    configureAgentLoop({ adapter, publishEvent: publisher });
    seedSession("u1");
    const update = await triageOnCapture("u1", "cap-3", "feedfacec0ffee01", 0);
    expect(update).toBe(true);
    const evt = events.find((e) => e.evt.type === "capture.triaged")!;
    expect(evt.evt.type === "capture.triaged" && evt.evt.data.update).toBe(true);
  });
});

describe("agent/loop assess turn (#29)", () => {
  it("publishes a tick and escalates to a tutor.turn when Scout says so", async () => {
    const { events, publisher } = capture();
    let tutorCalls = 0;
    const adapter = stubAdapter({
      scout: async () => ({ status: "on-track", reasoning: "needs a nudge", escalate: true }),
      tutor: async (input) => {
        tutorCalls += 1;
        return { questionId: input.questionId, hint: "stub hint", level: 1, escalation: "up" };
      },
    });
    configureAgentLoop({ adapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
      drafts: { q1: "partial attempt" },
    });
    await processTurn("u1", { kind: "assess", questionId: "q1" });
    const types = events.map((e) => e.evt.type);
    expect(types).toContain("assessment.tick");
    expect(types).toContain("tutor.turn");
    expect(types.indexOf("assessment.tick")).toBeLessThan(types.indexOf("tutor.turn"));
    expect(tutorCalls).toBe(1);
    expect(get("u1")?.threads.q1.length).toBe(1);
  });

  it("does not escalate when Scout returns solid", async () => {
    const { events, publisher } = capture();
    let tutorCalls = 0;
    const adapter = stubAdapter({
      scout: async () => ({ status: "solid", reasoning: "sound", escalate: false }),
      tutor: async (input) => {
        tutorCalls += 1;
        return { questionId: input.questionId, hint: "stub", level: 0, escalation: "same" };
      },
    });
    configureAgentLoop({ adapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "solid" }],
      drafts: { q1: "by definition, therefore, hence" },
    });
    await processTurn("u1", { kind: "assess", questionId: "q1" });
    const types = events.map((e) => e.evt.type);
    expect(types).toContain("assessment.tick");
    expect(types).not.toContain("tutor.turn");
    expect(tutorCalls).toBe(0);
  });

  it("stays silent at the top of the hint ladder", async () => {
    const { events, publisher } = capture();
    let tutorCalls = 0;
    const adapter = stubAdapter({
      scout: async () => ({ status: "blocked", reasoning: "stuck", escalate: true }),
      tutor: async (input) => {
        tutorCalls += 1;
        return { questionId: input.questionId, hint: "stub", level: 3, escalation: "same" };
      },
    });
    configureAgentLoop({ adapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
      drafts: { q1: "stuck" },
      threads: { q1: [{ questionId: "q1", hint: "prior", level: 3, escalation: "up" }] },
    });
    await processTurn("u1", { kind: "assess", questionId: "q1" });
    const types = events.map((e) => e.evt.type);
    expect(types).toContain("assessment.tick");
    expect(types).not.toContain("tutor.turn");
    expect(tutorCalls).toBe(0);
  });

  it("saveDraft keeps ticking without escalating (#29)", async () => {
    const { events, publisher } = capture();
    const adapter = stubAdapter({
      scout: async () => ({ status: "on-track", reasoning: "needs a nudge", escalate: true }),
    });
    configureAgentLoop({ adapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
      captures: [
        { captureId: "c1", pageIndex: 0, hash: "abcabcabcabcabca", timestamp: 1, deduped: false },
      ],
    });
    await processTurn("u1", { kind: "saveDraft", questionId: "q1", draft: "partial attempt" });
    const types = events.map((e) => e.evt.type);
    expect(types).toContain("assessment.tick");
    expect(types).not.toContain("tutor.turn");
  });
});

describe("agent/loop lazy boot", () => {
  it("configures the loop with the configured adapter when processTurn is called", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
      captures: [
        { captureId: "c1", pageIndex: 0, hash: "abcabcabcabcabca", timestamp: 1, deduped: false },
      ],
    });
    await processTurn("u1", { kind: "requestCheck", questionId: "q1" });
    expect(events.some((e) => e.evt.type === "tutor.turn")).toBe(true);
  });
});

describe("agent/loop board check", () => {
  it("always publishes an assessment.tick from the watch verdict", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({
      adapter: stubAdapter({
        watch: async () => ({ flag: false, reasoning: "looks fine", status: "on-track" }),
      }),
      publishEvent: publisher,
    });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
    });

    await checkBoard("u1", { questionId: "q1", image: "AAAA" });

    const tick = events.find((e) => e.evt.type === "assessment.tick");
    expect(tick?.evt.type === "assessment.tick" && tick.evt.data.status).toBe("on-track");
    expect(events.some((e) => e.evt.type === "tutor.turn")).toBe(false);
  });

  it("falls back to blocked/on-track when the verdict omits status", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({
      adapter: stubAdapter({
        watch: async () => ({ flag: true, severity: "low", reasoning: "slip" }),
      }),
      publishEvent: publisher,
    });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
    });

    await checkBoard("u1", { questionId: "q1", image: "AAAA" });

    const tick = events.find((e) => e.evt.type === "assessment.tick");
    expect(tick?.evt.type === "assessment.tick" && tick.evt.data.status).toBe("blocked");
  });

  it("emits a hint and a grounded board.element with questionId on a flag", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({
      adapter: stubAdapter({
        watch: async () => ({
          flag: true,
          severity: "medium",
          ghostKey: "sign-error",
          reasoning: "sign flipped",
          status: "blocked",
        }),
        annotate: async () => [
          {
            kind: "board-shape",
            element: {
              id: "tut-1",
              author: "tutor",
              shape: "ellipse",
              x: 10,
              y: 20,
              width: 30,
              height: 40,
            },
          },
        ],
      }),
      publishEvent: publisher,
    });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
    });

    await checkBoard("u1", { questionId: "q1", image: "AAAA" });

    expect(events.some((e) => e.evt.type === "tutor.turn")).toBe(true);
    const boardEvt = events.find((e) => e.evt.type === "board.element");
    if (boardEvt?.evt.type !== "board.element") throw new Error("expected board.element");
    expect(boardEvt.evt.data.questionId).toBe("q1");
    expect(get("u1")!.board.some((el) => el.author === "tutor")).toBe(true);
  });

  it("records a board-sourced watch entry on the transcript", async () => {
    const { publisher } = capture();
    configureAgentLoop({
      adapter: stubAdapter({
        watch: async () => ({ flag: false, reasoning: "fine", status: "on-track" }),
      }),
      publishEvent: publisher,
    });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", status: "blocked" }],
    });

    await checkBoard("u1", { questionId: "q1", image: "AAAA" });

    const watch = get("u1")!.context.find((c) => c.kind === "watch");
    if (watch?.kind !== "watch") throw new Error("expected watch entry");
    expect(watch.source).toBe("board");
    expect(watch.questionId).toBe("q1");
  });
});
