import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import {
  MaterialCaptureSchema,
  ModeSchema,
  SseEventSchema,
  TurnRequestSchema,
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

  it("rejects an unknown kind", () => {
    expect(TurnRequestSchema.safeParse({ kind: "nope" }).success).toBe(false);
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

  it("declares the four Lane B endpoints", () => {
    const paths = spec.paths as Record<string, unknown>;
    expect(paths).toHaveProperty("/session.post");
    expect(paths).toHaveProperty("/session/{uuid}/material.post");
    expect(paths).toHaveProperty("/session/{uuid}/events.get");
    expect(paths).toHaveProperty("/session/{uuid}/turn.post");
  });

  it("declares every required SSE schema", () => {
    const schemas = (spec.components as { schemas: Record<string, unknown> }).schemas;
    for (const name of [
      "SnapshotEvent",
      "MaterialAcceptedEvent",
      "ExtractionUpdateEvent",
      "AssessmentTickEvent",
      "TutorTurnEvent",
      "ErrorEvent",
    ]) {
      expect(schemas).toHaveProperty(name);
    }
  });

  it("never advertises a final-answer field on TutorTurn", () => {
    const schemas = (spec.components as { schemas: Record<string, unknown> }).schemas;
    const tutor = schemas.TutorTurn as { properties: Record<string, unknown> };
    expect(tutor.properties).not.toHaveProperty("answer");
    expect(tutor.properties).not.toHaveProperty("final");
  });
});
