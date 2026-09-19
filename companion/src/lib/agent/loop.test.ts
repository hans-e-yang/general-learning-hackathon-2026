import { beforeEach, describe, expect, it } from "vitest";
import { clearForTests as clearBus, type BusEvent } from "@/lib/session/bus";
import { clearForTests as clearStore, _seed, get } from "@/lib/session/store";
import type { SessionState } from "@/lib/session/types";
import { fakeAdapter } from "./fake-adapter";
import {
  assessAllDrafts,
  assessDraft,
  configureAgentLoop,
  extractFromCapture,
  processTurn,
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
    ghostCounts: {},
    ghostSummary: [],
    exportReady: false,
    ...partial,
  };
  _seed(base);
  return base;
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
    seedSession("u1", { worksheet: [{ id: "q1", index: 0, text: "x", label: "1", status: "blocked" }] });
    await processTurn("u1", { kind: "saveDraft", questionId: "q1", draft: "drafting..." });
    const state = get("u1");
    expect(state?.drafts.q1).toBe("drafting...");
  });

  it("saveDraft triggers a Scout tick when the draft is non-empty (#15)", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", label: "1", status: "blocked" }],
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
    seedSession("u1", { worksheet: [{ id: "q1", index: 0, text: "x", label: "1", status: "blocked" }] });
    await processTurn("u1", { kind: "saveDraft", questionId: "q1", draft: "" });
    expect(events.find((e) => e.evt.type === "assessment.tick")).toBeUndefined();
  });
});

describe("agent/loop requestCheck", () => {
  it("publishes a tutor.turn and an assessment.tick, growing the thread", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", label: "1", status: "blocked" }],
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
      worksheet: [{ id: "q1", index: 0, text: "x", label: "1", status: "blocked" }],
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
      expect(q.id).toMatch(/^q-p0-/);
    }
    const upd = events.find((e) => e.evt.type === "extraction.update");
    expect(upd).toBeDefined();
    const data = upd?.evt.type === "extraction.update" ? upd.evt.data : null;
    expect(data?.partial).toBe(false);
    expect(Array.isArray(data?.questions)).toBe(true);
  });

  it("does not duplicate questions on subsequent captures of the same page", async () => {
    const { publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1");
    await extractFromCapture("u1", "feedfacec0ffee01", 0);
    const firstLen = get("u1")?.worksheet.length;
    await extractFromCapture("u1", "feedfacec0ffee01", 0);
    const secondLen = get("u1")?.worksheet.length;
    expect(secondLen).toBe(firstLen);
  });

  it("extends the worksheet on captures of new pages", async () => {
    const { publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1");
    await extractFromCapture("u1", "feedfacec0ffee01", 0);
    const before = get("u1")?.worksheet.length ?? 0;
    await extractFromCapture("u1", "feedfacec0ffee01", 1);
    const after = get("u1")?.worksheet.length ?? 0;
    expect(after).toBeGreaterThan(before);
  });
});

describe("agent/loop continuous Scout (#15)", () => {
  it("assessDraft emits a tick for non-empty drafts", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", label: "1", status: "blocked" }],
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
        { id: "q1", index: 0, text: "x", label: "1", status: "blocked" },
        { id: "q2", index: 1, text: "y", label: "2", status: "blocked" },
        { id: "q3", index: 2, text: "z", label: "3", status: "blocked" },
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
      worksheet: [{ id: "q1", index: 0, text: "x", label: "1", status: "blocked" }],
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
      worksheet: [{ id: "q1", index: 0, text: "x", label: "1", status: "blocked" }],
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
        { id: "q1", index: 0, text: "x", label: "1", status: "blocked" },
        { id: "q2", index: 1, text: "y", label: "2", status: "blocked" },
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
      worksheet: [{ id: "q-p0-0", index: 0, text: "Continuity?", label: "1", status: "blocked" }],
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
      worksheet: [{ id: "q-p0-0", index: 0, text: "Continuity?", label: "1", status: "blocked" }],
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
      worksheet: [{ id: "q-p0-0", index: 0, text: "x", label: "1", status: "blocked" }],
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
      worksheet: [{ id: "q-p0-0", index: 0, text: "Continuity?", label: "1", status: "blocked" }],
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
      worksheet: [{ id: "q-p0-0", index: 0, text: "x", label: "1", status: "blocked" }],
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
      worksheet: [{ id: "q-p0-0", index: 0, text: "x", label: "1", status: "blocked" }],
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
        { id: "q-p0-0", index: 0, text: "Why does sin(x)/x approach 1?", label: "1", status: "blocked" },
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
        { id: "q-p0-0", index: 0, text: "What is the answer to everything?", label: "1", status: "blocked" },
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

describe("agent/loop lazy boot", () => {
  it("configures the loop with the configured adapter when processTurn is called", async () => {
    const { events, publisher } = capture();
    configureAgentLoop({ adapter: fakeAdapter, publishEvent: publisher });
    seedSession("u1", {
      worksheet: [{ id: "q1", index: 0, text: "x", label: "1", status: "blocked" }],
      captures: [
        { captureId: "c1", pageIndex: 0, hash: "abcabcabcabcabca", timestamp: 1, deduped: false },
      ],
    });
    await processTurn("u1", { kind: "requestCheck", questionId: "q1" });
    expect(events.some((e) => e.evt.type === "tutor.turn")).toBe(true);
  });
});
