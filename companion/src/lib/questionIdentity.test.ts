import { describe, expect, it } from "vitest";
import {
  inferLabelFromText,
  slugLabel,
  stableQuestionId,
} from "./questionIdentity";

describe("stableQuestionId", () => {
  it("uses slug of label when present", () => {
    expect(stableQuestionId("1a", "Anything")).toBe("q-1a");
    expect(stableQuestionId(" 2 ", "x")).toBe("q-2");
  });

  it("fingerprints text when label empty so scroll re-extracts stay distinct", () => {
    const a = stableQuestionId("", "Define the sample space.");
    const b = stableQuestionId("", "Compute P(A).");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^q-[0-9a-f]+$/);
  });

  it("is stable for the same text", () => {
    expect(stableQuestionId("", "Same text")).toBe(stableQuestionId("", "Same text"));
  });
});

describe("inferLabelFromText", () => {
  it("reads leading printed numbers", () => {
    expect(inferLabelFromText("1. Sample space", 0)).toBe("1");
    expect(inferLabelFromText("2a) Compute P(A)", 1)).toBe("2a");
    expect(inferLabelFromText("Question 3: Bayes", 2)).toBe("3");
  });

  it("falls back to 1-based index", () => {
    expect(inferLabelFromText("Define independence.", 2)).toBe("3");
  });
});

describe("slugLabel", () => {
  it("strips non-alphanumerics", () => {
    expect(slugLabel("1.a")).toBe("1a");
  });
});
