import { describe, expect, it } from "vitest";
import { BOARD_VIEWBOX } from "@/contracts/board";
import { svgMeetXMidYMin } from "./boardImage";

describe("svgMeetXMidYMin", () => {
  it("letterboxes a wide viewport and pins the Board to the top (matches SVG meet)", () => {
    const t = svgMeetXMidYMin(BOARD_VIEWBOX, { width: 1600, height: 900 });
    expect(t.scale).toBe(900 / 1200);
    expect(t.offsetX).toBe((1600 - 800 * t.scale) / 2);
    expect(t.offsetY).toBe(0);
  });

  it("letterboxes a tall viewport using width and stays top-aligned", () => {
    const t = svgMeetXMidYMin(BOARD_VIEWBOX, { width: 400, height: 900 });
    expect(t.scale).toBe(400 / 800);
    expect(t.offsetX).toBe(0);
    expect(t.offsetY).toBe(0);
  });
});
