/**
 * Provisional Board payload freeze surface (feeds issue #10).
 * Lane B / contract freeze should merge from this file — do not fork a rival schema.
 */

export const BOARD_VIEWBOX = { width: 800, height: 1200 } as const;

export type BoardAuthor = "student" | "tutor";
export type BoardTool = "pen" | "eraserMask" | "text";

export type BoardPoint = { x: number; y: number };

export type PenElement = {
  id: string;
  tool: "pen";
  author: BoardAuthor;
  points: BoardPoint[];
  color: string;
};

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
  /** True when KaTeX failed and the UI shows plain source instead. */
  degraded?: boolean;
};

export type BoardElement = PenElement | EraserMaskElement | TextElement;

export type BoardPenTurn = {
  kind: "board-pen";
  element: Omit<PenElement, "tool" | "color"> & {
    tool?: "pen";
    color?: string;
  };
};

export type BoardEraserTurn = {
  kind: "board-eraser";
  element: Omit<EraserMaskElement, "tool"> & { tool?: "eraserMask" };
};

export type BoardTextTurn = {
  kind: "board-text";
  element: Omit<TextElement, "tool" | "color"> & {
    tool?: "text";
    color?: string;
  };
};

/** Remove an element by id (used for text close; strokes stay append-only via eraserMask). */
export type BoardRemoveTurn = {
  kind: "board-remove";
  elementId: string;
};

/** Reposition a text element (drag). */
export type BoardTextMoveTurn = {
  kind: "board-text-move";
  elementId: string;
  x: number;
  y: number;
};

export type BoardTurn =
  | BoardPenTurn
  | BoardEraserTurn
  | BoardTextTurn
  | BoardRemoveTurn
  | BoardTextMoveTurn;

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
};

export type BoardSseEvent =
  | BoardElementEvent
  | BoardRemoveEvent
  | BoardTextMoveEvent;

export const AUTHOR_COLORS: Record<BoardAuthor, string> = {
  student: "#1a1a1a",
  tutor: "#b85c38",
};

export function colorForAuthor(author: BoardAuthor): string {
  return AUTHOR_COLORS[author];
}
