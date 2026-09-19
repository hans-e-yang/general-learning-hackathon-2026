import { describe, expect, it } from "vitest";
import {
  ERASER_HIT_RADIUS,
  findElementsInRect,
  findPenStrokesNearPoints,
  penStrokeHitsPoint,
} from "./hitTest";
import type { BoardElement, PenElement } from "@/contracts/board";

const stroke = (id: string, points: { x: number; y: number }[]): PenElement => ({
  id,
  tool: "pen",
  author: "student",
  points,
  color: "#1a1a1a",
  strokeWidth: 2.5,
});

describe("penStrokeHitsPoint", () => {
  it("hits when the point is on the polyline", () => {
    const s = stroke("p1", [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(penStrokeHitsPoint(s, { x: 50, y: 0 })).toBe(true);
  });

  it("hits within radius of the segment", () => {
    const s = stroke("p1", [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(
      penStrokeHitsPoint(s, { x: 50, y: ERASER_HIT_RADIUS - 1 }),
    ).toBe(true);
  });

  it("misses outside radius", () => {
    const s = stroke("p1", [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(
      penStrokeHitsPoint(s, { x: 50, y: ERASER_HIT_RADIUS + 5 }),
    ).toBe(false);
  });
});

describe("findPenStrokesNearPoints", () => {
  it("returns only pen strokes near the eraser samples", () => {
    const elements = [
      stroke("a", [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
      ]),
      stroke("b", [
        { x: 200, y: 200 },
        { x: 240, y: 200 },
      ]),
      {
        id: "t1",
        tool: "text" as const,
        author: "student" as const,
        x: 10,
        y: 10,
        source: "nope",
        color: "#1a1a1a",
        width: 180,
        fontSize: 16,
      },
    ];
    expect(findPenStrokesNearPoints(elements, [{ x: 20, y: 0 }])).toEqual([
      "a",
    ]);
  });
});

describe("findElementsInRect", () => {
  const elements: BoardElement[] = [
    stroke("p1", [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]),
    {
      id: "s1",
      tool: "shape",
      shape: "rect",
      author: "student",
      x: 200,
      y: 200,
      width: 40,
      height: 40,
      color: "#1a1a1a",
      strokeWidth: 2.5,
    },
    {
      id: "t1",
      tool: "text",
      author: "student",
      x: 300,
      y: 300,
      source: "hi",
      color: "#1a1a1a",
      width: 180,
      fontSize: 16,
    },
  ];

  it("selects every drawable the marquee touches", () => {
    expect(
      findElementsInRect(elements, { x: -5, y: -5, width: 120, height: 20 }),
    ).toEqual(["p1"]);
  });

  it("selects pen strokes crossing the rect without a vertex inside it", () => {
    const crossing = stroke("p2", [
      { x: -100, y: 50 },
      { x: 100, y: 50 },
    ]);
    expect(
      findElementsInRect([crossing], {
        x: -10,
        y: 40,
        width: 20,
        height: 20,
      }),
    ).toEqual(["p2"]);
  });

  it("selects multiple elements across pen, shape and text", () => {
    expect(
      findElementsInRect(elements, { x: -5, y: -5, width: 500, height: 400 }),
    ).toEqual(["p1", "s1", "t1"]);
  });

  it("returns nothing for an empty rect in the gap", () => {
    expect(
      findElementsInRect(elements, { x: 120, y: 120, width: 20, height: 20 }),
    ).toEqual([]);
  });
});

