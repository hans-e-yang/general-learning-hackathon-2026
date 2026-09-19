import { z } from "zod";

const hashSchema = z.string().regex(/^[0-9a-f]{16}$/, "average-hash must be 16 hex chars");
const base64JpegSchema = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      const decoded = Buffer.from(value, "base64");
      const sig = decoded.subarray(0, 3);
      return sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff;
    } catch {
      return false;
    }
  }, "image must be a base64-encoded JPEG (FFD8FF)");

export const ModeSchema = z.enum(["assignment", "review"]);
export type Mode = z.infer<typeof ModeSchema>;

export const MaterialCaptureSchema = z.object({
  pageIndex: z.number().int().nonnegative(),
  scrollRatio: z.number().min(0).max(1),
  timestamp: z.number().int().positive(),
  hash: hashSchema,
  image: base64JpegSchema,
});
export type MaterialCapture = z.infer<typeof MaterialCaptureSchema>;

export const SessionInitRequestSchema = z.object({}).strict();
export type SessionInitRequest = z.infer<typeof SessionInitRequestSchema>;

export const SessionInitResponseSchema = z.object({
  uuid: z.string().uuid(),
  eventsUrl: z.string().url(),
});
export type SessionInitResponse = z.infer<typeof SessionInitResponseSchema>;

export const AssessmentStatusSchema = z.enum(["blocked", "on-track", "solid"]);
export type AssessmentStatus = z.infer<typeof AssessmentStatusSchema>;

export const WatchSeveritySchema = z.enum(["low", "medium", "high"]);
export type WatchSeverity = z.infer<typeof WatchSeveritySchema>;

export const WatchVerdictSchema = z.object({
  flag: z.boolean(),
  severity: WatchSeveritySchema.optional(),
  ghostKey: z.string().optional(),
  reasoning: z.string().min(1),
});
export type WatchVerdict = z.infer<typeof WatchVerdictSchema>;

export const TurnRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("setMode"), mode: ModeSchema }),
  z.object({ kind: z.literal("saveDraft"), questionId: z.string(), draft: z.string() }),
  z.object({ kind: z.literal("requestCheck"), questionId: z.string() }),
  z.object({ kind: z.literal("ask"), questionId: z.string(), message: z.string().min(1) }),
  z.object({ kind: z.literal("idk"), questionId: z.string() }),
]);
export type TurnRequest = z.infer<typeof TurnRequestSchema>;

export const GhostSummaryEntrySchema = z.object({
  ghostKey: z.string(),
  severity: WatchSeveritySchema,
  firstSeenAt: z.number(),
  lastSeenAt: z.number(),
  occurrences: z.number().int().nonnegative(),
  silent: z.boolean(),
});
export type GhostSummaryEntry = z.infer<typeof GhostSummaryEntrySchema>;

export const HintEscalationSchema = z.enum(["up", "same", "down"]);
export type HintEscalation = z.infer<typeof HintEscalationSchema>;

export const QuestionBlockSchema = z.object({
  id: z.string(),
  index: z.number().int().nonnegative(),
  text: z.string(),
  status: AssessmentStatusSchema,
});
export type QuestionBlock = z.infer<typeof QuestionBlockSchema>;

export const ExtractedQuestionSchema = z.object({
  id: z.string(),
  index: z.number().int().nonnegative(),
  text: z.string(),
});
export type ExtractedQuestion = z.infer<typeof ExtractedQuestionSchema>;

export const TutorTurnSchema = z.object({
  questionId: z.string(),
  hint: z.string().min(1),
  level: z.number().int().min(0).max(3),
  escalation: HintEscalationSchema,
});
export type TutorTurn = z.infer<typeof TutorTurnSchema>;

export const SessionSnapshotSchema = z.object({
  uuid: z.string().uuid(),
  mode: ModeSchema.optional(),
  captures: z.array(
    z.object({ pageIndex: z.number().int().nonnegative(), hash: hashSchema, timestamp: z.number() })
  ),
  worksheet: z.array(QuestionBlockSchema),
  drafts: z.record(z.string(), z.string()),
  ghostSummary: z.array(GhostSummaryEntrySchema),
  exportReady: z.boolean(),
});
export type SessionSnapshot = z.infer<typeof SessionSnapshotSchema>;

export const SseEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("snapshot"), data: SessionSnapshotSchema }),
  z.object({
    type: z.literal("material.accepted"),
    data: z.object({ captureId: z.string(), deduped: z.boolean() }),
  }),
  z.object({
    type: z.literal("extraction.update"),
    data: z.object({ partial: z.boolean(), questions: z.array(QuestionBlockSchema) }),
  }),
  z.object({
    type: z.literal("assessment.tick"),
    data: z.object({
      questionId: z.string(),
      status: AssessmentStatusSchema,
      reasoning: z.string().min(1),
    }),
  }),
  z.object({ type: z.literal("tutor.turn"), data: TutorTurnSchema }),
  z.object({
    type: z.literal("flag"),
    data: z.object({
      questionId: z.string(),
      severity: WatchSeveritySchema,
      ghostKey: z.string().optional(),
      reasoning: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("error"),
    data: z.object({ code: z.string(), message: z.string(), recoverable: z.boolean() }),
  }),
]);
export type SseEvent = z.infer<typeof SseEventSchema>;

export function parseMaterialCapture(input: unknown): MaterialCapture {
  return MaterialCaptureSchema.parse(input);
}

export function safeParseSseEvent(input: unknown) {
  return SseEventSchema.safeParse(input);
}
