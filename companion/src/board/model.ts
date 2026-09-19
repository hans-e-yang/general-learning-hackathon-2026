import type {
  BoardElement,
  BoardTurn,
  PenElement,
  ShapeElement,
  TextElement,
} from "@/contracts/board";
import {
  colorForAuthor,
  DEFAULT_PEN_WEIGHT,
  DEFAULT_TEXT_FONT_SIZE,
  DEFAULT_TEXT_WIDTH,
} from "@/contracts/board";

/** Pure Board seam: turn in → new element list out. List order is render order. */
export function applyBoardTurn(
  elements: readonly BoardElement[],
  turn: BoardTurn,
): BoardElement[] {
  if (turn.kind === "board-remove") {
    return elements.filter((el) => el.id !== turn.elementId);
  }

  if (turn.kind === "board-eraser") {
    if (turn.elementIds.length === 0) return [...elements];
    const remove = new Set(turn.elementIds);
    return elements.filter((el) => !remove.has(el.id));
  }

  if (turn.kind === "board-text-move") {
    return elements.map((el) => {
      if (el.id !== turn.elementId || el.tool !== "text") return el;
      return {
        ...el,
        x: turn.x,
        y: turn.y,
        ...(turn.width !== undefined ? { width: turn.width } : {}),
        ...(turn.fontSize !== undefined ? { fontSize: turn.fontSize } : {}),
      };
    });
  }

  if (turn.kind === "board-pen-move") {
    return elements.map((el) => {
      if (el.id !== turn.elementId || el.tool !== "pen") return el;
      return {
        ...el,
        points: el.points.map((p) => ({
          x: p.x + turn.dx,
          y: p.y + turn.dy,
        })),
      };
    });
  }

  if (turn.kind === "board-shape-move") {
    return elements.map((el) => {
      if (el.id !== turn.elementId || el.tool !== "shape") return el;
      return {
        ...el,
        x: turn.x,
        y: turn.y,
        width: turn.width,
        height: turn.height,
      };
    });
  }

  const next = turnToElement(turn);
  if (elements.some((el) => el.id === next.id)) {
    return [...elements];
  }
  return [...elements, next];
}

export function applyBoardElement(
  elements: readonly BoardElement[],
  element: BoardElement,
): BoardElement[] {
  if (elements.some((el) => el.id === element.id)) {
    return [...elements];
  }
  return [...elements, normalizeElement(element)];
}

export function removeBoardElement(
  elements: readonly BoardElement[],
  elementId: string,
): BoardElement[] {
  return elements.filter((el) => el.id !== elementId);
}

/** Render list = element list order (legacy eraserMask strokes are ignored). */
export function toRenderList(
  elements: readonly BoardElement[],
): readonly BoardElement[] {
  return elements.filter((el) => el.tool !== "eraserMask");
}

function turnToElement(
  turn: Extract<
    BoardTurn,
    { kind: "board-pen" } | { kind: "board-text" } | { kind: "board-shape" }
  >,
): BoardElement {
  switch (turn.kind) {
    case "board-pen":
      return normalizePen(turn.element);
    case "board-text":
      return normalizeText(turn.element);
    case "board-shape":
      return normalizeShape(turn.element);
  }
}

function normalizeElement(element: BoardElement): BoardElement {
  switch (element.tool) {
    case "pen":
      return normalizePen(element);
    case "eraserMask":
      return element;
    case "text":
      return normalizeText(element);
    case "shape":
      return normalizeShape(element);
  }
}

function normalizePen(
  element: Omit<PenElement, "tool" | "color" | "strokeWidth"> & {
    tool?: "pen";
    color?: string;
    strokeWidth?: number;
  },
): PenElement {
  return {
    id: element.id,
    tool: "pen",
    author: element.author,
    points: element.points.map((p) => ({ x: p.x, y: p.y })),
    color: element.color ?? colorForAuthor(element.author),
    strokeWidth: element.strokeWidth ?? DEFAULT_PEN_WEIGHT,
  };
}

function normalizeText(
  element: Omit<TextElement, "tool" | "color" | "width" | "fontSize"> & {
    tool?: "text";
    color?: string;
    width?: number;
    fontSize?: number;
    degraded?: boolean;
  },
): TextElement {
  return {
    id: element.id,
    tool: "text",
    author: element.author,
    x: element.x,
    y: element.y,
    source: element.source,
    color: element.color ?? colorForAuthor(element.author),
    width: element.width ?? DEFAULT_TEXT_WIDTH,
    fontSize: element.fontSize ?? DEFAULT_TEXT_FONT_SIZE,
    ...(element.degraded ? { degraded: true } : {}),
  };
}

function normalizeShape(
  element: Omit<ShapeElement, "tool" | "color" | "strokeWidth"> & {
    tool?: "shape";
    color?: string;
    strokeWidth?: number;
  },
): ShapeElement {
  return {
    id: element.id,
    tool: "shape",
    shape: element.shape,
    author: element.author,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    color: element.color ?? colorForAuthor(element.author),
    strokeWidth: element.strokeWidth ?? DEFAULT_PEN_WEIGHT,
  };
}
