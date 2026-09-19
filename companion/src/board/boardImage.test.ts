import { describe, expect, it } from "vitest";
import { wrapText } from "./boardImage";

const measure = (line: string) => line.length * 10;

describe("wrapText", () => {
  it("keeps a short line whole", () => {
    expect(wrapText("hello world", 200, measure)).toEqual(["hello world"]);
  });

  it("wraps at word boundaries under the max width", () => {
    // "hello world" = 110px; 100px forces a break.
    expect(wrapText("hello world", 100, measure)).toEqual(["hello", "world"]);
  });

  it("returns no lines for empty/whitespace input", () => {
    expect(wrapText("   ", 100, measure)).toEqual([]);
  });

  it("keeps a single overlong word on its own line", () => {
    expect(wrapText("supercalifragilistic", 50, measure)).toEqual([
      "supercalifragilistic",
    ]);
  });
});
