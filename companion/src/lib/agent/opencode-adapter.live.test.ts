import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ExtractedQuestionSchema,
  TriageVerdictSchema,
  TutorTurnSchema,
  WatchVerdictSchema,
} from "@/lib/contracts";
import { OpenCodeAdapter } from "./opencode-adapter";

function loadDotEnv(): void {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key]) continue;
    let value = raw;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnv();

const LIVE = process.env.CIRCLR_LLM_TEST_LIVE === "1" && Boolean(process.env.OPENCODE_API);
const TIMEOUT = 90_000;

const TINY_JPEG =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

const HASH = "feedfacec0ffee01";

describe.skipIf(!LIVE)("opencode-adapter live (OpenCode Go)", () => {
  let adapter: OpenCodeAdapter;

  beforeAll(() => {
    adapter = new OpenCodeAdapter({});
  });

  it(
    "extract returns contract-valid questions for a capture image",
    async () => {
      const questions = await adapter.extract({
        captureHash: HASH,
        pageIndex: 0,
        image: TINY_JPEG,
      });
      expect(Array.isArray(questions)).toBe(true);
      questions.forEach((q, i) => {
        expect(() => ExtractedQuestionSchema.parse(q)).not.toThrow();
        expect(q.id).toBe(`q-p0-${i}`);
        expect(q.index).toBe(i);
      });
    },
    TIMEOUT
  );

  it(
    "scout returns a valid status for a reasoning-shaped draft",
    async () => {
      const verdict = await adapter.scout({
        captureHash: HASH,
        pageIndex: 0,
        questionText: "Solve x + 1 = 3 for x.",
        draftText: "I will subtract 1 from both sides, therefore x equals 2.",
      });
      expect(["blocked", "on-track", "solid"]).toContain(verdict.status);
      expect(verdict.reasoning.length).toBeGreaterThan(0);
      expect(typeof verdict.escalate).toBe("boolean");
    },
    TIMEOUT
  );

  it(
    "triage returns a contract-valid context-update verdict for a capture image",
    async () => {
      const verdict = await adapter.triage({
        captureHash: HASH,
        pageIndex: 0,
        image: TINY_JPEG,
        contextSummary: "questions=0; captures=0; text=",
      });
      expect(() => TriageVerdictSchema.parse(verdict)).not.toThrow();
      expect(typeof verdict.update).toBe("boolean");
      expect(verdict.reason.length).toBeGreaterThan(0);
    },
    TIMEOUT
  );

  it(
    "tutor returns a contract-valid, non-final-answer turn",
    async () => {
      const turn = await adapter.tutor({
        questionId: "q-p0-0",
        questionText: "Solve x + 1 = 3 for x.",
        draftText: "",
        threadHistory: [],
        currentLevel: 0,
      });
      expect(() => TutorTurnSchema.parse(turn)).not.toThrow();
      expect(turn.questionId).toBe("q-p0-0");
      expect(turn.level).toBeGreaterThanOrEqual(0);
      expect(turn.level).toBeLessThanOrEqual(3);
      expect(turn.hint).not.toMatch(/^\s*the answer is\b/i);
      expect(turn.hint.toLowerCase()).not.toContain("final answer");
    },
    TIMEOUT
  );

  it(
    "watch returns a contract-valid verdict for a capture image",
    async () => {
      const verdict = await adapter.watch({
        captureHash: HASH,
        pageIndex: 0,
        questionText: "Solve x + 1 = 3 for x.",
        image: TINY_JPEG,
      });
      expect(() => WatchVerdictSchema.parse(verdict)).not.toThrow();
      expect(typeof verdict.flag).toBe("boolean");
      expect(verdict.reasoning.length).toBeGreaterThan(0);
    },
    TIMEOUT
  );

  it(
    "idk returns a level-0 unblock that is never a final answer",
    async () => {
      const turn = await adapter.idk({
        questionId: "q-p0-0",
        questionText: "Solve x + 1 = 3 for x.",
        draftText: "I do not know where to start.",
      });
      expect(() => TutorTurnSchema.parse(turn)).not.toThrow();
      expect(turn.level).toBe(0);
      expect(turn.hint).not.toMatch(/^\s*the answer is\b/i);
      expect(turn.hint.toLowerCase()).not.toContain("final answer");
    },
    TIMEOUT
  );
});
