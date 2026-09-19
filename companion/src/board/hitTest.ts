import type {
  BoardElement,
  BoardPoint,
  PenElement,
  ShapeElement,
} from "@/contracts/board";

/** Default hit radius in Board viewBox units. */
export const ERASER_HIT_RADIUS = 14;

function dist2(a: BoardPoint, b: BoardPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function dist2PointToSegment(
  p: BoardPoint,
  a: BoardPoint,
  b: BoardPoint,
): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return dist2(p, a);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist2(p, { x: a.x + t * abx, y: a.y + t * aby });
}

export function penStrokeHitsPoint(
  stroke: PenElement,
  point: BoardPoint,
  radius = ERASER_HIT_RADIUS,
): boolean {
  const r2 = radius * radius;
  const pts = stroke.points;
  if (pts.length === 0) return false;
  if (pts.length === 1) return dist2(point, pts[0]) <= r2;
  for (let i = 0; i < pts.length - 1; i++) {
    if (dist2PointToSegment(point, pts[i], pts[i + 1]) <= r2) {
      return true;
    }
  }
  return false;
}

function shapeHitsPoint(
  shape: ShapeElement,
  point: BoardPoint,
  radius: number,
): boolean {
  const x0 = Math.min(shape.x, shape.x + shape.width);
  const x1 = Math.max(shape.x, shape.x + shape.width);
  const y0 = Math.min(shape.y, shape.y + shape.height);
  const y1 = Math.max(shape.y, shape.y + shape.height);
  const pad = radius;

  if (shape.shape === "line") {
    return (
      dist2PointToSegment(
        point,
        { x: shape.x, y: shape.y },
        { x: shape.x + shape.width, y: shape.y + shape.height },
      ) <=
      radius * radius
    );
  }

  if (shape.shape === "ellipse") {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const rx = Math.max((x1 - x0) / 2, 1) + pad;
    const ry = Math.max((y1 - y0) / 2, 1) + pad;
    const nx = (point.x - cx) / rx;
    const ny = (point.y - cy) / ry;
    return nx * nx + ny * ny <= 1;
  }

  // rect + triangle: padded AABB is enough for eraser QoL
  return (
    point.x >= x0 - pad &&
    point.x <= x1 + pad &&
    point.y >= y0 - pad &&
    point.y <= y1 + pad
  );
}

/** Drawable ids (pen / shape) near any eraser sample point. */
export function findPenStrokesNearPoints(
  elements: readonly BoardElement[],
  points: readonly BoardPoint[],
  radius = ERASER_HIT_RADIUS,
): string[] {
  if (points.length === 0) return [];
  const hits: string[] = [];
  for (const el of elements) {
    if (el.tool === "pen") {
      for (const p of points) {
        if (penStrokeHitsPoint(el, p, radius)) {
          hits.push(el.id);
          break;
        }
      }
    } else if (el.tool === "shape") {
      for (const p of points) {
        if (shapeHitsPoint(el, p, radius)) {
          hits.push(el.id);
          break;
        }
      }
    }
  }
  return hits;
}

/** Hit-test for selection: topmost drawable under point (reverse paint order). */
export function findElementAtPoint(
  elements: readonly BoardElement[],
  point: BoardPoint,
  radius = 8,
): BoardElement | null {
  const list = [...elements].reverse();
  for (const el of list) {
    if (el.tool === "pen" && penStrokeHitsPoint(el, point, radius)) return el;
    if (el.tool === "shape" && shapeHitsPoint(el, point, radius)) return el;
    if (el.tool === "text") {
      const w = el.width;
      const h = el.fontSize * 1.6;
      if (
        point.x >= el.x &&
        point.x <= el.x + w &&
        point.y >= el.y - h * 0.3 &&
        point.y <= el.y + h
      ) {
        return el;
      }
    }
  }
  return null;
}

export type SelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function rectsIntersect(a: SelectionRect, b: SelectionRect): boolean {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

/** Liang-Barsky: true when segment a→b touches the rect (degenerate = point). */
function segmentIntersectsRect(
  a: BoardPoint,
  b: BoardPoint,
  rect: SelectionRect,
): boolean {
  const xmin = rect.x;
  const xmax = rect.x + rect.width;
  const ymin = rect.y;
  const ymax = rect.y + rect.height;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - xmin, xmax - a.x, a.y - ymin, ymax - a.y];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
      continue;
    }
    const t = q[i] / p[i];
    if (p[i] < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
  }
  return true;
}

function elementRect(el: Extract<BoardElement, { tool: "shape" } | { tool: "text" }>) {
  if (el.tool === "shape") {
    const x0 = Math.min(el.x, el.x + el.width);
    const y0 = Math.min(el.y, el.y + el.height);
    return {
      x: x0,
      y: y0,
      width: Math.abs(el.width),
      height: Math.abs(el.height),
    };
  }
  const h = el.fontSize * 1.6;
  return { x: el.x, y: el.y - h * 0.3, width: el.width, height: h * 1.3 };
}

function elementIntersectsRect(
  el: BoardElement,
  rect: SelectionRect,
): boolean {
  if (el.tool === "eraserMask") return false;
  if (el.tool === "pen") {
    const pts = el.points;
    if (pts.length === 0) return false;
    if (pts.length === 1) return segmentIntersectsRect(pts[0], pts[0], rect);
    for (let i = 0; i < pts.length - 1; i++) {
      if (segmentIntersectsRect(pts[i], pts[i + 1], rect)) return true;
    }
    return false;
  }
  if (el.tool === "shape" && el.shape === "line") {
    return segmentIntersectsRect(
      { x: el.x, y: el.y },
      { x: el.x + el.width, y: el.y + el.height },
      rect,
    );
  }
  return rectsIntersect(elementRect(el), rect);
}

/** Marquee selection: ids of every drawable touched by the selection rect. */
export function findElementsInRect(
  elements: readonly BoardElement[],
  rect: SelectionRect,
): string[] {
  return elements
    .filter((el) => elementIntersectsRect(el, rect))
    .map((el) => el.id);
}

