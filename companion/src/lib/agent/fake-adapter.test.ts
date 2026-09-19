import { describe, expect, it } from "vitest";
import { fakeAdapter } from "./fake-adapter";

describe("fake-adapter/extract", () => {
  it("returns 1..3 deterministic questions for the same (hash, page)", async () => {
    const a = await fakeAdapter.extract({ captureHash: "feedfacec0ffee01", pageIndex: 0 });
    const b = await fakeAdapter.extract({ captureHash: "feedfacec0ffee01", pageIndex: 0 });
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(1);
    expect(a.length).toBeLessThanOrEqual(3);
    for (const q of a) {
      expect(q.id.startsWith("q-p0-")).toBe(true);
      expect(q.text.length).toBeGreaterThan(0);
    }
  });

  it("yields distinct questions across pages", async () => {
    const p0 = await fakeAdapter.extract({ captureHash: "feedfacec0ffee01", pageIndex: 0 });
    const p1 = await fakeAdapter.extract({ captureHash: "feedfacec0ffee01", pageIndex: 1 });
    for (const q of p0) {
      for (const q2 of p1) {
        expect(q.id).not.toBe(q2.id);
      }
    }
  });

  it("yields the same stable IDs for distinct captures on the same page (dedupe-friendly)", async () => {
    const h1 = await fakeAdapter.extract({ captureHash: "aaaaaaaaaaaaaaaa", pageIndex: 0 });
    const h2 = await fakeAdapter.extract({ captureHash: "bbbbbbbbbbbbbbbb", pageIndex: 0 });
    expect(h1.map((q) => q.id)).toEqual(h2.map((q) => q.id));
    expect(h1[0].text).not.toBe(h2[0].text);
  });
});

describe("fake-adapter/scout", () => {
  it("returns blocked when no draft text is provided", async () => {
    const r = await fakeAdapter.scout({ captureHash: "h", pageIndex: 0 });
    expect(r.status).toBe("blocked");
    expect(r.reasoning.length).toBeGreaterThan(0);
  });

  it("returns blocked for a draft that looks like a final answer", async () => {
    const r = await fakeAdapter.scout({
      captureHash: "h",
      pageIndex: 0,
      draftText: "the answer is 4",
    });
    expect(r.status).toBe("blocked");
  });

  it("returns on-track or solid for a non-trivial reasoning-shaped draft", async () => {
    const r = await fakeAdapter.scout({
      captureHash: "h",
      pageIndex: 0,
      draftText:
        "We know the function is increasing on the interval, therefore the upper bound is at x = 2, hence the integral converges.",
    });
    expect(["on-track", "solid"]).toContain(r.status);
  });

  it("is deterministic for the same input", async () => {
    const input = {
      captureHash: "deadbeefdeadbeef",
      pageIndex: 0,
      draftText: "by definition, the derivative of x^2 is 2x, therefore the slope at 3 is 6.",
    };
    const a = await fakeAdapter.scout(input);
    const b = await fakeAdapter.scout(input);
    expect(a).toEqual(b);
  });
});

describe("fake-adapter/tutor", () => {
  it("never returns a hint that looks like a final answer", async () => {
    const calls = [];
    for (let lvl = 0; lvl <= 3; lvl += 1) {
      calls.push(
        await fakeAdapter.tutor({
          questionId: "q1",
          questionText: "What is f(3)?",
          currentLevel: lvl,
          threadHistory: [],
          message: undefined,
        })
      );
    }
    for (const t of calls) {
      expect(t.hint.length).toBeGreaterThan(0);
      const lower = t.hint.toLowerCase();
      expect(lower).not.toMatch(/the answer is/);
      expect(lower).not.toMatch(/final answer/);
    }
  });

  it("clamps level into 0..3", async () => {
    for (const level of [0, 1, 2, 3, 4, 100, -2]) {
      const t = await fakeAdapter.tutor({
        questionId: "q1",
        questionText: "x",
        currentLevel: level,
        threadHistory: [],
      });
      expect(t.level).toBeGreaterThanOrEqual(0);
      expect(t.level).toBeLessThanOrEqual(3);
    }
  });

  it("escalates across repeated requestCheck turns", async () => {
    const history: { questionId: string; hint: string; level: number; escalation: "up" | "same" | "down" }[] = [];
    let level = 0;
    for (let i = 0; i < 5; i += 1) {
      const t = await fakeAdapter.tutor({
        questionId: "q1",
        questionText: "x",
        currentLevel: level,
        threadHistory: history,
      });
      history.push(t);
      level = t.level;
    }
    const last = history[history.length - 1];
    expect(last.level).toBeLessThanOrEqual(3);
    expect(history[0].level).toBeLessThanOrEqual(history[history.length - 1].level);
  });

  it("an ask carries the student message back into the hint", async () => {
    const t = await fakeAdapter.tutor({
      questionId: "q1",
      questionText: "x",
      currentLevel: 0,
      threadHistory: [],
      message: "what does the symbol mean here?",
    });
    expect(t.hint).toContain("what does the symbol mean here?");
    expect(t.escalation).toBe("same");
  });

  it("escalates up for empty/short drafts", async () => {
    const t = await fakeAdapter.tutor({
      questionId: "q1",
      questionText: "x",
      currentLevel: 1,
      threadHistory: [],
      draftText: "",
    });
    expect(t.escalation).toBe("up");
    expect(t.level).toBe(2);
  });

  it("escalates down when the draft shows reasoning (#16)", async () => {
    const t = await fakeAdapter.tutor({
      questionId: "q1",
      questionText: "x",
      currentLevel: 2,
      threadHistory: [],
      draftText:
        "By definition sin(x) ~ x for small x, therefore the limit is 1.",
    });
    expect(t.escalation).toBe("down");
    expect(t.level).toBe(1);
  });

  it("does not escalate below 0 or above 3", async () => {
    const downAtZero = await fakeAdapter.tutor({
      questionId: "q1",
      questionText: "x",
      currentLevel: 0,
      threadHistory: [],
      draftText:
        "By definition of continuity and the squeeze theorem, therefore we conclude that the upper bound matches the limit as n grows.",
    });
    expect(downAtZero.level).toBe(0);
    expect(downAtZero.escalation).toBe("down");

    const upAtThree = await fakeAdapter.tutor({
      questionId: "q1",
      questionText: "x",
      currentLevel: 3,
      threadHistory: [],
      draftText: "",
    });
    expect(upAtThree.level).toBe(3);
    expect(upAtThree.escalation).toBe("up");
  });

  it("levels off to `same` for in-between drafts", async () => {
    const t = await fakeAdapter.tutor({
      questionId: "q1",
      questionText: "x",
      currentLevel: 1,
      threadHistory: [],
      draftText: "I think we need to apply integration by parts here.",
    });
    expect(t.escalation).toBe("same");
    expect(t.level).toBe(1);
  });

  it("watch (#22) returns no flag for odd-hex captureHash", async () => {
    const v = await fakeAdapter.watch({ captureHash: "1234567890abcdef", pageIndex: 0 });
    expect(v.flag).toBe(false);
    expect(v.reasoning.length).toBeGreaterThan(0);
  });

  it("watch flags for even-hex captures with a severity band", async () => {
    const cases: Array<{ hash: string; expected: "high" | "medium" | "low" }> = [
      { hash: "0000000000000000", expected: "high" },
      { hash: "feedfacec0ffee0a", expected: "medium" },
      { hash: "feedfacec0ffee0e", expected: "low" },
    ];
    for (const c of cases) {
      const v = await fakeAdapter.watch({ captureHash: c.hash, pageIndex: 0 });
      expect(v.flag).toBe(true);
      expect(v.severity).toBe(c.expected);
      expect(v.ghostKey).toMatch(/^g-/);
    }
  });

  it("watch is deterministic for the same hash", async () => {
    const a = await fakeAdapter.watch({ captureHash: "feedfacec0ffee0e", pageIndex: 0 });
    const b = await fakeAdapter.watch({ captureHash: "feedfacec0ffee0e", pageIndex: 0 });
    expect(a).toEqual(b);
  });

  it("idk returns the smallest unblock (level 0) and never a final answer (#23)", async () => {
    const t = await fakeAdapter.idk({
      questionId: "q1",
      questionText: "Compute the limit of sin(x)/x as x approaches 0.",
      draftText: "I don't know where to start.",
    });
    expect(t.level).toBe(0);
    expect(t.hint.length).toBeGreaterThan(0);
    const lower = t.hint.toLowerCase();
    expect(lower).not.toMatch(/the answer is/);
    expect(lower).not.toMatch(/final answer/);
  });

  it("idk reflects the question's first sentence back to the student", async () => {
    const t = await fakeAdapter.idk({
      questionId: "q1",
      questionText: "Why does sin(x)/x approach 1?",
      draftText: "",
    });
    expect(t.hint).toContain("Why does sin(x)/x approach 1?");
  });
});

describe("fake-adapter identity", () => {
  it("has name 'fake'", () => {
    expect(fakeAdapter.name).toBe("fake");
  });
});
