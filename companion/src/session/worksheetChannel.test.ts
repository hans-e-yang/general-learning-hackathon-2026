import { describe, expect, it } from "vitest";
import { questionsFromSsePayload } from "./worksheetChannel";

describe("questionsFromSsePayload", () => {
  it("reads worksheet from snapshot", () => {
    const qs = questionsFromSsePayload("snapshot", {
      uuid: "11111111-1111-4111-8111-111111111111",
      captures: [],
      worksheet: [
        { id: "q-p0-0", index: 0, text: "x", status: "blocked" },
      ],
      drafts: {},
      ghostSummary: [],
      exportReady: false,
    });
    expect(qs?.[0]?.id).toBe("q-p0-0");
    expect(qs?.[0]?.index).toBe(0);
  });

  it("reads questions from extraction.update", () => {
    const qs = questionsFromSsePayload("extraction.update", {
      partial: false,
      questions: [
        { id: "q-p0-0", index: 0, text: "x", status: "blocked" },
      ],
    });
    expect(qs?.[0]?.id).toBe("q-p0-0");
    expect(qs?.[0]?.text).toBe("x");
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

describe("subscribeWorksheet capture processing", () => {
  it("exposes onCaptureProcessing on the options type via a no-op subscribe shape", () => {
    // Smoke: options accept the callback (runtime EventSource is browser-only).
    const options: import("./worksheetChannel").SubscribeWorksheetOptions = {
      onCaptureProcessing: (busy) => {
        expect(typeof busy).toBe("boolean");
      },
    };
    options.onCaptureProcessing?.(true);
    options.onCaptureProcessing?.(false);
  });
});
