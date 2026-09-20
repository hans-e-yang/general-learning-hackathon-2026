import { z } from "zod";
import { type BoardAnnotationTurn, type BoardTurn } from "@/contracts/board";

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

/** Conclusive annotate verdicts on the wire. Incomplete is signaled by omitting status. */
export const BoardAnnotateStatusSchema = z.enum(["solid", "blocked"]);
export type BoardAnnotateStatus = z.infer<typeof BoardAnnotateStatusSchema>;

export const ScoutVerdictSchema = z.object({
  status: AssessmentStatusSchema,
  reasoning: z.string().min(1),
  escalate: z.boolean(),
});
export type ScoutVerdict = z.infer<typeof ScoutVerdictSchema>;

export const WatchSeveritySchema = z.enum(["low", "medium", "high"]);
export type WatchSeverity = z.infer<typeof WatchSeveritySchema>;

export const TriageNoveltySchema = z.enum(["new-questions", "new-material", "none"]);
export type TriageNovelty = z.infer<typeof TriageNoveltySchema>;

export const TriageVerdictSchema = z.object({
  update: z.boolean(),
  reason: z.string().min(1),
  novelty: TriageNoveltySchema.optional(),
});
export type TriageVerdict = z.infer<typeof TriageVerdictSchema>;

export const WatchVerdictSchema = z.object({
  flag: z.boolean(),
  severity: WatchSeveritySchema.optional(),
  ghostKey: z.string().optional(),
  reasoning: z.string().min(1),
});
export type WatchVerdict = z.infer<typeof WatchVerdictSchema>;

export const BoardAuthorSchema = z.enum(["student", "tutor"]);
export const ShapeKindSchema = z.enum(["rect", "ellipse", "line", "triangle"]);
export const BoardPointSchema = z.object({ x: z.number(), y: z.number() });

export const BoardElementSchema = z.discriminatedUnion("tool", [
  z.object({
    id: z.string(),
    tool: z.literal("pen"),
    author: BoardAuthorSchema,
    points: z.array(BoardPointSchema),
    color: z.string(),
    strokeWidth: z.number(),
  }),
  z.object({
    id: z.string(),
    tool: z.literal("eraserMask"),
    author: BoardAuthorSchema,
    points: z.array(BoardPointSchema),
  }),
  z.object({
    id: z.string(),
    tool: z.literal("text"),
    author: BoardAuthorSchema,
    x: z.number(),
    y: z.number(),
    source: z.string(),
    color: z.string(),
    width: z.number(),
    fontSize: z.number(),
    degraded: z.boolean().optional(),
  }),
  z.object({
    id: z.string(),
    tool: z.literal("shape"),
    shape: ShapeKindSchema,
    author: BoardAuthorSchema,
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    color: z.string(),
    strokeWidth: z.number(),
  }),
]);
export type BoardElementWire = z.infer<typeof BoardElementSchema>;

const boardPenElement = z.object({
  id: z.string(),
  tool: z.literal("pen").optional(),
  author: BoardAuthorSchema,
  points: z.array(BoardPointSchema).min(1),
  color: z.string().optional(),
  strokeWidth: z.number().optional(),
});
const boardShapeElement = z.object({
  id: z.string(),
  tool: z.literal("shape").optional(),
  shape: ShapeKindSchema,
  author: BoardAuthorSchema,
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  color: z.string().optional(),
  strokeWidth: z.number().optional(),
});
const boardTextElement = z.object({
  id: z.string(),
  tool: z.literal("text").optional(),
  author: BoardAuthorSchema,
  x: z.number(),
  y: z.number(),
  source: z.string(),
  color: z.string().optional(),
  width: z.number().optional(),
  fontSize: z.number().optional(),
  degraded: z.boolean().optional(),
});

export const TurnRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("setMode"), mode: ModeSchema }),
  z.object({
    kind: z.literal("saveDraft"),
    questionId: z.string(),
    draft: z.string(),
    image: base64JpegSchema.optional(),
  }),
  z.object({
    kind: z.literal("requestCheck"),
    questionId: z.string(),
    image: base64JpegSchema.optional(),
  }),
  z.object({
    kind: z.literal("assess"),
    questionId: z.string(),
    image: base64JpegSchema.optional(),
  }),
  z.object({
    kind: z.literal("ask"),
    questionId: z.string(),
    message: z.string().min(1),
    image: base64JpegSchema.optional(),
  }),
  z.object({
    kind: z.literal("idk"),
    questionId: z.string(),
    image: base64JpegSchema.optional(),
  }),
  z.object({
    kind: z.literal("annotate"),
    questionId: z.string(),
    image: base64JpegSchema,
    crop: z
      .object({
        x: z.number(),
        y: z.number(),
        width: z.number().positive(),
        height: z.number().positive(),
      })
      .optional(),
    transcript: z.string().optional(),
  }),
  z.object({
    kind: z.literal("dismissAnnotation"),
    questionId: z.string(),
  }),
  z.object({ kind: z.literal("board-pen"), element: boardPenElement }),
  z.object({ kind: z.literal("board-shape"), element: boardShapeElement }),
  z.object({ kind: z.literal("board-text"), element: boardTextElement }),
  z.object({ kind: z.literal("board-eraser"), elementIds: z.array(z.string()) }),
  z.object({ kind: z.literal("board-remove"), elementId: z.string() }),
  z.object({
    kind: z.literal("board-text-move"),
    elementId: z.string(),
    x: z.number(),
    y: z.number(),
    width: z.number().optional(),
    fontSize: z.number().optional(),
  }),
  z.object({
    kind: z.literal("board-pen-move"),
    elementId: z.string(),
    dx: z.number(),
    dy: z.number(),
  }),
  z.object({
    kind: z.literal("board-shape-move"),
    elementId: z.string(),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
]);
export type TurnRequest = z.infer<typeof TurnRequestSchema>;

/** Narrow a validated turn to a board mutation when its kind is a `board-*`. */
export function asBoardTurn(turn: TurnRequest): BoardTurn | undefined {
  return turn.kind.startsWith("board-") ? (turn as BoardTurn) : undefined;
}

/** The additive subset the agent may emit (pen / shape / text only). */
export function asBoardAnnotationTurn(turn: BoardTurn): BoardAnnotationTurn | undefined {
  return turn.kind === "board-pen" || turn.kind === "board-shape" || turn.kind === "board-text"
    ? turn
    : undefined;
}

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
  /** Soft board title from the printed label (e.g. 1a, 2). Optional for older snapshots. */
  label: z.string().min(1).optional(),
  status: AssessmentStatusSchema,
});
export type QuestionBlock = z.infer<typeof QuestionBlockSchema>;

export const ExtractedQuestionSchema = z.object({
  id: z.string(),
  index: z.number().int().nonnegative(),
  text: z.string(),
  label: z.string().min(1).optional(),
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
  board: z.array(BoardElementSchema).optional(),
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
    type: z.literal("capture.triaged"),
    data: z.object({
      captureId: z.string(),
      update: z.boolean(),
      reason: z.string().min(1),
      novelty: TriageNoveltySchema.optional(),
    }),
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
    type: z.literal("board.element"),
    data: z.object({
      element: BoardElementSchema,
      questionId: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal("board.annotate"),
    data: z.object({
      questionId: z.string(),
      status: BoardAnnotateStatusSchema.optional(),
    }),
  }),
  z.object({
    type: z.literal("board.remove"),
    data: z.object({ elementId: z.string() }),
  }),
  z.object({
    type: z.literal("board.text-move"),
    data: z.object({
      elementId: z.string(),
      x: z.number(),
      y: z.number(),
      width: z.number().optional(),
      fontSize: z.number().optional(),
    }),
  }),
  z.object({
    type: z.literal("board.pen-move"),
    data: z.object({ elementId: z.string(), dx: z.number(), dy: z.number() }),
  }),
  z.object({
    type: z.literal("board.shape-move"),
    data: z.object({
      elementId: z.string(),
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }),
  }),
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
