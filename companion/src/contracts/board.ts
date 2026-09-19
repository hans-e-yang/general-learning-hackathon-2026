/**
 * Provisional Board payload freeze surface (feeds issue #10).
 * Lane B / contract freeze should merge from this file — do not fork a rival schema.
 */

export const BOARD_VIEWBOX = { width: 800, height: 1200 } as const;

export type BoardAuthor = "student" | "tutor";

/** Drawing / interaction tools in the companion toolbar. */
export type BoardTool = "select" | "pen" | "eraserMask" | "text" | "shape";

export type ShapeKind = "rect" | "ellipse" | "line" | "triangle";

export type BoardPoint = { x: number; y: number };

export const PEN_COLORS = [
  "#1a1a1a",
  "#b85c38",
  "#2f5d50",
  "#0e80d5",
  "#c45c5c",
  "#6b5b95",
] as const;

export const PEN_WEIGHTS = [1.5, 2.5, 4, 6] as const;

export const ERASER_SIZES = [8, 14, 22, 32] as const;

export const DEFAULT_PEN_WEIGHT = 2.5;
export const DEFAULT_ERASER_SIZE = 14;
export const DEFAULT_TEXT_WIDTH = 180;
export const DEFAULT_TEXT_FONT_SIZE = 16;

export type PenElement = {
  id: string;
  tool: "pen";
  author: BoardAuthor;
  points: BoardPoint[];
  color: string;
  strokeWidth: number;
};

/** @deprecated Legacy paint-mask eraser; ignored by toRenderList. */
export type EraserMaskElement = {
  id: string;
  tool: "eraserMask";
  author: BoardAuthor;
  points: BoardPoint[];
};

export type TextElement = {
  id: string;
  tool: "text";
  author: BoardAuthor;
  x: number;
  y: number;
  source: string;
  color: string;
  width: number;
  fontSize: number;
  /** True when KaTeX failed and the UI shows plain source instead. */
  degraded?: boolean;
};

export type ShapeElement = {
  id: string;
  tool: "shape";
  shape: ShapeKind;
  author: BoardAuthor;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  strokeWidth: number;
};

export type BoardElement =
  | PenElement
  | EraserMaskElement
  | TextElement
  | ShapeElement;

export type BoardPenTurn = {
  kind: "board-pen";
  element: Omit<PenElement, "tool" | "color" | "strokeWidth"> & {
    tool?: "pen";
    color?: string;
    strokeWidth?: number;
  };
};

export type BoardShapeTurn = {
  kind: "board-shape";
  element: Omit<ShapeElement, "tool" | "color" | "strokeWidth"> & {
    tool?: "shape";
    color?: string;
    strokeWidth?: number;
  };
};

export type BoardEraserTurn = {
  kind: "board-eraser";
  /** Whole drawable element ids removed by stroke/shape-based erasure. */
  elementIds: string[];
};

export type BoardTextTurn = {
  kind: "board-text";
  element: Omit<TextElement, "tool" | "color" | "width" | "fontSize"> & {
    tool?: "text";
    color?: string;
    width?: number;
    fontSize?: number;
  };
};

export type BoardRemoveTurn = {
  kind: "board-remove";
  elementId: string;
};

/** Reposition / resize a text element. */
export type BoardTextMoveTurn = {
  kind: "board-text-move";
  elementId: string;
  x: number;
  y: number;
  width?: number;
  fontSize?: number;
};

/** Translate a pen stroke by dx/dy (selection drag). */
export type BoardPenMoveTurn = {
  kind: "board-pen-move";
  elementId: string;
  dx: number;
  dy: number;
};

/** Reposition / resize a shape (selection drag or create adjust). */
export type BoardShapeMoveTurn = {
  kind: "board-shape-move";
  elementId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BoardTurn =
  | BoardPenTurn
  | BoardShapeTurn
  | BoardEraserTurn
  | BoardTextTurn
  | BoardRemoveTurn
  | BoardTextMoveTurn
  | BoardPenMoveTurn
  | BoardShapeMoveTurn;

export type BoardElementEvent = {
  type: "board.element";
  element: BoardElement;
};

export type BoardRemoveEvent = {
  type: "board.remove";
  elementId: string;
};

export type BoardTextMoveEvent = {
  type: "board.text-move";
  elementId: string;
  x: number;
  y: number;
  width?: number;
  fontSize?: number;
};

export type BoardPenMoveEvent = {
  type: "board.pen-move";
  elementId: string;
  dx: number;
  dy: number;
};

export type BoardShapeMoveEvent = {
  type: "board.shape-move";
  elementId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BoardSseEvent =
  | BoardElementEvent
  | BoardRemoveEvent
  | BoardTextMoveEvent
  | BoardPenMoveEvent
  | BoardShapeMoveEvent;

export const AUTHOR_COLORS: Record<BoardAuthor, string> = {
  student: "#1a1a1a",
  tutor: "#b85c38",
};

export function colorForAuthor(author: BoardAuthor): string {
  return AUTHOR_COLORS[author];
}
