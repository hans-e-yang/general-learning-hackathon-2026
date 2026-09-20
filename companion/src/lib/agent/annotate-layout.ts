import type {
  BoardAnnotationTurn,
  BoardShapeTurn,
  BoardTextTurn,
} from "@/contracts/board";
import { BOARD_VIEWBOX } from "@/contracts/board";

/** Horizontal breathing room between a ring and its comment. */
const COMMENT_GAP = 18;
const EDGE_PAD = 8;
/** Tutor comments carry a sentence of reasoning, so they get more room. */
const COMMENT_WIDTH = 280;

export type AnnotateCrop = { x: number; y: number; width: number; height: number };

type Rect = AnnotateCrop;

function isFullBoard(crop: AnnotateCrop): boolean {
  return (
    crop.x === 0 &&
    crop.y === 0 &&
    crop.width === BOARD_VIEWBOX.width &&
    crop.height === BOARD_VIEWBOX.height
  );
}

function mapX(x: number, crop: AnnotateCrop): number {
  return crop.x + (x / BOARD_VIEWBOX.width) * crop.width;
}

function mapY(y: number, crop: AnnotateCrop): number {
  return crop.y + (y / BOARD_VIEWBOX.height) * crop.height;
}

/**
 * The idle snapshot stretches student work to fill the 800x1200 JPEG so the
 * vision model can read handwriting and typed math. Map those image-space
 * marks back onto the real board before we park the comment beside the ring.
 */
export function mapAnnotationsFromCrop(
  turns: readonly BoardAnnotationTurn[],
  crop?: AnnotateCrop,
): BoardAnnotationTurn[] {
  if (!crop || isFullBoard(crop)) return [...turns];
  return turns.map((turn): BoardAnnotationTurn => {
    if (turn.kind === "board-shape") {
      return {
        ...turn,
        element: {
          ...turn.element,
          x: mapX(turn.element.x, crop),
          y: mapY(turn.element.y, crop),
          width: (turn.element.width / BOARD_VIEWBOX.width) * crop.width,
          height: (turn.element.height / BOARD_VIEWBOX.height) * crop.height,
        },
      };
    }
    if (turn.kind === "board-text") {
      return {
        ...turn,
        element: {
          ...turn.element,
          x: mapX(turn.element.x, crop),
          y: mapY(turn.element.y, crop),
        },
      };
    }
    return {
      ...turn,
      element: {
        ...turn.element,
        points: turn.element.points.map((p) => ({
          x: mapX(p.x, crop),
          y: mapY(p.y, crop),
        })),
      },
    };
  });
}

function shapeRect(shape: BoardShapeTurn["element"]): Rect {
  return {
    x: Math.min(shape.x, shape.x + shape.width),
    y: Math.min(shape.y, shape.y + shape.height),
    width: Math.abs(shape.width),
    height: Math.abs(shape.height),
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/**
 * The Tutor marks an error by ringing it, then writes a reasoning comment
 * nearby. Models are unreliable at keeping that comment clear of the student's
 * work, so after generation we re-anchor every tutor text to the side of the
 * nearest tutor ring (flipping left near the right edge). Text with no matching
 * ring is left untouched.
 */
export function arrangeAnnotations(
  turns: readonly BoardAnnotationTurn[],
): BoardAnnotationTurn[] {
  const shapes = turns.filter(
    (t): t is BoardShapeTurn => t.kind === "board-shape",
  );
  if (shapes.length === 0) return [...turns];

  const used = new Set<number>();
  return turns.map((turn): BoardAnnotationTurn => {
    if (turn.kind !== "board-text") return turn;
    const width = turn.element.width ?? COMMENT_WIDTH;
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    const textCenterX = turn.element.x + width / 2;
    const textCenterY = turn.element.y + 8;
    shapes.forEach((shape, index) => {
      if (used.has(index)) return;
      const rect = shapeRect(shape.element);
      const distance = Math.hypot(
        textCenterX - (rect.x + rect.width / 2),
        textCenterY - (rect.y + rect.height / 2),
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    if (bestIndex < 0) return turn;
    used.add(bestIndex);

    const rect = shapeRect(shapes[bestIndex]!.element);
    let x = rect.x + rect.width + COMMENT_GAP;
    if (x + width > BOARD_VIEWBOX.width - EDGE_PAD) {
      x = rect.x - width - COMMENT_GAP;
    }
    const y = clamp(
      rect.y + rect.height / 2 - 8,
      EDGE_PAD,
      BOARD_VIEWBOX.height - 48,
    );
    const positioned: BoardTextTurn = {
      ...turn,
      element: {
        ...turn.element,
        x: clamp(x, EDGE_PAD, BOARD_VIEWBOX.width - width - EDGE_PAD),
        y,
        width,
      },
    };
    return positioned;
  });
}
