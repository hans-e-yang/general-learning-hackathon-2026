import { beforeEach, describe, expect, it } from "vitest";
import { clearForTests as clearStore, _seed } from "@/lib/session/store";
import { buildExportBlocks } from "./blocks";
import type { SessionState } from "@/lib/session/types";

function makeSession(partial: Partial<SessionState> = {}): SessionState {
  const state: SessionState = {
    uuid: "11111111-1111-4111-8111-111111111111",
    createdAt: 1_700_000_000_000,
    captures: [],
    recentHashes: [],
    worksheet: [],
    drafts: {},
    threads: {},
    context: [],
    board: [],
    ghostCounts: {},
    ghostSummary: [],
    exportReady: false,
    ...partial,
  };
  _seed(state);
  return state;
}

beforeEach(() => clearStore());

describe("buildExportBlocks (#17)", () => {
  it("returns one block per worksheet question, in worksheet order", () => {
    const state = makeSession({
      worksheet: [
        { id: "q-p0-0", index: 0, text: "First?", status: "on-track" },
        { id: "q-p0-1", index: 1, text: "Second?", status: "blocked" },
      ],
      drafts: { "q-p0-0": "yes", "q-p0-1": "" },
      threads: { "q-p0-0": [{ questionId: "q-p0-0", hint: "ask first", level: 0, escalation: "same" }] },
    });
    const blocks = buildExportBlocks(state);
    expect(blocks.map((b) => b.question.id)).toEqual(["q-p0-0", "q-p0-1"]);
    expect(blocks[0].draft).toBe("yes");
    expect(blocks[1].draft).toBe("");
    expect(blocks[1].turns).toEqual([]);
    expect(blocks[0].turns[0].hint).toBe("ask first");
  });

  it("yields empty drafts as the literal \"[no answer provided]\" marker target", () => {
    const state = makeSession({
      worksheet: [{ id: "q-p0-0", index: 0, text: "Define continuity.", status: "blocked" }],
      drafts: {},
      threads: {},
    });
    const blocks = buildExportBlocks(state);
    expect(blocks[0].draft).toBe("");
  });

  it("respects the worksheet order even if drafts arrive in a different order", () => {
    const state = makeSession({
      worksheet: [
        { id: "qB", index: 0, text: "B?", status: "on-track" },
        { id: "qA", index: 1, text: "A?", status: "blocked" },
      ],
      drafts: { qA: "draft A", qB: "draft B" },
    });
    const blocks = buildExportBlocks(state);
    expect(blocks.map((b) => b.question.id)).toEqual(["qB", "qA"]);
    expect(blocks.map((b) => b.draft)).toEqual(["draft B", "draft A"]);
  });
});
