import type { SessionState } from "@/lib/session/types";
import type { ExportBlock } from "./pdf";

export function buildExportBlocks(state: SessionState): ExportBlock[] {
  return state.worksheet.map((q) => ({
    question: q,
    draft: state.drafts[q.id] ?? "",
    turns: state.threads[q.id] ?? [],
  }));
}
