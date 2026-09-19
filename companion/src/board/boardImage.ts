import type { BoardElement, ShapeElement, TextElement } from "@/contracts/board";
import { BOARD_VIEWBOX } from "@/contracts/board";

const JPEG_QUALITY = 0.85;
const LINE_HEIGHT = 1.35;

/**
 * Rasterize the board's draw order to a base64 JPEG (no data-URL prefix) so the
 * agent can see exactly what the student sees. Browser-only; returns "" during
 * SSR or when a 2d context is unavailable.
 */
export function renderBoardToJpeg(
  elements: readonly BoardElement[],
  scale = 1,
): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(BOARD_VIEWBOX.width * scale);
  canvas.height = Math.round(BOARD_VIEWBOX.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.scale(scale, scale);
  ctx.fillStyle = "#fffdf8";
  ctx.fillRect(0, 0, BOARD_VIEWBOX.width, BOARD_VIEWBOX.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const el of elements) {
    if (el.tool === "pen") drawPen(ctx, el);
    else if (el.tool === "shape") drawShape(ctx, el);
    else if (el.tool === "text") drawText(ctx, el);
  }

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : "";
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
