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
import { findElementAtPoint, findPenStrokesNearPoints } from "@/board/hitTest";
import { toRenderList } from "@/board/model";
import type {
  BoardElement,
  BoardPoint,
  BoardTool,
  ShapeKind,
  TextElement,
} from "@/contracts/board";
import { BOARD_VIEWBOX } from "@/contracts/board";

type BoardSurfaceProps = {
  elements: readonly BoardElement[];
  tool: BoardTool;
  penColor: string;
  penWeight: number;
  eraserSize: number;
  shapeKind: ShapeKind;
  selectedId: string | null;
  onSelectedIdChange: (id: string | null) => void;
  livePoints: BoardPoint[] | null;
  onLivePointsChange: (points: BoardPoint[] | null) => void;
  onStrokeCommit: (points: BoardPoint[]) => void;
  onShapeCommit: (draft: {
    x: number;
    y: number;
    width: number;
    height: number;
    shape: ShapeKind;
  }) => void;
  onEraseStrokes: (elementIds: string[]) => void;
  onTextCommit: (x: number, y: number, source: string) => void;
  onTextRemove: (elementId: string) => void;
  onTextMove: (
    elementId: string,
    x: number,
    y: number,
    width?: number,
    fontSize?: number,
  ) => void;
  onPenMove: (elementId: string, dx: number, dy: number) => void;
  onShapeMove: (
    elementId: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void;
};

type DraftText = { x: number; y: number; value: string };

type TextDrag = {
  mode: "move" | "resize";
  id: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  grabOffsetX: number;
  grabOffsetY: number;
  originX: number;
  originY: number;
  originWidth: number;
  originFontSize: number;
  startClientX: number;
  startClientY: number;
  moved: boolean;
};

type SelectDrag = {
  id: string;
  kind: "pen" | "shape" | "text";
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  origin: BoardElement;
};

type ShapeDraft = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

function pointsToPath(points: readonly BoardPoint[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  let d = `M ${first.x} ${first.y}`;
  for (const p of rest) d += ` L ${p.x} ${p.y}`;
  return d;
}

function boardPercent(x: number, y: number) {
  return {
    left: `${(x / BOARD_VIEWBOX.width) * 100}%`,
    top: `${(y / BOARD_VIEWBOX.height) * 100}%`,
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function normalizeShapeRect(d: ShapeDraft) {
  const x = Math.min(d.x0, d.x1);
  const y = Math.min(d.y0, d.y1);
  const width = Math.abs(d.x1 - d.x0);
  const height = Math.abs(d.y1 - d.y0);
  return { x, y, width, height };
}

function ShapePreview({
  draft,
  kind,
  color,
  weight,
}: {
  draft: ShapeDraft;
  kind: ShapeKind;
  color: string;
  weight: number;
}) {
  const { x, y, width, height } = normalizeShapeRect(draft);
  const common = {
    stroke: color,
    strokeWidth: weight,
    fill: "none" as const,
  };
  if (kind === "ellipse") {
    return (
      <ellipse
        cx={x + width / 2}
        cy={y + height / 2}
        rx={Math.max(width / 2, 0.5)}
        ry={Math.max(height / 2, 0.5)}
        {...common}
        opacity={0.85}
      />
    );
  }
  if (kind === "line") {
    return (
      <line
        x1={draft.x0}
        y1={draft.y0}
        x2={draft.x1}
        y2={draft.y1}
        {...common}
        opacity={0.85}
      />
    );
  }
  if (kind === "triangle") {
    const points = `${x + width / 2},${y} ${x + width},${y + height} ${x},${y + height}`;
    return <polygon points={points} {...common} opacity={0.85} />;
  }
  return <rect x={x} y={y} width={width} height={height} {...common} opacity={0.85} />;
}

function renderShape(el: Extract<BoardElement, { tool: "shape" }>) {
  const common = {
    stroke: el.color,
    strokeWidth: el.strokeWidth,
    fill: "none" as const,
  };
  if (el.shape === "ellipse") {
    return (
      <ellipse
        key={el.id}
        cx={el.x + el.width / 2}
        cy={el.y + el.height / 2}
        rx={Math.max(Math.abs(el.width) / 2, 0.5)}
        ry={Math.max(Math.abs(el.height) / 2, 0.5)}
        {...common}
        data-author={el.author}
      />
    );
  }
  if (el.shape === "line") {
    return (
      <line
        key={el.id}
        x1={el.x}
        y1={el.y}
        x2={el.x + el.width}
        y2={el.y + el.height}
        {...common}
        data-author={el.author}
      />
    );
  }
  if (el.shape === "triangle") {
    const x = Math.min(el.x, el.x + el.width);
    const y = Math.min(el.y, el.y + el.height);
    const w = Math.abs(el.width);
    const h = Math.abs(el.height);
    const points = `${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}`;
    return (
      <polygon
        key={el.id}
        points={points}
        {...common}
        data-author={el.author}
      />
    );
  }
  return (
    <rect
      key={el.id}
      x={Math.min(el.x, el.x + el.width)}
      y={Math.min(el.y, el.y + el.height)}
      width={Math.abs(el.width)}
      height={Math.abs(el.height)}
      {...common}
      data-author={el.author}
    />
  );
}

export function BoardSurface({
  elements,
  tool,
  penColor,
  penWeight,
  eraserSize,
  shapeKind,
  selectedId,
  onSelectedIdChange,
  livePoints,
  onLivePointsChange,
  onStrokeCommit,
  onShapeCommit,
  onEraseStrokes,
  onTextCommit,
  onTextRemove,
  onTextMove,
  onPenMove,
  onShapeMove,
}: BoardSurfaceProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef(false);
  const pointsRef = useRef<BoardPoint[]>([]);
  const draftDoneRef = useRef(false);
  const draftRef = useRef<DraftText | null>(null);
  const textDragRef = useRef<TextDrag | null>(null);
  const selectDragRef = useRef<SelectDrag | null>(null);
  const elementsRef = useRef(elements);
  const erasedThisGestureRef = useRef(new Set<string>());
  const gestureIsEraserRef = useRef(false);
  const [draftText, setDraftText] = useState<DraftText | null>(null);
  const [textDrag, setTextDrag] = useState<TextDrag | null>(null);
  const [eraserTip, setEraserTip] = useState<BoardPoint | null>(null);
  const [shapeDraft, setShapeDraft] = useState<ShapeDraft | null>(null);

  useLayoutEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  useLayoutEffect(() => {
    draftRef.current = draftText;
  }, [draftText]);

  useLayoutEffect(() => {
    textDragRef.current = textDrag;
  }, [textDrag]);

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

  const eraseAtPoint = useCallback(
    (pt: BoardPoint) => {
      const hits = findPenStrokesNearPoints(
        elementsRef.current,
        [pt],
        eraserSize,
      ).filter((id) => !erasedThisGestureRef.current.has(id));
      if (hits.length === 0) return;
      for (const id of hits) erasedThisGestureRef.current.add(id);
      onEraseStrokes(hits);
    },
    [eraserSize, onEraseStrokes],
  );

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
    if (draftText) inputRef.current?.focus();
  }, [draftText]);

  const endTextDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const current = textDragRef.current;
      if (!current) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* */
      }
      textDragRef.current = null;
      setTextDrag(null);
      if (current.moved) {
        onTextMove(
          current.id,
          current.x,
          current.y,
          current.width,
          current.fontSize,
        );
      }
    },
    [onTextMove],
  );

  const onTextPointerDown = (
    e: ReactPointerEvent<HTMLElement>,
    el: TextElement,
    mode: "move" | "resize",
  ) => {
    if ((e.target as HTMLElement).closest(".board-text-close")) return;
    e.stopPropagation();
    e.preventDefault();
    if (tool === "select") onSelectedIdChange(el.id);
    const pointer = clientToBoard(e.clientX, e.clientY);
    const next: TextDrag = {
      mode,
      id: el.id,
      x: el.x,
      y: el.y,
      width: el.width,
      fontSize: el.fontSize,
      grabOffsetX: pointer.x - el.x,
      grabOffsetY: pointer.y - el.y,
      originX: el.x,
      originY: el.y,
      originWidth: el.width,
      originFontSize: el.fontSize,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
    };
    textDragRef.current = next;
    setTextDrag(next);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onTextPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const current = textDragRef.current;
    if (!current) return;
    // Allow move/resize handlers from chip or resize handle.
    if (
      current.id !== e.currentTarget.dataset.textId &&
      !(e.currentTarget as HTMLElement).closest(`[data-text-id="${current.id}"]`)
    ) {
      return;
    }
    if (current.mode === "resize") {
      const dx = e.clientX - current.startClientX;
      const dy = e.clientY - current.startClientY;
      const width = clamp(current.originWidth + dx * 1.2, 80, 420);
      const fontSize = clamp(current.originFontSize + dy * 0.15, 12, 36);
      const next = { ...current, width, fontSize, moved: true };
      textDragRef.current = next;
      setTextDrag(next);
      return;
    }
    const pointer = clientToBoard(e.clientX, e.clientY);
    const x = clamp(pointer.x - current.grabOffsetX, 0, BOARD_VIEWBOX.width - 24);
    const y = clamp(pointer.y - current.grabOffsetY, 0, BOARD_VIEWBOX.height - 24);
    const next = {
      ...current,
      x,
      y,
      moved:
        current.moved ||
        Math.hypot(x - current.originX, y - current.originY) > 2,
    };
    textDragRef.current = next;
    setTextDrag(next);
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (tool === "text") {
      e.preventDefault();
      const { x, y } = clientToBoard(e.clientX, e.clientY);
      draftDoneRef.current = false;
      setDraftText({ x, y, value: "" });
      return;
    }

    const pt = clientToBoard(e.clientX, e.clientY);
    drawingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);

    if (tool === "select") {
      const hit = findElementAtPoint(elementsRef.current, pt);
      onSelectedIdChange(hit?.id ?? null);
      if (hit && hit.tool !== "eraserMask") {
        selectDragRef.current = {
          id: hit.id,
          kind: hit.tool,
          startX: pt.x,
          startY: pt.y,
          lastX: pt.x,
          lastY: pt.y,
          origin: hit,
        };
      }
      return;
    }

    if (tool === "eraserMask") {
      gestureIsEraserRef.current = true;
      erasedThisGestureRef.current = new Set();
      setEraserTip(pt);
      eraseAtPoint(pt);
      return;
    }

    if (tool === "shape") {
      setShapeDraft({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
      return;
    }

    gestureIsEraserRef.current = false;
    pointsRef.current = [pt];
    onLivePointsChange([pt]);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawingRef.current) return;
    const pt = clientToBoard(e.clientX, e.clientY);

    if (tool === "select" && selectDragRef.current) {
      selectDragRef.current.lastX = pt.x;
      selectDragRef.current.lastY = pt.y;
      return;
    }

    if (gestureIsEraserRef.current) {
      setEraserTip(pt);
      eraseAtPoint(pt);
      return;
    }

    if (tool === "shape" && shapeDraft) {
      setShapeDraft({ ...shapeDraft, x1: pt.x, y1: pt.y });
      return;
    }

    if (tool === "pen") {
      pointsRef.current = [...pointsRef.current, pt];
      onLivePointsChange(pointsRef.current);
    }
  };

  const endStroke = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }

    if (tool === "select" && selectDragRef.current) {
      const drag = selectDragRef.current;
      const pt = clientToBoard(e.clientX, e.clientY);
      const dx = pt.x - drag.startX;
      const dy = pt.y - drag.startY;
      selectDragRef.current = null;
      if (Math.hypot(dx, dy) < 2) return;
      if (drag.kind === "pen") onPenMove(drag.id, dx, dy);
      else if (drag.kind === "shape" && drag.origin.tool === "shape") {
        onShapeMove(
          drag.id,
          drag.origin.x + dx,
          drag.origin.y + dy,
          drag.origin.width,
          drag.origin.height,
        );
      } else if (drag.kind === "text" && drag.origin.tool === "text") {
        onTextMove(drag.id, drag.origin.x + dx, drag.origin.y + dy);
      }
      return;
    }

    if (gestureIsEraserRef.current) {
      gestureIsEraserRef.current = false;
      setEraserTip(null);
      erasedThisGestureRef.current = new Set();
      return;
    }

    if (tool === "shape" && shapeDraft) {
      const norm = normalizeShapeRect(shapeDraft);
      setShapeDraft(null);
      onShapeCommit({ ...norm, shape: shapeKind });
      return;
    }

    const points = pointsRef.current;
    pointsRef.current = [];
    onLivePointsChange(null);
    if (tool === "pen" && points.length >= 2) onStrokeCommit(points);
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
  const renderElements = toRenderList(elements);

  const surfaceClass =
    tool === "text"
      ? "board-surface is-text-tool"
      : tool === "eraserMask"
        ? "board-surface is-eraser-tool"
        : tool === "select"
          ? "board-surface is-select-tool"
          : "board-surface";

  return (
    <div className="board-surface-wrap">
      <svg
        ref={svgRef}
        className={surfaceClass}
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

        {renderElements.map((el) => {
          if (el.tool === "pen") {
            const d = pointsToPath(el.points);
            if (!d) return null;
            return (
              <path
                key={el.id}
                d={d}
                stroke={el.color}
                strokeWidth={el.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                data-author={el.author}
                className={selectedId === el.id ? "is-selected" : undefined}
              />
            );
          }
          if (el.tool === "shape") {
            return (
              <g
                key={el.id}
                className={selectedId === el.id ? "is-selected" : undefined}
              >
                {renderShape(el)}
              </g>
            );
          }
          return null;
        })}

        {livePoints && livePoints.length > 0 && tool === "pen" ? (
          <path
            d={pointsToPath(livePoints)}
            stroke={penColor}
            strokeWidth={penWeight}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={0.9}
          />
        ) : null}

        {shapeDraft ? (
          <ShapePreview
            draft={shapeDraft}
            kind={shapeKind}
            color={penColor}
            weight={penWeight}
          />
        ) : null}

        {eraserTip ? (
          <circle
            className="board-eraser-tip"
            cx={eraserTip.x}
            cy={eraserTip.y}
            r={eraserSize}
          />
        ) : null}
      </svg>

      <div className="board-grid-overlay" aria-hidden="true" />

      <div className="board-coord-plane">
        {textElements.map((el) => {
          const pos =
            textDrag?.id === el.id
              ? {
                  x: textDrag.x,
                  y: textDrag.y,
                  width: textDrag.width,
                  fontSize: textDrag.fontSize,
                }
              : {
                  x: el.x,
                  y: el.y,
                  width: el.width,
                  fontSize: el.fontSize,
                };
          const selected = selectedId === el.id;
          return (
            <div
              key={el.id}
              data-text-id={el.id}
              className={
                textDrag?.id === el.id
                  ? "board-text-chip is-dragging"
                  : selected
                    ? "board-text-chip is-selected"
                    : "board-text-chip"
              }
              style={{
                ...boardPercent(pos.x, pos.y),
                width: pos.width,
                fontSize: pos.fontSize,
              }}
              data-author={el.author}
              onPointerDown={(e) => onTextPointerDown(e, el, "move")}
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
              <div className="board-text-body">
                <KatexText element={{ ...el, fontSize: pos.fontSize }} />
              </div>
              <button
                type="button"
                className="board-text-resize"
                aria-label="Resize text"
                onPointerDown={(e) => onTextPointerDown(e, el, "resize")}
              />
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
