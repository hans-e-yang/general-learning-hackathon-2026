import {
  BOARD_VIEWBOX,
  type BoardElement,
  type ShapeElement,
  type TextElement,
} from "@/contracts/board";

const TEXT_FONT_FAMILY =
  "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Greedy word wrap; `measure` returns the rendered width of a candidate line. */
export function wrapText(
  source: string,
  maxWidth: number,
  measure: (line: string) => number,
): string[] {
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawShape(ctx: CanvasRenderingContext2D, el: ShapeElement): void {
  const x = Math.min(el.x, el.x + el.width);
  const y = Math.min(el.y, el.y + el.height);
  const w = Math.abs(el.width);
  const h = Math.abs(el.height);
  ctx.strokeStyle = el.color;
  ctx.lineWidth = el.strokeWidth;
  ctx.beginPath();
  switch (el.shape) {
    case "rect":
      ctx.rect(x, y, w, h);
      break;
    case "ellipse":
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case "line":
      ctx.moveTo(el.x, el.y);
      ctx.lineTo(el.x + el.width, el.y + el.height);
      break;
    case "triangle":
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
  }
  ctx.stroke();
}

function drawText(ctx: CanvasRenderingContext2D, el: TextElement): void {
  ctx.fillStyle = el.color;
  ctx.font = `${el.fontSize}px ${TEXT_FONT_FAMILY}`;
  ctx.textBaseline = "top";
  const lines = wrapText(el.source, el.width, (line) => ctx.measureText(line).width);
  const lineHeight = el.fontSize * 1.3;
  lines.forEach((line, i) => {
    ctx.fillText(line, el.x, el.y + i * lineHeight);
  });
}

/** Paint the board into a 2D context in the board's own 800x1200 coordinate space. */
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  elements: readonly BoardElement[],
): void {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, BOARD_VIEWBOX.width, BOARD_VIEWBOX.height);
  for (const el of elements) {
    if (el.tool === "pen") {
      if (el.points.length < 2) continue;
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(el.points[0].x, el.points[0].y);
      for (let i = 1; i < el.points.length; i += 1) {
        ctx.lineTo(el.points[i].x, el.points[i].y);
      }
      ctx.stroke();
    } else if (el.tool === "shape") {
      drawShape(ctx, el);
    } else if (el.tool === "text") {
      drawText(ctx, el);
    }
  }
}

/**
 * Render the board to a bare base64 JPEG (no `data:` prefix), matching the
 * backend contract. Rendered at exactly the board's 800x1200 viewBox so image
 * pixels map 1:1 to element coordinates (used for grounded annotations).
 */
export function boardToJpegBase64(
  elements: readonly BoardElement[],
  quality = 0.7,
): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = BOARD_VIEWBOX.width;
  canvas.height = BOARD_VIEWBOX.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  drawBoard(ctx, elements);
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return dataUrl.replace(/^data:image\/jpeg;base64,/, "");
}
