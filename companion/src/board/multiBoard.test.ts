import { describe, expect, it } from "vitest";
import {
  ensureBoardSlots,
  neighborQuestionId,
  pickActiveQuestionId,
} from "./multiBoard";

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
