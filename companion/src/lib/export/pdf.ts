import PDFDocument from "pdfkit";
import type { Readable } from "node:stream";
import type { QuestionBlock, TutorTurn } from "@/lib/contracts";

export interface ExportBlock {
  question: QuestionBlock;
  draft: string;
  turns: TutorTurn[];
}

export interface ExportInput {
  uuid: string;
  blocks: ExportBlock[];
  mode: "assignment" | "review";
  generatedAt: number;
}

export interface ExportResult {
  buffer: ArrayBuffer;
  pageCount: number;
}

export interface ExportOptions {
  compress?: boolean;
}

export async function generateExport(
  input: ExportInput,
  options: ExportOptions = {}
): Promise<ExportResult> {
  const compress = options.compress ?? true;
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 64, bottom: 64, left: 64, right: 64 },
    compress,
    info: {
      Title: `Circlr ${input.mode} session`,
      Author: "Circlr",
      Subject: input.uuid,
    },
  });

  const chunks: Uint8Array[] = [];
  doc.on("data", (chunk: Uint8Array) => {
    chunks.push(new Uint8Array(chunk));
  });
  const finished = new Promise<void>((resolve, reject) => {
    doc.on("end", () => resolve());
    doc.on("error", (err: Error) => reject(err));
  });

  let pageCount = 0;

  doc.fontSize(20).text("Circlr Worksheet", { align: "left" });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("#444").text(`Session: ${input.uuid}`);
  doc.text(`Mode: ${input.mode}`);
  doc.text(`Generated: ${new Date(input.generatedAt).toISOString()}`);
  doc.moveDown(1);
  doc.fillColor("#000");
  pageCount += 1;

  if (input.blocks.length === 0) {
    doc.fontSize(12).text("No questions captured for this session.");
    doc.end();
    await finished;
    return { buffer: mergeChunks(chunks), pageCount };
  }

  for (let i = 0; i < input.blocks.length; i += 1) {
    doc.addPage();
    pageCount += 1;
    renderBlock(doc, i + 1, input.blocks[i]);
  }

  doc.end();
  await finished;
  return { buffer: mergeChunks(chunks), pageCount };
}

function mergeChunks(parts: Uint8Array[]): ArrayBuffer {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const buf = new ArrayBuffer(total);
  const view = new Uint8Array(buf);
  let offset = 0;
  for (const part of parts) {
    view.set(part, offset);
    offset += part.length;
  }
  return buf;
}

function renderBlock(
  doc: InstanceType<typeof PDFDocument>,
  ordinal: number,
  block: ExportBlock
): void {
  const { question, draft, turns } = block;
  doc.fontSize(14).fillColor("#000").text(`Question ${ordinal}`, { underline: false });
  doc.moveDown(0.3);
  doc.fontSize(12).fillColor("#000").text(question.text, { align: "left" });
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor("#666").text(`id: ${question.id}    status: ${question.status}`);
  doc.moveDown(0.6);

  doc.fontSize(11).fillColor("#000").text("Your answer:", { underline: true });
  doc.moveDown(0.3);
  if (draft.trim().length > 0) {
    doc.fontSize(11).fillColor("#000").text(draft, { align: "left" });
  } else {
    doc.fontSize(11).fillColor("#a00").text("[no answer provided]");
  }
  doc.moveDown(0.6);

  if (turns.length > 0) {
    doc.fontSize(11).fillColor("#000").text("Tutor hints:", { underline: true });
    doc.moveDown(0.3);
    for (const t of turns) {
      doc.fontSize(10).fillColor("#000").text(`[level ${t.level}, ${t.escalation}] ${t.hint}`);
      doc.moveDown(0.2);
    }
  }
}

export function preview(input: ExportInput): { pageCount: number; totalChars: number } {
  let totalChars = 0;
  for (const b of input.blocks) {
    totalChars += b.question.text.length + b.draft.length;
    for (const t of b.turns) totalChars += t.hint.length;
  }
  const pageCount = Math.max(1, 1 + Math.max(0, input.blocks.length - 1));
  return { pageCount, totalChars };
}

export type ExportStream = Readable;

export function bufferAsUint8(buf: ArrayBuffer): Uint8Array {
  return new Uint8Array(buf);
}
