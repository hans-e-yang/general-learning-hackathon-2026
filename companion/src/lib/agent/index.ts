import { fakeAdapter } from "./fake-adapter";
import { opencodeAdapter } from "./opencode-adapter";
import type { LLMAdapter } from "./llm-adapter";

export function getAdapter(): LLMAdapter {
  const choice = process.env.CIRCLR_LLM ?? "fake";
  switch (choice) {
    case "fake":
      return fakeAdapter;
    case "opencode":
      return opencodeAdapter;
    case "real":
      throw new Error(
        "CIRCLR_LLM=real is not wired yet. Re-point at a vendor adapter in src/lib/agent/."
      );
    default:
      throw new Error(`Unknown CIRCLR_LLM value: ${choice}`);
  }
}

export { fakeAdapter } from "./fake-adapter";
export { opencodeAdapter, OpenCodeAdapter } from "./opencode-adapter";
export { configureAgentLoop, processTurn, extractFromCapture, triageOnCapture, assessAllDrafts, assessDraft, watchOnCapture } from "./loop";
export type { LLMAdapter, ScoutInput, ScoutVerdict, TriageInput, TriageVerdict, TutorInput, ExtractInput, ExtractedQuestion, WatchInput, WatchVerdict } from "./llm-adapter";
