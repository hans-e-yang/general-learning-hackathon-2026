"use client";

import { useMemo } from "react";
import { renderMathText } from "@/board/mathText";
import type { TextElement } from "@/contracts/board";

type KatexTextProps = {
  element: TextElement;
};

export function KatexText({ element }: KatexTextProps) {
  const rendered = useMemo(
    () => renderMathText(element.source),
    [element.source],
  );

  const degraded =
    element.degraded === true ||
    (rendered.kind === "plain" && rendered.degraded === true);

  const style = {
    color: element.color,
    fontSize: `${element.fontSize}px`,
  };

  if (rendered.kind === "html" && !degraded) {
    return (
      <span
        className="board-katex"
        style={style}
        data-author={element.author}
        dangerouslySetInnerHTML={{ __html: rendered.html }}
      />
    );
  }

  return (
    <span
      className={degraded ? "board-text is-degraded" : "board-text"}
      style={style}
      data-author={element.author}
      data-degraded={degraded ? "true" : undefined}
    >
      {element.source}
    </span>
  );
}
