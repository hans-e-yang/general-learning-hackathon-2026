"use client";

import {
  useCallback,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { BoardTool } from "@/contracts/board";

const TOOLS: { id: BoardTool; label: string }[] = [
  { id: "pen", label: "Pen" },
  { id: "eraserMask", label: "Eraser" },
  { id: "text", label: "Text" },
];

type BoardToolbarProps = {
  tool: BoardTool;
  onToolChange: (tool: BoardTool) => void;
  showTutorInject?: boolean;
  onTutorInject?: () => void;
};

export function BoardToolbar({
  tool,
  onToolChange,
  showTutorInject = false,
  onTutorInject,
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

      <div className="board-legend">
        <span className="board-swatch student" aria-hidden="true" />
        <span>You</span>
        <span className="board-swatch tutor" aria-hidden="true" />
        <span>Tutor</span>
      </div>

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
