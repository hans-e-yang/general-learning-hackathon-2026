import { describe, expect, it } from "vitest";
import { BOARD_VIEWBOX, type BoardElement } from "@/contracts/board";
import {
  annotateCropFor,
  boardTranscript,
  studentWorkBounds,
} from "./workBounds";

const pen: BoardElement = {
  id: "pen-1",
  tool: "pen",
  author: "student",
  color: "#1a1a1a",
  strokeWidth: 2.5,
  points: [
    { x: 80, y: 40 },
    { x: 200, y: 90 },
    { x: 160, y: 120 },
  ],
};

const typed: BoardElement = {
  id: "text-1",
  tool: "text",
  author: "student",
  x: 40,
  y: 60,
  source: "p(even) = p(2)+p(4)+p(6)",
  color: "#1a1a1a",
  width: 180,
  fontSize: 16,
};

const tutorRing: BoardElement = {
  id: "tutor-1",
  tool: "shape",
  author: "tutor",
  shape: "ellipse",
  x: 10,
  y: 10,
  width: 400,
  height: 400,
  color: "#b85c38",
  strokeWidth: 2,
};

describe("studentWorkBounds", () => {
  it("bounds handwriting to the stroke, ignoring tutor marks", () => {
    const rect = studentWorkBounds([tutorRing, pen]);
    expect(rect).toEqual({ x: 80, y: 40, width: 120, height: 80 });
  });

  it("includes typed text boxes so the crop covers KaTeX chips", () => {
    const rect = studentWorkBounds([typed]);
    expect(rect?.x).toBe(40);
    expect(rect?.y).toBe(60);
    expect(rect?.width).toBe(180);
    expect(rect?.height).toBeGreaterThanOrEqual(16);
  });

  it("returns null when the student has not drawn anything", () => {
    expect(studentWorkBounds([tutorRing])).toBeNull();
  });
});

describe("annotateCropFor", () => {
  it("pads student work and stays inside the board page", () => {
    const crop = annotateCropFor([pen]);
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(BOARD_VIEWBOX.width);
    expect(crop.y + crop.height).toBeLessThanOrEqual(BOARD_VIEWBOX.height);
    expect(crop.x).toBeLessThan(80);
    expect(crop.y).toBeLessThan(40);
    expect(crop.x + crop.width).toBeGreaterThan(200);
    expect(crop.y + crop.height).toBeGreaterThan(120);
  });

  it("falls back to the full page when there is no student work", () => {
    expect(annotateCropFor([])).toEqual({
      x: 0,
      y: 0,
      width: BOARD_VIEWBOX.width,
      height: BOARD_VIEWBOX.height,
    });
  });
});

describe("boardTranscript", () => {
  it("joins student text sources so the tutor can read typed math without OCR", () => {
    expect(boardTranscript([typed, pen, tutorRing])).toBe(
      "p(even) = p(2)+p(4)+p(6)",
    );
  });

  it("returns empty when the student only used the pen", () => {
    expect(boardTranscript([pen])).toBe("");
  });
});
