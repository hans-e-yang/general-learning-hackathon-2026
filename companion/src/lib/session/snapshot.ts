import type { SessionSnapshot } from "@/lib/contracts";
import type { SessionState } from "./types";

export function buildSnapshot(s: SessionState): SessionSnapshot {
  return {
    uuid: s.uuid,
    mode: s.mode,
    captures: s.captures.map((c) => ({
      pageIndex: c.pageIndex,
      hash: c.hash,
      timestamp: c.timestamp,
    })),
    worksheet: s.worksheet,
    drafts: { ...s.drafts },
    ghostSummary: s.ghostSummary.map((g) => ({ ...g })),
    exportReady: s.exportReady,
  };
}
