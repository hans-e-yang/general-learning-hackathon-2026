import { describe, expect, it } from "vitest";
import {
  compareQuestionLabels,
  composeQuestionLabels,
  normalizeQuestionLabel,
  sortQuestionItems,
} from "./questionLabel";

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

describe("compareQuestionLabels / sortQuestionItems", () => {
  it("orders numbers numerically, not lexically (2 before 10)", () => {
    expect(
      sortQuestionItems([{ label: "10" }, { label: "2" }, { label: "1" }]).map(
        (q) => q.label,
      ),
    ).toEqual(["1", "2", "10"]);
  });

  it("orders sub-part letters within a number (1 < 1a < 1b < 2)", () => {
    expect(
      sortQuestionItems([
        { label: "2" },
        { label: "1b" },
        { label: "1a" },
        { label: "1" },
      ]).map((q) => q.label),
    ).toEqual(["1", "1a", "1b", "2"]);
  });

  it("sorts a mixed, shuffled list into printed order", () => {
    const shuffled = ["2b", "1a", "10", "2a", "1b", "1"];
    expect(sortQuestionItems(shuffled.map((label) => ({ label }))).map((q) => q.label)).toEqual(
      ["1", "1a", "1b", "2a", "2b", "10"],
    );
  });

  it("puts unnumbered labels after numbered ones, alphabetically", () => {
    expect(
      sortQuestionItems([{ label: "b" }, { label: "1" }, { label: "a" }]).map(
        (q) => q.label,
      ),
    ).toEqual(["1", "a", "b"]);
  });

  it("is stable for equal labels", () => {
    const items = [
      { label: "1", id: "first" },
      { label: "1", id: "second" },
    ];
    expect(sortQuestionItems(items).map((q) => q.id)).toEqual([
      "first",
      "second",
    ]);
  });

  it("compareQuestionLabels handles equal labels", () => {
    expect(compareQuestionLabels("1a", "1a")).toBe(0);
  });
});
