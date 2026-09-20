import { describe, expect, it } from "vitest";
import { annotationBarKind, reduceBoardWorkStatus } from "./workStatus";

describe("board work status", () => {
  it("shows solid only after a solid annotate event", () => {
    expect(
      reduceBoardWorkStatus(undefined, { type: "annotate", status: "solid" }),
    ).toBe("solid");
  });

  it("hides the indicator after a blocked annotate", () => {
    expect(
      reduceBoardWorkStatus("solid", { type: "annotate", status: "blocked" }),
    ).toBeUndefined();
  });

  it("hides the indicator when the student revises the board", () => {
    expect(reduceBoardWorkStatus("solid", { type: "revise" })).toBeUndefined();
  });

  it("does not treat an annotate without status as solid", () => {
    expect(reduceBoardWorkStatus("solid", { type: "annotate" })).toBeUndefined();
  });
});

describe("annotationBarKind", () => {
  const idle = {
    checking: false,
    looksSolid: false,
    hasTutorMarks: false,
    working: false,
  };

  it("shows checking ahead of solid or error marks", () => {
    expect(
      annotationBarKind({
        ...idle,
        checking: true,
        looksSolid: true,
        hasTutorMarks: true,
      }),
    ).toBe("checking");
  });

  it("shows solid when the last pass said the work is complete and correct", () => {
    expect(annotationBarKind({ ...idle, looksSolid: true })).toBe("solid");
  });

  it("shows error marks when the tutor circled a step", () => {
    expect(annotationBarKind({ ...idle, hasTutorMarks: true })).toBe("error");
  });

  it("hides the bar when nothing is happening", () => {
    expect(annotationBarKind(idle)).toBeNull();
  });
});
