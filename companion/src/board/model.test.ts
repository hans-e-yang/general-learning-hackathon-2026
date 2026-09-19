import { describe, expect, it } from "vitest";
import { applyBoardElement, applyBoardTurn, toRenderList } from "./model";
import type { BoardElement } from "@/contracts/board";

describe("applyBoardTurn", () => {
  it("appends a pen stroke", () => {
    const next = applyBoardTurn([], {
      kind: "board-pen",
      element: {
        id: "p1",
        author: "student",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
        color: "#1a1a1a",
      },
    });
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: "p1",
      tool: "pen",
      author: "student",
    });
  });

  it("appends eraserMask without mutating prior elements", () => {
    const withPen = applyBoardTurn([], {
      kind: "board-pen",
      element: {
        id: "p1",
        author: "student",
        points: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
        ],
        color: "#1a1a1a",
      },
    });
    const next = applyBoardTurn(withPen, {
      kind: "board-eraser",
      element: {
        id: "e1",
        author: "student",
        points: [
          { x: 5, y: 0 },
          { x: 15, y: 0 },
        ],
      },
    });
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(withPen[0]);
    expect(next[1]?.tool).toBe("eraserMask");
  });

  it("appends text and fills author color when omitted", () => {
    const next = applyBoardTurn([], {
      kind: "board-text",
      element: {
        id: "t1",
        author: "tutor",
        x: 40,
        y: 80,
        source: "hint",
      },
    });
    expect(next[0]).toMatchObject({
      tool: "text",
      author: "tutor",
      color: "#b85c38",
      source: "hint",
    });
  });

  it("keeps tutor-authored elements as tutor", () => {
    const next = applyBoardElement([], {
      id: "tu1",
      tool: "pen",
      author: "tutor",
      points: [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
      color: "#b85c38",
    });
    expect(next[0]?.author).toBe("tutor");
  });

  it("removes an element by id via board-remove", () => {
    const withText = applyBoardTurn([], {
      kind: "board-text",
      element: {
        id: "t1",
        author: "student",
        x: 10,
        y: 20,
        source: "gone",
      },
    });
    const next = applyBoardTurn(withText, {
      kind: "board-remove",
      elementId: "t1",
    });
    expect(next).toHaveLength(0);
  });

  it("board-remove is a no-op for unknown ids", () => {
    const withPen = applyBoardTurn([], {
      kind: "board-pen",
      element: {
        id: "p1",
        author: "student",
        points: [{ x: 0, y: 0 }],
        color: "#1a1a1a",
      },
    });
    const next = applyBoardTurn(withPen, {
      kind: "board-remove",
      elementId: "missing",
    });
    expect(next).toEqual(withPen);
  });

  it("moves a text element via board-text-move", () => {
    const withText = applyBoardTurn([], {
      kind: "board-text",
      element: {
        id: "t1",
        author: "student",
        x: 10,
        y: 20,
        source: "move me",
      },
    });
    const next = applyBoardTurn(withText, {
      kind: "board-text-move",
      elementId: "t1",
      x: 100,
      y: 200,
    });
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: "t1",
      tool: "text",
      x: 100,
      y: 200,
      source: "move me",
    });
  });
});

describe("toRenderList", () => {
  it("preserves list order as render order", () => {
    const elements: BoardElement[] = [
      {
        id: "a",
        tool: "pen",
        author: "student",
        points: [{ x: 0, y: 0 }],
        color: "#1a1a1a",
      },
      {
        id: "b",
        tool: "eraserMask",
        author: "student",
        points: [{ x: 1, y: 1 }],
      },
      {
        id: "c",
        tool: "text",
        author: "tutor",
        x: 10,
        y: 10,
        source: "ok",
        color: "#b85c38",
      },
    ];
    expect(toRenderList(elements).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });
});
