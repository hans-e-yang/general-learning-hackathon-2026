import { describe, expect, it } from "vitest";
import { composeQuestionLabels, normalizeQuestionLabel } from "./questionLabel";

describe("normalizeQuestionLabel", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeQuestionLabel(" 1 a ", 0)).toBe("1a");
  });

  it("falls back to 1-based index when empty", () => {
    expect(normalizeQuestionLabel("", 0)).toBe("1");
    expect(normalizeQuestionLabel(undefined, 2)).toBe("3");
  });

  it("keeps compact labels like 1a / 2", () => {
    expect(normalizeQuestionLabel("1a", 0)).toBe("1a");
    expect(normalizeQuestionLabel("2", 1)).toBe("2");
  });
});

describe("composeQuestionLabels", () => {
  it("composes Exercise 1 + a)/b) into 1a, 1b", () => {
    expect(
      composeQuestionLabels([
        { text: "Exercise 1\na) A biased die…" },
        { label: "b", text: "b) Expected value…" },
      ]),
    ).toEqual(["1a", "1b"]);
  });

  it("keeps explicit 1a / 1b from the model", () => {
    expect(
      composeQuestionLabels([
        { label: "1a", text: "A biased die" },
        { label: "1b", text: "Expected value" },
      ]),
    ).toEqual(["1a", "1b"]);
  });

  it("upgrades bare letter labels using the current exercise number", () => {
    expect(
      composeQuestionLabels([
        { label: "1", text: "Exercise 1" },
        { label: "a", text: "a) first subpart" },
        { label: "b", text: "b) second subpart" },
      ]),
    ).toEqual(["1", "1a", "1b"]);
  });

  it("reads a)/b) from text when label is missing", () => {
    expect(
      composeQuestionLabels([
        { text: "Exercise 2. Warmup" },
        { text: "a) Define X." },
        { text: "b) Find E[X]." },
      ]),
    ).toEqual(["2", "2a", "2b"]);
  });
});
