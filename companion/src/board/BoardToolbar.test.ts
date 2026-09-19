import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BoardToolbar } from "./BoardToolbar";
import { colorForAuthor, DEFAULT_PEN_WEIGHT, DEFAULT_ERASER_SIZE } from "@/contracts/board";

function render(overrides: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    createElement(BoardToolbar, {
      tool: "pen",
      onToolChange: () => {},
      penColor: colorForAuthor("student"),
      onPenColorChange: () => {},
      penWeight: DEFAULT_PEN_WEIGHT,
      onPenWeightChange: () => {},
      eraserSize: DEFAULT_ERASER_SIZE,
      onEraserSizeChange: () => {},
      shapeKind: "rect",
      onShapeKindChange: () => {},
      ...overrides,
    }),
  );
}

describe("BoardToolbar Download", () => {
  it("disables Download when there is nothing to export", () => {
    const html = render({ onDownload: () => {}, downloadDisabled: true });
    expect(html).toContain("Download");
    expect(html).toMatch(/board-download[^>]*disabled/);
  });

  it("enables Download once a board slot exists", () => {
    const html = render({ onDownload: () => {}, downloadDisabled: false });
    expect(html).toContain("Download");
    expect(html).not.toMatch(/board-download[^>]*disabled/);
  });

  it("shows Exporting… while the PDF is building", () => {
    const html = render({
      onDownload: () => {},
      downloadStatus: "busy",
    });
    expect(html).toContain("Exporting…");
    expect(html).toMatch(/board-download[^>]*disabled/);
  });

  it("shows Couldn’t export after a failed build", () => {
    const html = render({
      onDownload: () => {},
      downloadStatus: "error",
    });
    expect(html).toContain("Couldn’t export");
  });
});
