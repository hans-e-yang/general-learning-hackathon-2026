"use client";

import type { ReactNode } from "react";

export function BoardCarousel(props: {
  label: string | null;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  empty: boolean;
  children: ReactNode;
}) {
  if (props.empty) {
    return (
      <div className="board-empty" role="status">
        Waiting for questions from the Document…
      </div>
    );
  }
  return (
    <div className="board-carousel">
      <div className="board-carousel-chrome">
        <button
          type="button"
          className="board-slide-nav"
          disabled={!props.canPrev}
          onClick={props.onPrev}
          aria-label="Previous question"
        >
          ‹
        </button>
        <p className="board-soft-title">{props.label}</p>
        <button
          type="button"
          className="board-slide-nav"
          disabled={!props.canNext}
          onClick={props.onNext}
          aria-label="Next question"
        >
          ›
        </button>
      </div>
      {props.children}
    </div>
  );
}
