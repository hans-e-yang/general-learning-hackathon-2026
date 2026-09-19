import { describe, expect, it } from "vitest";
import {
  ERASER_HIT_RADIUS,
  findPenStrokesNearPoints,
  penStrokeHitsPoint,
} from "./hitTest";
import type { PenElement } from "@/contracts/board";

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
