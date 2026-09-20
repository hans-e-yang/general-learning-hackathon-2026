import { describe, expect, it } from "vitest";
import type { BoardAnnotationTurn } from "@/contracts/board";
import { BOARD_VIEWBOX, DEFAULT_TEXT_WIDTH } from "@/contracts/board";
import { arrangeAnnotations, mapAnnotationsFromCrop } from "./annotate-layout";

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

describe("mapAnnotationsFromCrop", () => {
  const crop = { x: 80, y: 40, width: 400, height: 200 };

  it("is a no-op when the image already is the full board", () => {
    expect(
      mapAnnotationsFromCrop([ring, note], {
        x: 0,
        y: 0,
        width: BOARD_VIEWBOX.width,
        height: BOARD_VIEWBOX.height,
      }),
    ).toEqual([ring, note]);
  });

  it("maps a ring from the zoomed 800x1200 snapshot back onto the student's ink", () => {
    const imageRing: BoardAnnotationTurn = {
      kind: "board-shape",
      element: {
        id: "ring-1",
        author: "tutor",
        shape: "ellipse",
        x: 0,
        y: 0,
        width: BOARD_VIEWBOX.width,
        height: BOARD_VIEWBOX.height,
      },
    };
    const [mapped] = mapAnnotationsFromCrop([imageRing], crop);
    expect(mapped.kind).toBe("board-shape");
    if (mapped.kind !== "board-shape") throw new Error("expected shape");
    expect(mapped.element.x).toBe(crop.x);
    expect(mapped.element.y).toBe(crop.y);
    expect(mapped.element.width).toBe(crop.width);
    expect(mapped.element.height).toBe(crop.height);
  });

  it("maps a comment in the same image space", () => {
    const imageNote: BoardAnnotationTurn = {
      kind: "board-text",
      element: {
        id: "note-1",
        author: "tutor",
        x: BOARD_VIEWBOX.width / 2,
        y: BOARD_VIEWBOX.height / 2,
        source: "check the sign",
      },
    };
    const [mapped] = mapAnnotationsFromCrop([imageNote], crop);
    if (mapped.kind !== "board-text") throw new Error("expected text");
    expect(mapped.element.x).toBe(crop.x + crop.width / 2);
    expect(mapped.element.y).toBe(crop.y + crop.height / 2);
  });

  it("leaves marks alone when no crop was sent", () => {
    expect(mapAnnotationsFromCrop([ring, note])).toEqual([ring, note]);
  });
});
