"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { KatexText } from "@/board/KatexText";
import type {
  BoardElement,
  BoardPoint,
  BoardTool,
  TextElement,
} from "@/contracts/board";
import { BOARD_VIEWBOX, colorForAuthor } from "@/contracts/board";

type BoardSurfaceProps = {
  elements: readonly BoardElement[];
  tool: BoardTool;
  livePoints: BoardPoint[] | null;
  onLivePointsChange: (points: BoardPoint[] | null) => void;
  onStrokeCommit: (
    points: BoardPoint[],
    strokeTool: "pen" | "eraserMask",
  ) => void;
  onTextCommit: (x: number, y: number, source: string) => void;
  onTextRemove: (elementId: string) => void;
  onTextMove: (elementId: string, x: number, y: number) => void;
};

type DraftText = {
  x: number;
  y: number;
  value: string;
};

type DragState = {
  id: string;
  x: number;
  y: number;
  grabOffsetX: number;
  grabOffsetY: number;
  originX: number;
  originY: number;
  moved: boolean;
};

function pointsToPath(points: readonly BoardPoint[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  let d = `M ${first.x} ${first.y}`;
  for (const p of rest) {
    d += ` L ${p.x} ${p.y}`;
  }
  return d;
}

function boardPercent(x: number, y: number) {
  return {
    left: `${(x / BOARD_VIEWBOX.width) * 100}%`,
    top: `${(y / BOARD_VIEWBOX.height) * 100}%`,
  };
}

function clampBoard(x: number, y: number) {
  return {
    x: Math.min(BOARD_VIEWBOX.width - 24, Math.max(0, x)),
    y: Math.min(BOARD_VIEWBOX.height - 24, Math.max(0, y)),
  };
}

export function BoardSurface({
  elements,
  tool,
  livePoints,
  onLivePointsChange,
  onStrokeCommit,
  onTextCommit,
  onTextRemove,
  onTextMove,
}: BoardSurfaceProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef(false);
  const pointsRef = useRef<BoardPoint[]>([]);
  const strokeToolRef = useRef<"pen" | "eraserMask">("pen");
  const draftDoneRef = useRef(false);
  const draftRef = useRef<DraftText | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [liveStrokeTool, setLiveStrokeTool] = useState<"pen" | "eraserMask">(
    "pen",
  );
  const [draftText, setDraftText] = useState<DraftText | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  useLayoutEffect(() => {
    draftRef.current = draftText;
  }, [draftText]);

  useLayoutEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  const clientToBoard = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }, []);

  const endTextDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const current = dragRef.current;
      if (!current) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Already released.
      }
      dragRef.current = null;
      setDrag(null);
      if (
        current.moved &&
        (current.x !== current.originX || current.y !== current.originY)
      ) {
        onTextMove(current.id, current.x, current.y);
      }
    },
    [onTextMove],
  );

  const onTextPointerDown = (
    e: ReactPointerEvent<HTMLDivElement>,
    el: TextElement,
  ) => {
    if ((e.target as HTMLElement).closest(".board-text-close")) return;
    e.stopPropagation();
    e.preventDefault();
    const pointer = clientToBoard(e.clientX, e.clientY);
    const next: DragState = {
      id: el.id,
      x: el.x,
      y: el.y,
      grabOffsetX: pointer.x - el.x,
      grabOffsetY: pointer.y - el.y,
      originX: el.x,
      originY: el.y,
      moved: false,
    };
    dragRef.current = next;
    setDrag(next);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onTextPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const current = dragRef.current;
    if (!current || current.id !== e.currentTarget.dataset.textId) return;
    const pointer = clientToBoard(e.clientX, e.clientY);
    const clamped = clampBoard(
      pointer.x - current.grabOffsetX,
      pointer.y - current.grabOffsetY,
    );
    const next: DragState = {
      ...current,
      x: clamped.x,
      y: clamped.y,
      moved:
        current.moved ||
        Math.hypot(clamped.x - current.originX, clamped.y - current.originY) >
          2,
    };
    dragRef.current = next;
    setDrag(next);
  };
  const finishDraft = useCallback(
    (mode: "commit" | "cancel") => {
      const draft = draftRef.current;
      if (!draft || draftDoneRef.current) return;
      draftDoneRef.current = true;
      setDraftText(null);
      if (mode === "commit" && draft.value.trim()) {
        onTextCommit(draft.x, draft.y, draft.value);
      }
    },
    [onTextCommit],
  );

  useLayoutEffect(() => {
    if (draftText) {
      inputRef.current?.focus();
    }
  }, [draftText]);

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (tool === "text") {
      e.preventDefault();
      const { x, y } = clientToBoard(e.clientX, e.clientY);
      draftDoneRef.current = false;
      setDraftText({ x, y, value: "" });
      return;
    }

    drawingRef.current = true;
    const strokeTool = tool === "eraserMask" ? "eraserMask" : "pen";
    strokeToolRef.current = strokeTool;
    setLiveStrokeTool(strokeTool);
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = clientToBoard(e.clientX, e.clientY);
    pointsRef.current = [pt];
    onLivePointsChange([pt]);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawingRef.current) return;
    const pt = clientToBoard(e.clientX, e.clientY);
    pointsRef.current = [...pointsRef.current, pt];
    onLivePointsChange(pointsRef.current);
  };

  const endStroke = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Already released.
    }
    const points = pointsRef.current;
    const strokeTool = strokeToolRef.current;
    pointsRef.current = [];
    onLivePointsChange(null);
    if (points.length >= 2) {
      onStrokeCommit(points, strokeTool);
    }
  };

  const onDraftKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finishDraft("commit");
    } else if (e.key === "Escape") {
      e.preventDefault();
      finishDraft("cancel");
    }
  };

  const textElements = elements.filter(
    (el): el is TextElement => el.tool === "text",
  );

  return (
    <div className="board-surface-wrap">
      <svg
        ref={svgRef}
        className={
          tool === "text" ? "board-surface is-text-tool" : "board-surface"
        }
        aria-label="Board drawing surface"
        viewBox={`0 0 ${BOARD_VIEWBOX.width} ${BOARD_VIEWBOX.height}`}
        preserveAspectRatio="xMidYMin meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      >
        <rect
          x={0}
          y={0}
          width={BOARD_VIEWBOX.width}
          height={BOARD_VIEWBOX.height}
          fill="transparent"
          pointerEvents="all"
        />

        {elements.map((el) => {
          if (el.tool === "text") return null;
          const d = pointsToPath(el.points);
          if (!d) return null;
          if (el.tool === "eraserMask") {
            return (
              <path
                key={el.id}
                d={d}
                className="board-eraser-stroke"
                stroke="#fffdf8"
                strokeWidth={18}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            );
          }
          return (
            <path
              key={el.id}
              d={d}
              stroke={el.color}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              data-author={el.author}
            >
              <title>
                {el.author === "tutor" ? "Tutor mark" : "Your mark"}
              </title>
            </path>
          );
        })}

        {livePoints && livePoints.length > 0 ? (
          <path
            d={pointsToPath(livePoints)}
            stroke={
              liveStrokeTool === "eraserMask"
                ? "#fffdf8"
                : colorForAuthor("student")
            }
            strokeWidth={liveStrokeTool === "eraserMask" ? 18 : 2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={liveStrokeTool === "eraserMask" ? 0.95 : 0.9}
          />
        ) : null}
      </svg>

      <div className="board-grid-overlay" aria-hidden="true" />

      {/* Same meet geometry as the SVG viewBox — percentages map 1:1 to board coords. */}
      <div className="board-coord-plane">
        {textElements.map((el) => {
          const pos =
            drag?.id === el.id
              ? { x: drag.x, y: drag.y }
              : { x: el.x, y: el.y };
          return (
            <div
              key={el.id}
              data-text-id={el.id}
              className={
                drag?.id === el.id
                  ? "board-text-chip is-dragging"
                  : "board-text-chip"
              }
              style={boardPercent(pos.x, pos.y)}
              data-author={el.author}
              onPointerDown={(e) => onTextPointerDown(e, el)}
              onPointerMove={onTextPointerMove}
              onPointerUp={endTextDrag}
              onPointerCancel={endTextDrag}
            >
              <button
                type="button"
                className="board-text-close"
                aria-label="Remove text"
                onClick={(e) => {
                  e.stopPropagation();
                  onTextRemove(el.id);
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                ×
              </button>
              <KatexText element={el} />
            </div>
          );
        })}

        {draftText ? (
          <label
            className="board-text-draft"
            style={boardPercent(draftText.x, draftText.y)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className="sr-only">Board text</span>
            <input
              ref={inputRef}
              value={draftText.value}
              placeholder={"Text or $\\frac{1}{2}$"}
              onChange={(e) =>
                setDraftText({ ...draftText, value: e.target.value })
              }
              onKeyDown={onDraftKeyDown}
              onBlur={() => finishDraft("commit")}
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}
