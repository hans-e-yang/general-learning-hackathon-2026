import { beforeEach, describe, expect, it } from "vitest";
import type { SseEvent } from "@/lib/contracts";
import { _lastReplayLength, clearForTests, publish, replayAfter, subscribe } from "./bus";

const snapshotFor = (uuid: string): SseEvent => ({
  type: "snapshot",
  data: { uuid, captures: [], worksheet: [], drafts: {}, ghostSummary: [], exportReady: false },
});

const accepted = (captureId: string): SseEvent => ({
  type: "material.accepted",
  data: { captureId, deduped: false },
});

describe("session/bus", () => {
  beforeEach(clearForTests);

it("publishes events with monotonically increasing ids", () => {
    const a = publish("u1", snapshotFor("u1"));
    const b = publish("u1", accepted("c1"));
    expect(b.id).toBe(a.id + 1);
    expect(_lastReplayLength("u1")).toBe(2);
  });

  it("delivers published events to active subscribers", () => {
    const seen: number[] = [];
    const unsubscribe = subscribe("u1", (w) => seen.push(w.id));
    publish("u1", snapshotFor("u1"));
    publish("u1", accepted("c1"));
    expect(seen).toHaveLength(2);
    unsubscribe();
  });

  it("replayAfter returns nothing when lastId >= latest", () => {
    publish("u1", snapshotFor("u1"));
    expect(replayAfter("u1", 99)).toEqual([]);
  });

  it("replayAfter skips events whose id <= lastId", () => {
    const a = publish("u1", snapshotFor("u1"));
    publish("u1", accepted("c1"));
    publish("u1", accepted("c2"));
    const r = replayAfter("u1", a.id);
    expect(r.map((w) => w.id)).toEqual([a.id + 1, a.id + 2]);
  });

  it("scopes events by session uuid", () => {
    const seenU1: number[] = [];
    const seenU2: number[] = [];
    subscribe("u1", (w) => seenU1.push(w.id));
    subscribe("u2", (w) => seenU2.push(w.id));
    publish("u1", snapshotFor("u1"));
    publish("u2", snapshotFor("u2"));
    expect(seenU1).toHaveLength(1);
    expect(seenU2).toHaveLength(1);
  });

  it("rolls the replay buffer at 100 entries", () => {
    for (let i = 0; i < 110; i += 1) {
      publish("u1", {
        type: "material.accepted",
        data: { captureId: `c${i}`, deduped: false },
      });
    }
    expect(_lastReplayLength("u1")).toBe(100);
    const replay = replayAfter("u1", 0);
    expect(replay[0].id).toBe(11);
  });
});
