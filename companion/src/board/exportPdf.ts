import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { toRenderList } from "@/board/model";
import type { BoardElement } from "@/contracts/board";

export const BOARD_PDF_MAX_EDGE = 800;
export const BOARD_PDF_HEADER_HEIGHT = 40;

/** Student-authored ink only; Tutor marks and legacy eraser masks stay off the PDF. */
export function studentInk(
  elements: readonly BoardElement[],
): BoardElement[] {
  return toRenderList(elements).filter((el) => el.author === "student");
}

export type BoardPdfPage = {
  label: string;
  jpeg: string | Uint8Array;
};

function jpegBytes(jpeg: string | Uint8Array): Uint8Array {
  if (typeof jpeg !== "string") return jpeg;
  const raw = jpeg.includes(",") ? jpeg.slice(jpeg.indexOf(",") + 1) : jpeg;
  const bin = atob(raw);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export function buildBoardPdfPages(
  questions: { id: string; label: string }[],
  boards: Record<string, BoardElement[]>,
  rasterize: (elements: BoardElement[]) => string,
): BoardPdfPage[] {
  const pages: BoardPdfPage[] = [];
  for (const question of questions) {
    const jpeg = rasterize(studentInk(boards[question.id] ?? []));
    if (!jpeg) {
      throw new Error("Couldn’t export");
    }
    pages.push({ label: question.label, jpeg });
  }
  return pages;
}

export async function buildBoardPdf(input: {
  pages: BoardPdfPage[];
}): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const page of input.pages) {
    const image = await doc.embedJpg(jpegBytes(page.jpeg));
    const maxEdge = Math.max(image.width, image.height) || 1;
    const scale = BOARD_PDF_MAX_EDGE / maxEdge;
    const boardWidth = image.width * scale;
    const boardHeight = image.height * scale;
    const pdfPage = doc.addPage([
      boardWidth,
      boardHeight + BOARD_PDF_HEADER_HEIGHT,
    ]);
    pdfPage.drawRectangle({
      x: 0,
      y: boardHeight,
      width: boardWidth,
      height: BOARD_PDF_HEADER_HEIGHT,
      color: rgb(0.94, 0.94, 0.94),
    });
    pdfPage.drawText(page.label, {
      x: 16,
      y: boardHeight + 13,
      size: 14,
      font,
      color: rgb(0.12, 0.12, 0.12),
    });
    pdfPage.drawImage(image, {
      x: 0,
      y: 0,
      width: boardWidth,
      height: boardHeight,
    });
  }
  const bytes = await doc.save();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: "application/pdf" });
}
