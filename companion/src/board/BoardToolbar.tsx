"use client";

import {
  useCallback,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { BoardTool, ShapeKind } from "@/contracts/board";
import {
  ERASER_SIZES,
  PEN_COLORS,
  PEN_WEIGHTS,
} from "@/contracts/board";

const TOOLS: { id: BoardTool; label: string }[] = [
  { id: "select", label: "Select" },
  { id: "pen", label: "Pen" },
  { id: "eraserMask", label: "Eraser" },
  { id: "text", label: "Text" },
  { id: "shape", label: "Shape" },
];

const SHAPES: { id: ShapeKind; label: string }[] = [
  { id: "rect", label: "Rect" },
  { id: "ellipse", label: "Oval" },
  { id: "line", label: "Line" },
  { id: "triangle", label: "Tri" },
];

type BoardToolbarProps = {
  tool: BoardTool;
  onToolChange: (tool: BoardTool) => void;
  penColor: string;
  onPenColorChange: (color: string) => void;
  penWeight: number;
  onPenWeightChange: (weight: number) => void;
  eraserSize: number;
  onEraserSizeChange: (size: number) => void;
  shapeKind: ShapeKind;
  onShapeKindChange: (shape: ShapeKind) => void;
  showTutorInject?: boolean;
  onTutorInject?: () => void;
  /** Debug: link to the in-server capture/context inspector, opened in the same pane. */
  inspectHref?: string;
};

export function BoardToolbar({
  tool,
  onToolChange,
  penColor,
  onPenColorChange,
  penWeight,
  onPenWeightChange,
  eraserSize,
  onEraserSizeChange,
  shapeKind,
  onShapeKindChange,
  showTutorInject = false,
  onTutorInject,
  inspectHref,
}: BoardToolbarProps) {
  const selectedIndex = Math.max(
    0,
    TOOLS.findIndex((t) => t.id === tool),
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      let next = selectedIndex;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        next = (selectedIndex + 1) % TOOLS.length;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        next = (selectedIndex - 1 + TOOLS.length) % TOOLS.length;
      } else if (e.key === "Home") {
        e.preventDefault();
        next = 0;
      } else if (e.key === "End") {
        e.preventDefault();
        next = TOOLS.length - 1;
      } else {
        return;
      }
      onToolChange(TOOLS[next].id);
    },
    [onToolChange, selectedIndex],
  );

  const showInkOptions = tool === "pen" || tool === "shape" || tool === "text";
  const showEraserOptions = tool === "eraserMask";
  const showShapeOptions = tool === "shape";

  return (
    <header className="board-toolbar">
      <div className="board-brand">
        <span className="board-brand-name">Circlr</span>
        <span className="board-brand-sub">Board</span>
      </div>

      <div
        role="radiogroup"
        aria-label="Board tools"
        className="board-tools"
        onKeyDown={onKeyDown}
      >
        {TOOLS.map((t) => {
          const selected = tool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              className={selected ? "board-tool is-active" : "board-tool"}
              onClick={() => onToolChange(t.id)}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {showInkOptions ? (
        <div className="board-options" aria-label="Ink options">
          <div
            role="radiogroup"
            aria-label="Pen color"
            className="board-color-row"
          >
            {PEN_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={penColor === c}
                aria-label={`Color ${c}`}
                className={
                  penColor === c
                    ? "board-color-swatch is-active"
                    : "board-color-swatch"
                }
                style={{ background: c }}
                onClick={() => onPenColorChange(c)}
              />
            ))}
          </div>
          {(tool === "pen" || tool === "shape") && (
            <div
              role="radiogroup"
              aria-label="Stroke weight"
              className="board-weight-row"
            >
              {PEN_WEIGHTS.map((w) => (
                <button
                  key={w}
                  type="button"
                  role="radio"
                  aria-checked={penWeight === w}
                  aria-label={`Weight ${w}`}
                  className={
                    penWeight === w
                      ? "board-weight is-active"
                      : "board-weight"
                  }
                  onClick={() => onPenWeightChange(w)}
                >
                  <span
                    className="board-weight-dot"
                    style={{
                      width: w * 2.2,
                      height: w * 2.2,
                      background: penColor,
                    }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {showEraserOptions ? (
        <div
          role="radiogroup"
          aria-label="Eraser size"
          className="board-eraser-sizes"
        >
          {ERASER_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={eraserSize === s}
              aria-label={`Eraser ${s}`}
              className={
                eraserSize === s
                  ? "board-eraser-size is-active"
                  : "board-eraser-size"
              }
              onClick={() => onEraserSizeChange(s)}
            >
              <span
                className="board-eraser-size-dot"
                style={{ width: s * 0.55, height: s * 0.55 }}
              />
            </button>
          ))}
        </div>
      ) : null}

      {showShapeOptions ? (
        <div
          role="radiogroup"
          aria-label="Shape kind"
          className="board-shape-row"
        >
          {SHAPES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={shapeKind === s.id}
              className={
                shapeKind === s.id ? "board-tool is-active" : "board-tool"
              }
              onClick={() => onShapeKindChange(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="board-legend">
        <span className="board-swatch student" aria-hidden="true" />
        <span>You</span>
        <span className="board-swatch tutor" aria-hidden="true" />
        <span>Tutor</span>
      </div>

      {inspectHref ? (
        <a className="board-inspect-link" href={inspectHref}>
          Inspect
        </a>
      ) : null}

      {showTutorInject && onTutorInject ? (
        <button
          type="button"
          className="board-dev-inject"
          onClick={onTutorInject}
        >
          Inject Tutor mark
        </button>
      ) : null}
    </header>
  );
}
