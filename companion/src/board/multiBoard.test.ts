import { describe, expect, it } from "vitest";
import type { BoardElement } from "@/contracts/board";
import {
  applyElementToSlot,
  clearTutorMarks,
  ensureBoardSlots,
  neighborQuestionId,
  pickActiveQuestionId,
  removeBoardSlot,
} from "./multiBoard";

const tutorText: BoardElement = {
  id: "tutor-text-1",
  tool: "text",
  author: "tutor",
  x: 10,
  y: 10,
  source: "Check this step.",
  color: "#b85c38",
  width: 180,
  fontSize: 16,
};

describe("applyElementToSlot", () => {
  it("adds a tutor mark to the named board only", () => {
    const boards = { a: [] as BoardElement[], b: [] as BoardElement[] };
    const next = applyElementToSlot(boards, "a", tutorText);
    expect(next.a).toHaveLength(1);
    expect(next.b).toHaveLength(0);
  });

  it("creates a slot when the question is not yet known", () => {
    const next = applyElementToSlot({}, "late", tutorText);
    expect(next.late).toHaveLength(1);
  });

  it("ignores a duplicate element id (keeps the same map)", () => {
    const boards = { a: [tutorText] };
    expect(applyElementToSlot(boards, "a", tutorText)).toBe(boards);
  });
});

describe("clearTutorMarks", () => {
  it("drops tutor marks but keeps student ink on the named board", () => {
    const studentInk: BoardElement = {
      id: "pen-1",
      tool: "pen",
      author: "student",
      points: [{ x: 0, y: 0 }],
      color: "#1a1a1a",
      strokeWidth: 2,
    };
    const boards = { a: [studentInk, tutorText], b: [tutorText] };
    const next = clearTutorMarks(boards, "a");
    expect(next.a).toEqual([studentInk]);
    expect(next.b).toHaveLength(1);
  });

  it("is a no-op when the board has no tutor marks", () => {
    const boards = { a: [tutorText] };
    // tutorText is the only element, so clearing leaves an empty (new) array.
    expect(clearTutorMarks(boards, "missing")).toBe(boards);
  });
});

describe("ensureBoardSlots", () => {
  it("adds empty slots without dropping existing ink keys", () => {
    const prev = { "q-p0-0": [{ id: "pen-1" } as never] };
    const next = ensureBoardSlots(prev, [{ id: "q-p0-0" }, { id: "q-p0-1" }]);
    expect(next["q-p0-0"]).toHaveLength(1);
    expect(next["q-p0-1"]).toEqual([]);
  });

  it("ink map keys stay isolated when ensuring new slots", () => {
    const boards = ensureBoardSlots(
      { a: [{ id: "x" } as never] },
      [{ id: "a" }, { id: "b" }],
    );
    expect(boards.a).toHaveLength(1);
    expect(boards.b).toHaveLength(0);
  });

  it("retains ink when a question leaves the list", () => {
    const prev = {
      "q-removed": [{ id: "pen-1" } as never],
      "q-kept": [],
    };
    const next = ensureBoardSlots(prev, [{ id: "q-kept" }]);
    expect(next["q-removed"]).toHaveLength(1);
    expect(next["q-kept"]).toEqual([]);
  });
});

describe("pickActiveQuestionId", () => {
  it("selects first on empty prev", () => {
    expect(pickActiveQuestionId(null, [{ id: "a" }, { id: "b" }])).toBe("a");
  });
  it("keeps prev when still present", () => {
    expect(pickActiveQuestionId("b", [{ id: "a" }, { id: "b" }])).toBe("b");
  });
});

describe("neighborQuestionId", () => {
  it("moves next/prev in order", () => {
    const qs = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(neighborQuestionId(qs, "a", 1)).toBe("b");
    expect(neighborQuestionId(qs, "c", 1)).toBeNull();
    expect(neighborQuestionId(qs, "b", -1)).toBe("a");
  });
});

describe("removeBoardSlot", () => {
  it("removes only the deleted page and keeps sibling ink", () => {
    const prev = {
      a: [{ id: "pen-a" } as never],
      b: [{ id: "pen-b" } as never],
    };
    const next = removeBoardSlot(prev, "a");
    expect("a" in next).toBe(false);
    expect(next.b).toHaveLength(1);
  });

  it("is a no-op for an unknown id", () => {
    const prev = { a: [] as never[] };
    expect(removeBoardSlot(prev, "missing")).toBe(prev);
  });
});
