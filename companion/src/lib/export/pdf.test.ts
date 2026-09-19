import { describe, expect, it } from "vitest";
import { generateExport } from "./pdf";
import type { ExportInput } from "./pdf";

const SAMPLE: ExportInput = {
  uuid: "11111111-1111-4111-8111-111111111111",
  mode: "assignment",
  generatedAt: Date.UTC(2026, 0, 15, 12, 0, 0),
  blocks: [
    {
      question: {
        id: "q-p0-0",
        index: 0,
        text: "Compute the limit as x approaches 0 of sin(x)/x.",
        label: "1",
        status: "on-track",
      },
      draft:
        "By definition, sin(x)/x ~ 1 for small x, therefore the limit is 1.",
      turns: [
        { questionId: "q-p0-0", hint: "What assumption are you making here?", level: 1, escalation: "down" },
      ],
    },
    {
      question: {
        id: "q-p0-1",
        index: 1,
        text: "Define continuity at a point.",
        label: "2",
        status: "blocked",
      },
      draft: "",
      turns: [],
    },
  ],
};

function bytesContain(buf: Buffer, needle: string | Buffer): boolean {
  if (typeof needle === "string") {
    return buf.includes(Buffer.from(needle, "binary"));
  }
  return buf.includes(needle);
}

describe("generateExport (#17)", () => {
  function asBuf(buf: ArrayBuffer): Buffer {
    return Buffer.from(new Uint8Array(buf));
  }

  it("starts with a PDF header", async () => {
    const { buffer } = await generateExport(SAMPLE);
    expect(asBuf(buffer).subarray(0, 4).toString("binary")).toBe("%PDF");
  });

  it("ends with the standard PDF EOF marker", async () => {
    const { buffer } = await generateExport(SAMPLE);
    const tail = asBuf(buffer).subarray(Math.max(0, buffer.byteLength - 32));
    expect(tail.toString("binary")).toContain("%%EOF");
  });

  it("renders one cover page + one page per question", async () => {
    const { pageCount } = await generateExport(SAMPLE);
    expect(pageCount).toBe(3);
  });

  it("returns a single-page 'no questions' PDF when the worksheet is empty", async () => {
    const { pageCount } = await generateExport({ ...SAMPLE, blocks: [] });
    expect(pageCount).toBe(1);
  });

  it("default-compress produces a smaller file than uncompressed", async () => {
    const c = await generateExport(SAMPLE, { compress: true });
    const u = await generateExport(SAMPLE, { compress: false });
    expect(c.buffer.byteLength).toBeLessThan(u.buffer.byteLength);
  });
});
