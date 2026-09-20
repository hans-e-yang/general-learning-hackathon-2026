import type { BoardElement, ShapeElement, TextElement } from "@/contracts/board";
import { BOARD_VIEWBOX } from "@/contracts/board";

const JPEG_QUALITY = 0.85;
const LINE_HEIGHT = 1.35;

/** Matches SVG `preserveAspectRatio="xMidYMin meet"` on the Board surface. */
export function svgMeetXMidYMin(
  viewBox: { width: number; height: number },
  viewport: { width: number; height: number },
): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.min(
    viewport.width / viewBox.width,
    viewport.height / viewBox.height,
  );
  return {
    scale,
    offsetX: (viewport.width - viewBox.width * scale) / 2,
    offsetY: 0,
  };
}

/**
 * Rasterize the board's draw order to a base64 JPEG (no data-URL prefix) so the
 * agent can see exactly what the student sees. Browser-only; returns "" during
 * SSR or when a 2d context is unavailable.
 */
export function renderBoardToJpeg(
  elements: readonly BoardElement[],
  scale = 1,
  crop?: { x: number; y: number; width: number; height: number },
): string {
  return rasterizeBoard(elements, {
    width: BOARD_VIEWBOX.width * scale,
    height: BOARD_VIEWBOX.height * scale,
    pixelRatio: 1,
    meet: false,
    crop,
  });
}

/**
 * Rasterize onto a canvas the size of the on-screen Board surface, using the
 * same xMidYMin meet mapping as the SVG so the PDF matches what the student sees.
 */
export function renderBoardViewportToJpeg(
  elements: readonly BoardElement[],
  viewport: { width: number; height: number },
  pixelRatio = 1,
): string {
  return rasterizeBoard(elements, {
    width: Math.max(1, viewport.width),
    height: Math.max(1, viewport.height),
    pixelRatio: Math.max(1, pixelRatio),
    meet: true,
  });
}

function rasterizeBoard(
  elements: readonly BoardElement[],
  opts: {
    width: number;
    height: number;
    pixelRatio: number;
    meet: boolean;
    crop?: { x: number; y: number; width: number; height: number };
  },
): string {
  if (typeof document === "undefined") return "";
  const { width: cssW, height: cssH, pixelRatio: dpr, meet, crop } = opts;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#fffdf8";
  ctx.fillRect(0, 0, cssW, cssH);

  if (meet) {
    const { scale, offsetX, offsetY } = svgMeetXMidYMin(BOARD_VIEWBOX, {
      width: cssW,
      height: cssH,
    });
    ctx.setTransform(
      dpr * scale,
      0,
      0,
      dpr * scale,
      dpr * offsetX,
      dpr * offsetY,
    );
  } else {
    const src = crop ?? BOARD_VIEWBOX;
    const sx = cssW / src.width;
    const sy = cssH / src.height;
    ctx.setTransform(
      dpr * sx,
      0,
      0,
      dpr * sy,
      -dpr * sx * src.x,
      -dpr * sy * src.y,
    );
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  paintBoard(ctx, elements);

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : "";
}

function paintBoard(
  ctx: CanvasRenderingContext2D,
  elements: readonly BoardElement[],
): void {
  for (const el of elements) {
    if (el.tool === "pen") drawPen(ctx, el);
    else if (el.tool === "shape") drawShape(ctx, el);
    else if (el.tool === "text") drawText(ctx, el);
  }
}

function drawPen(
  ctx: CanvasRenderingContext2D,
  el: Extract<BoardElement, { tool: "pen" }>,
): void {
  if (el.points.length === 0) return;
  ctx.strokeStyle = el.color;
  ctx.lineWidth = el.strokeWidth;
  ctx.beginPath();
  const [first, ...rest] = el.points;
  ctx.moveTo(first.x, first.y);
  for (const p of rest) ctx.lineTo(p.x, p.y);
  ctx.stroke();
}

function drawShape(ctx: CanvasRenderingContext2D, el: ShapeElement): void {
  const x = Math.min(el.x, el.x + el.width);
  const y = Math.min(el.y, el.y + el.height);
  const w = Math.abs(el.width);
  const h = Math.abs(el.height);
  ctx.strokeStyle = el.color;
  ctx.lineWidth = el.strokeWidth;
  ctx.beginPath();
  if (el.shape === "ellipse") {
    ctx.ellipse(x + w / 2, y + h / 2, Math.max(w / 2, 0.5), Math.max(h / 2, 0.5), 0, 0, Math.PI * 2);
  } else if (el.shape === "line") {
    ctx.moveTo(el.x, el.y);
    ctx.lineTo(el.x + el.width, el.y + el.height);
  } else if (el.shape === "triangle") {
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.stroke();
}

function drawText(ctx: CanvasRenderingContext2D, el: TextElement): void {
  ctx.fillStyle = el.color;
  ctx.font = `${el.fontSize}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.textBaseline = "top";
  const source = el.source.replace(/\$/g, "");
  const paragraphs = source.split("\n");
  let cursorY = el.y;
  for (const paragraph of paragraphs) {
    for (const line of wrap(ctx, paragraph, el.width)) {
      ctx.fillText(line, el.x, cursorY);
      cursorY += el.fontSize * LINE_HEIGHT;
    }
  }
}

function wrap(
  ctx: CanvasRenderingContext2D,
  paragraph: string,
  maxWidth: number,
): string[] {
  const words = paragraph.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}
