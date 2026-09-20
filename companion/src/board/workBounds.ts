import type { BoardElement, TextElement } from "@/contracts/board";
import { BOARD_VIEWBOX } from "@/contracts/board";

export type BoardRect = { x: number; y: number; width: number; height: number };

const CROP_PAD = 48;
const MIN_CROP = 96;
const TEXT_LINE_HEIGHT = 1.6;

function union(a: BoardRect, b: BoardRect): BoardRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

function textHeight(el: TextElement): number {
  const lines = Math.max(1, el.source.split("\n").length);
  return Math.max(el.fontSize * TEXT_LINE_HEIGHT * lines, el.fontSize);
}

export function elementBounds(el: BoardElement): BoardRect | null {
  if (el.tool === "pen") {
    if (el.points.length === 0) return null;
    const xs = el.points.map((p) => p.x);
    const ys = el.points.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return {
      x,
      y,
      width: Math.max(...xs) - x,
      height: Math.max(...ys) - y,
    };
  }
  if (el.tool === "shape") {
    return {
      x: Math.min(el.x, el.x + el.width),
      y: Math.min(el.y, el.y + el.height),
      width: Math.abs(el.width),
      height: Math.abs(el.height),
    };
  }
  if (el.tool === "text") {
    return { x: el.x, y: el.y, width: el.width, height: textHeight(el) };
  }
  return null;
}

/** Axis-aligned bounds of student ink/text, excluding Tutor marks. */
export function studentWorkBounds(
  elements: readonly BoardElement[],
): BoardRect | null {
  let acc: BoardRect | null = null;
  for (const el of elements) {
    if (el.author !== "student") continue;
    const rect = elementBounds(el);
    if (!rect) continue;
    acc = acc ? union(acc, rect) : rect;
  }
  return acc;
}

function clampCrop(rect: BoardRect): BoardRect {
  const x = Math.min(Math.max(rect.x, 0), BOARD_VIEWBOX.width);
  const y = Math.min(Math.max(rect.y, 0), BOARD_VIEWBOX.height);
  return {
    x,
    y,
    width: Math.min(Math.max(rect.width, 1), BOARD_VIEWBOX.width - x),
    height: Math.min(Math.max(rect.height, 1), BOARD_VIEWBOX.height - y),
  };
}

/**
 * Region of the 800x1200 board that the annotate JPEG should fill, padded so
 * the vision model sees handwriting/typed math large enough to read.
 */
export function annotateCropFor(elements: readonly BoardElement[]): BoardRect {
  const bounds = studentWorkBounds(elements);
  if (!bounds) {
    return {
      x: 0,
      y: 0,
      width: BOARD_VIEWBOX.width,
      height: BOARD_VIEWBOX.height,
    };
  }
  const width = Math.max(bounds.width + CROP_PAD * 2, MIN_CROP);
  const height = Math.max(bounds.height + CROP_PAD * 2, MIN_CROP);
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  return clampCrop({
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
  });
}

/** Student-typed sources, one line per chip, for the annotate prompt. */
export function boardTranscript(elements: readonly BoardElement[]): string {
  return elements
    .filter(
      (el): el is TextElement =>
        el.tool === "text" && el.author === "student" && el.source.trim().length > 0,
    )
    .map((el) => el.source.trim())
    .join("\n");
}
