import { describe, expect, it } from "vitest";
import { isBoardDirty, markBoardAnnotated } from "./idleAnnotate";

describe("isBoardDirty", () => {
  it("is dirty when the board has been edited since the last annotate", () => {
    expect(isBoardDirty({ q1: 2 }, "q1", 3)).toBe(true);
  });

  it("is clean when this revision was already sent", () => {
    expect(isBoardDirty({ q1: 3 }, "q1", 3)).toBe(false);
  });

  it("is dirty for another question at the same global revision", () => {
    expect(isBoardDirty({ q1: 5 }, "q2", 5)).toBe(true);
  });

  it("is clean when the board has never been edited", () => {
    expect(isBoardDirty({}, "q1", undefined)).toBe(false);
    expect(isBoardDirty({}, "q1", 0)).toBe(false);
  });
});

describe("markBoardAnnotated", () => {
  it("records the sent revision without clobbering other boards", () => {
    expect(markBoardAnnotated({ q1: 2 }, "q2", 4)).toEqual({ q1: 2, q2: 4 });
  });
});
