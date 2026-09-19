import { describe, expect, it } from "vitest";
import type { BoardAnnotationTurn } from "@/contracts/board";
import { BOARD_VIEWBOX, DEFAULT_TEXT_WIDTH } from "@/contracts/board";
import { arrangeAnnotations } from "./annotate-layout";

const ring: BoardAnnotationTurn = {
  kind: "board-shape",
  element: {
    id: "ring-1",
    author: "tutor",
    shape: "ellipse",
    x: 100,
    y: 200,
    width: 160,
    height: 60,
  },
};

const note: BoardAnnotationTurn = {
  kind: "board-text",
  element: {
    id: "note-1",
    author: "tutor",
    x: 0,
    y: 0,
    source: "check the sign",
  },
};

describe("arrangeAnnotations", () => {
  it("moves a tutor comment to the right of its ring", () => {
    const [moved] = arrangeAnnotations([ring, note]).filter(
      (t): t is Extract<BoardAnnotationTurn, { kind: "board-text" }> =>
        t.kind === "board-text",
    );
    expect(moved.element.x).toBe(100 + 160 + 18);
    expect(moved.element.y).toBe(200 + 60 / 2 - 8);
  });

  it("flips the comment to the left near the right edge", () => {
    const edgeRing: BoardAnnotationTurn = {
      kind: "board-shape",
      element: { ...ring.element, x: BOARD_VIEWBOX.width - 140 },
    };
    const [moved] = arrangeAnnotations([edgeRing, note]).filter(
      (t): t is Extract<BoardAnnotationTurn, { kind: "board-text" }> =>
        t.kind === "board-text",
    );
    expect(moved.element.x).toBeLessThan(edgeRing.element.x);
    expect(
      moved.element.x + (moved.element.width ?? DEFAULT_TEXT_WIDTH),
    ).toBeLessThanOrEqual(BOARD_VIEWBOX.width);
  });

  it("leaves a comment alone when there is no ring", () => {
    expect(arrangeAnnotations([note])).toEqual([note]);
  });
});
