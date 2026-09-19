import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import {
  BoardCheckRequestSchema,
  MaterialCaptureSchema,
  ModeSchema,
  ScoutVerdictSchema,
  SseEventSchema,
  TriageVerdictSchema,
  TurnRequestSchema,
  WatchVerdictSchema,
  parseMaterialCapture,
  safeParseSseEvent,
} from "./contracts";

const FIXTURE_JPEG_B64 = Buffer.from([
  0xff,
  0xd8,
  0xff,
  0xe0,
  0x00,
  0x10,
  0x4a,
  0x46,
  0x49,
  0x46,
  0x00,
  0x01,
  0x01,
  0x00,
  0x00,
  0x01,
  0x00,
  0x01,
  0x00,
  0x00,
]).toString("base64");

function validCapture(overrides: Partial<unknown> = {}) {
  return {
    pageIndex: 0,
    scrollRatio: 0.5,
    timestamp: 1_700_000_000_000,
    hash: "0123456789abcdef",
    image: FIXTURE_JPEG_B64,
    ...overrides,
  };
}

describe("contracts: MaterialCapture", () => {
  it("accepts a valid capture", () => {
    const r = MaterialCaptureSchema.safeParse(validCapture());
    expect(r.success).toBe(true);
  });

  it("rejects an image that is not JPEG (PNG signature)", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString(
      "base64"
    );
    const r = MaterialCaptureSchema.safeParse(validCapture({ image: png }));
    expect(r.success).toBe(false);
  });

  it("rejects a hash with the wrong length", () => {
    const r = MaterialCaptureSchema.safeParse(validCapture({ hash: "deadbeef" }));
    expect(r.success).toBe(false);
  });

  it("rejects a scrollRatio outside [0,1]", () => {
    expect(MaterialCaptureSchema.safeParse(validCapture({ scrollRatio: -0.1 })).success).toBe(
      false
    );
    expect(MaterialCaptureSchema.safeParse(validCapture({ scrollRatio: 1.5 })).success).toBe(
      false
    );
  });

  it("parseMaterialCapture throws on bad input", () => {
    expect(() => parseMaterialCapture({})).toThrow();
  });
});

describe("contracts: TurnRequest", () => {
  it("accepts setMode", () => {
    expect(TurnRequestSchema.safeParse({ kind: "setMode", mode: "review" }).success).toBe(true);
  });

  it("rejects saveDraft with missing draft", () => {
    expect(
      TurnRequestSchema.safeParse({ kind: "saveDraft", questionId: "q1" }).success
    ).toBe(false);
  });

  it("accepts requestCheck", () => {
    expect(
      TurnRequestSchema.safeParse({ kind: "requestCheck", questionId: "q1" }).success
    ).toBe(true);
  });

  it("accepts assess (#29)", () => {
    expect(TurnRequestSchema.safeParse({ kind: "assess", questionId: "q1" }).success).toBe(
      true
    );
  });

  it("rejects an unknown kind", () => {
    expect(TurnRequestSchema.safeParse({ kind: "nope" }).success).toBe(false);
  });

  it("accepts an optional image on the five conversational kinds", () => {
    const kinds = [
      { kind: "saveDraft", questionId: "q1", draft: "x" },
      { kind: "requestCheck", questionId: "q1" },
      { kind: "assess", questionId: "q1" },
      { kind: "ask", questionId: "q1", message: "why?" },
      { kind: "idk", questionId: "q1" },
    ] as const;
    for (const turn of kinds) {
      expect(TurnRequestSchema.safeParse({ ...turn, image: FIXTURE_JPEG_B64 }).success).toBe(
        true
      );
      expect(TurnRequestSchema.safeParse(turn).success).toBe(true);
    }
  });

  it("rejects a non-JPEG image on a turn", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");
    expect(
      TurnRequestSchema.safeParse({ kind: "requestCheck", questionId: "q1", image: png }).success
    ).toBe(false);
  });

  it("does not retain an image on setMode (not a conversational kind)", () => {
    const parsed = TurnRequestSchema.safeParse({
      kind: "setMode",
      mode: "review",
      image: FIXTURE_JPEG_B64,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "image" in parsed.data).toBe(false);
  });
});

describe("contracts: board turns", () => {
  it("accepts a board-pen turn (color/strokeWidth optional)", () => {
    const r = TurnRequestSchema.safeParse({
      kind: "board-pen",
      element: {
        id: "pen-1",
        author: "student",
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 4 },
        ],
      },
    });
    expect(r.success).toBe(true);
  });

  it("accepts a board-remove turn", () => {
    expect(TurnRequestSchema.safeParse({ kind: "board-remove", elementId: "pen-1" }).success).toBe(
      true
    );
  });

  it("rejects a board-shape turn missing its dimensions", () => {
    const r = TurnRequestSchema.safeParse({
      kind: "board-shape",
      element: { id: "s1", author: "student", shape: "rect", x: 0, y: 0 },
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown board author", () => {
    const r = TurnRequestSchema.safeParse({
      kind: "board-pen",
      element: { id: "p", author: "robot", points: [{ x: 0, y: 0 }] },
    });
    expect(r.success).toBe(false);
  });

  it("requires a canvas image on the annotate turn", () => {
    expect(
      TurnRequestSchema.safeParse({
        kind: "annotate",
        questionId: "q1",
        image: FIXTURE_JPEG_B64,
      }).success,
    ).toBe(true);
    expect(
      TurnRequestSchema.safeParse({ kind: "annotate", questionId: "q1" }).success,
    ).toBe(false);
  });

  it("accepts a dismissAnnotation turn", () => {
    expect(
      TurnRequestSchema.safeParse({
        kind: "dismissAnnotation",
        questionId: "q1",
      }).success,
    ).toBe(true);
  });
});

describe("contracts: board SSE events", () => {
  it("accepts a board.element event", () => {
    const ev = {
      type: "board.element",
      data: {
        element: {
          id: "e1",
          tool: "text",
          author: "tutor",
          x: 0,
          y: 0,
          source: "look here",
          color: "#b85c38",
          width: 180,
          fontSize: 16,
        },
      },
    };
    expect(safeParseSseEvent(ev).success).toBe(true);
  });

  it("accepts a board.element event carrying a questionId", () => {
    const ev = {
      type: "board.element",
      data: {
        questionId: "q-p0-0",
        element: {
          id: "e2",
          tool: "shape",
          shape: "ellipse",
          author: "tutor",
          x: 10,
          y: 20,
          width: 30,
          height: 40,
          color: "#b85c38",
          strokeWidth: 2.5,
        },
      },
    };
    const parsed = safeParseSseEvent(ev);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.type === "board.element" && parsed.data.data.questionId).toBe(
      "q-p0-0"
    );
  });

  it("accepts a board.remove event", () => {
    expect(safeParseSseEvent({ type: "board.remove", data: { elementId: "e1" } }).success).toBe(
      true
    );
  });

  it("rejects a board.element event without an element", () => {
    expect(safeParseSseEvent({ type: "board.element", data: {} }).success).toBe(false);
  });

  it("accepts a board.annotate event", () => {
    const ev = { type: "board.annotate", data: { questionId: "q1" } };
    expect(safeParseSseEvent(ev).success).toBe(true);
    expect(safeParseSseEvent({ type: "board.annotate", data: {} }).success).toBe(
      false,
    );
  });
});

describe("contracts: BoardCheckRequest (#board-check)", () => {
  it("accepts a question image with optional hash/timestamp", () => {
    expect(
      BoardCheckRequestSchema.safeParse({ questionId: "q-p0-0", image: FIXTURE_JPEG_B64 }).success
    ).toBe(true);
    expect(
      BoardCheckRequestSchema.safeParse({
        questionId: "q-p0-0",
        image: FIXTURE_JPEG_B64,
        hash: "feedfacec0ffee01",
        timestamp: 1_700_000_000_000,
      }).success
    ).toBe(true);
  });

  it("rejects a non-JPEG board image", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");
    expect(
      BoardCheckRequestSchema.safeParse({ questionId: "q-p0-0", image: png }).success
    ).toBe(false);
  });

  it("requires a questionId", () => {
    expect(BoardCheckRequestSchema.safeParse({ image: FIXTURE_JPEG_B64 }).success).toBe(false);
  });
});

describe("contracts: WatchVerdict.status (#board-check)", () => {
  it("accepts an optional assessment status", () => {
    expect(WatchVerdictSchema.safeParse({ flag: false, reasoning: "ok" }).success).toBe(true);
    expect(
      WatchVerdictSchema.safeParse({ flag: false, reasoning: "ok", status: "on-track" }).success
    ).toBe(true);
    expect(
      WatchVerdictSchema.safeParse({ flag: true, reasoning: "x", status: "bogus" }).success
    ).toBe(false);
  });
});

describe("contracts: ScoutVerdict", () => {
  it("requires the escalate gate", () => {
    expect(
      ScoutVerdictSchema.safeParse({ status: "on-track", reasoning: "x", escalate: true }).success
    ).toBe(true);
    expect(ScoutVerdictSchema.safeParse({ status: "on-track", reasoning: "x" }).success).toBe(
      false
    );
  });
});

describe("contracts: TriageVerdict (#28)", () => {
  it("accepts update/reason with an optional novelty", () => {
    expect(TriageVerdictSchema.safeParse({ update: true, reason: "new" }).success).toBe(true);
    expect(
      TriageVerdictSchema.safeParse({ update: false, reason: "seen", novelty: "none" }).success
    ).toBe(true);
  });

  it("rejects a verdict without update or reason", () => {
    expect(TriageVerdictSchema.safeParse({ novelty: "none" }).success).toBe(false);
    expect(TriageVerdictSchema.safeParse({ update: true }).success).toBe(false);
  });
});

describe("contracts: SSE events", () => {
  it("accepts a snapshot event", () => {
    const ev = {
      type: "snapshot",
      data: {
        uuid: "11111111-1111-4111-8111-111111111111",
        mode: "assignment",
        captures: [],
        worksheet: [],
        drafts: {},
        ghostSummary: [],
        exportReady: false,
      },
    };
    expect(safeParseSseEvent(ev).success).toBe(true);
  });

  it("accepts a tutor.turn event with level 0..3", () => {
    for (const level of [0, 1, 2, 3]) {
      const ev = {
        type: "tutor.turn",
        data: {
          questionId: "q1",
          hint: "What assumption are you making?",
          level,
          escalation: "up",
        },
      };
      expect(safeParseSseEvent(ev).success).toBe(true);
    }
  });

  it("rejects a tutor.turn with an out-of-range level", () => {
    const ev = {
      type: "tutor.turn",
      data: { questionId: "q1", hint: "x", level: 9, escalation: "up" },
    };
    expect(safeParseSseEvent(ev).success).toBe(false);
  });

  it("accepts a capture.triaged event (#28)", () => {
    const ev = {
      type: "capture.triaged",
      data: { captureId: "c1", update: false, reason: "already known", novelty: "none" },
    };
    expect(safeParseSseEvent(ev).success).toBe(true);
  });

  it("rejects a capture.triaged event without update/reason", () => {
    expect(
      safeParseSseEvent({ type: "capture.triaged", data: { captureId: "c1" } }).success
    ).toBe(false);
  });

  it("rejects an unknown event type", () => {
    expect(safeParseSseEvent({ type: "mystery", data: {} }).success).toBe(false);
  });
});

describe("contracts: Mode enum", () => {
  it("only allows assignment or review", () => {
    expect(ModeSchema.parse("assignment")).toBe("assignment");
    expect(ModeSchema.parse("review")).toBe("review");
    expect(ModeSchema.safeParse("mystery").success).toBe(false);
  });
});

describe("contracts: openapi.yaml", () => {
  const spec = yaml.load(
    readFileSync(path.join(__dirname, "..", "..", "openapi.yaml"), "utf8"),
    { schema: yaml.JSON_SCHEMA }
  ) as Record<string, unknown>;

  it("declares the Lane B endpoints incl. the board check", () => {
    const paths = spec.paths as Record<string, unknown>;
    expect(paths).toHaveProperty("/session.post");
    expect(paths).toHaveProperty("/session/{uuid}/material.post");
    expect(paths).toHaveProperty("/session/{uuid}/events.get");
    expect(paths).toHaveProperty("/session/{uuid}/turn.post");
    expect(paths).toHaveProperty("/session/{uuid}/board.post");
  });

  it("declares BoardCheckRequest and the WatchVerdict status", () => {
    const schemas = (spec.components as { schemas: Record<string, unknown> }).schemas;
    expect(schemas).toHaveProperty("BoardCheckRequest");
    const watch = schemas.WatchVerdict as { properties: Record<string, unknown> };
    expect(watch.properties).toHaveProperty("status");
  });

  it("declares every required SSE schema", () => {
    const schemas = (spec.components as { schemas: Record<string, unknown> }).schemas;
    for (const name of [
      "SnapshotEvent",
      "MaterialAcceptedEvent",
      "CaptureTriagedEvent",
      "ExtractionUpdateEvent",
      "AssessmentTickEvent",
      "TutorTurnEvent",
      "BoardElementEvent",
      "BoardRemoveEvent",
      "BoardTextMoveEvent",
      "BoardPenMoveEvent",
      "BoardShapeMoveEvent",
      "BoardElement",
      "ErrorEvent",
    ]) {
      expect(schemas).toHaveProperty(name);
    }
  });

  it("declares the assess turn and the capture.triaged mapping", () => {
    const schemas = (spec.components as { schemas: Record<string, unknown> }).schemas;
    expect(schemas).toHaveProperty("AssessTurn");
    const sse = schemas.SseEvent as {
      discriminator: { mapping: Record<string, string> };
    };
    expect(sse.discriminator.mapping["capture.triaged"]).toBe(
      "#/components/schemas/CaptureTriagedEvent"
    );
    const turn = spec.paths as { "/session/{uuid}/turn": { post: unknown } };
    expect(turn["/session/{uuid}/turn"].post).toBeDefined();
  });

  it("declares the board turns and the board.element mapping", () => {
    const schemas = (spec.components as { schemas: Record<string, unknown> }).schemas;
    expect(schemas).toHaveProperty("BoardPenTurn");
    expect(schemas).toHaveProperty("BoardShapeMoveTurn");
    expect(schemas).toHaveProperty("AnnotateTurn");
    expect(schemas).toHaveProperty("DismissAnnotationTurn");
    expect(schemas).toHaveProperty("BoardAnnotateEvent");
    const sse = schemas.SseEvent as {
      discriminator: { mapping: Record<string, string> };
    };
    expect(sse.discriminator.mapping["board.element"]).toBe(
      "#/components/schemas/BoardElementEvent"
    );
    expect(sse.discriminator.mapping["board.annotate"]).toBe(
      "#/components/schemas/BoardAnnotateEvent"
    );
  });

  it("never advertises a final-answer field on TutorTurn", () => {
    const schemas = (spec.components as { schemas: Record<string, unknown> }).schemas;
    const tutor = schemas.TutorTurn as { properties: Record<string, unknown> };
    expect(tutor.properties).not.toHaveProperty("answer");
    expect(tutor.properties).not.toHaveProperty("final");
  });
});
