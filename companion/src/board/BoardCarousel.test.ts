import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BoardCarousel } from "./BoardCarousel";

function render(overrides: Record<string, unknown>): string {
  return renderToStaticMarkup(
    createElement(
      BoardCarousel,
      {
        label: "1a",
        canPrev: true,
        canNext: true,
        onPrev: () => {},
        onNext: () => {},
        empty: false,
        ...overrides,
      },
      createElement("div", null, "stage"),
    ),
  );
}

describe("BoardCarousel page delete affordance", () => {
  it("shows an enabled Delete control when a page can be deleted", () => {
    const html = render({ onDelete: () => {}, canDelete: true });
    expect(html).toContain("board-page-delete");
    expect(html).toContain("Delete");
    expect(html).not.toContain("disabled");
  });

  it("disables Delete when no page is deletable", () => {
    const html = render({ onDelete: () => {}, canDelete: false });
    expect(html).toContain("board-page-delete");
    expect(html).toContain("disabled");
  });

  it("disables Delete when no handler is wired", () => {
    const html = render({ canDelete: true });
    expect(html).toContain("disabled");
  });
});
