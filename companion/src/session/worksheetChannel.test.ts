import { describe, expect, it } from "vitest";
import { questionsFromSsePayload } from "./worksheetChannel";

describe("questionsFromSsePayload", () => {
  it("reads worksheet from snapshot", () => {
    const qs = questionsFromSsePayload("snapshot", {
      uuid: "11111111-1111-4111-8111-111111111111",
      captures: [],
      worksheet: [
        { id: "q-p0-0", index: 0, text: "x", label: "1a", status: "blocked" },
      ],
      drafts: {},
      ghostSummary: [],
      exportReady: false,
    });
    expect(qs?.[0]?.label).toBe("1a");
  });

  it("reads questions from extraction.update", () => {
    const qs = questionsFromSsePayload("extraction.update", {
      partial: false,
      questions: [
        { id: "q-p0-0", index: 0, text: "x", label: "1b", status: "blocked" },
      ],
    });
    expect(qs?.[0]?.label).toBe("1b");
  });

  it("returns null for unrelated events", () => {
    expect(
      questionsFromSsePayload("material.accepted", {
        captureId: "c",
        deduped: false,
      }),
    ).toBeNull();
  });
});
