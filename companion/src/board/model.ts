import type {
  BoardElement,
  BoardTurn,
  EraserMaskElement,
  PenElement,
  TextElement,
} from "@/contracts/board";
import { colorForAuthor } from "@/contracts/board";

/** Pure Board seam: turn in → new element list out. List order is render order. */
export function applyBoardTurn(
  elements: readonly BoardElement[],
  turn: BoardTurn,
): BoardElement[] {
  if (turn.kind === "board-remove") {
    return elements.filter((el) => el.id !== turn.elementId);
  }

  if (turn.kind === "board-text-move") {
    return elements.map((el) => {
      if (el.id !== turn.elementId || el.tool !== "text") return el;
      return { ...el, x: turn.x, y: turn.y };
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

/** Render list = element list order (eraserMask is append-only, not destructive). */
export function toRenderList(
  elements: readonly BoardElement[],
): readonly BoardElement[] {
  return elements;
}

function turnToElement(
  turn: Exclude<
    BoardTurn,
    { kind: "board-remove" } | { kind: "board-text-move" }
  >,
): BoardElement {
  switch (turn.kind) {
    case "board-pen":
      return normalizePen(turn.element);
    case "board-eraser":
      return normalizeEraser(turn.element);
    case "board-text":
      return normalizeText(turn.element);
  }
}

function normalizeElement(element: BoardElement): BoardElement {
  switch (element.tool) {
    case "pen":
      return normalizePen(element);
    case "eraserMask":
      return normalizeEraser(element);
    case "text":
      return normalizeText(element);
  }
}

function normalizePen(
  element: Omit<PenElement, "tool" | "color"> & {
    tool?: "pen";
    color?: string;
  },
): PenElement {
  return {
    id: element.id,
    tool: "pen",
    author: element.author,
    points: element.points.map((p) => ({ x: p.x, y: p.y })),
    color: element.color ?? colorForAuthor(element.author),
  };
}

function normalizeEraser(
  element: Omit<EraserMaskElement, "tool"> & { tool?: "eraserMask" },
): EraserMaskElement {
  return {
    id: element.id,
    tool: "eraserMask",
    author: element.author,
    points: element.points.map((p) => ({ x: p.x, y: p.y })),
  };
}

function normalizeText(
  element: Omit<TextElement, "tool" | "color"> & {
    tool?: "text";
    color?: string;
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
    ...(element.degraded ? { degraded: true } : {}),
  };
}
