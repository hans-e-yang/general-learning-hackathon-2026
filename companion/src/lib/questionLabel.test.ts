import { describe, expect, it } from "vitest";
import { normalizeQuestionLabel } from "./questionLabel";

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
