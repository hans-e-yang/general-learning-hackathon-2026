import { beforeEach, describe, expect, it } from "vitest";
import {
  _seed,
  _size,
  clearForTests,
  freshSession,
  get,
  getOrCreate,
  recordCapture,
  withLock,
} from "./store";

describe("session/store", () => {
  beforeEach(clearForTests);

  it("getOrCreate returns the same instance for the same uuid", () => {
    const a = getOrCreate("u1");
    const b = getOrCreate("u1");
    expect(a).toBe(b);
    expect(_size()).toBe(1);
  });

  it("freshSession stamps uuid + createdAt", () => {
    const s = freshSession("u1", 1_000);
    expect(s.uuid).toBe("u1");
    expect(s.createdAt).toBe(1_000);
    expect(s.captures).toEqual([]);
    expect(s.recentHashes).toEqual([]);
    expect(s.drafts).toEqual({});
    expect(s.threads).toEqual({});
  });

  describe("recordCapture + dedupe", () => {
    it("mints a captureId on first capture and stores metadata", () => {
      const r = recordCapture("u1", "0000000000000001", 2, 1_700_000_000_000);
      expect(r.deduped).toBe(false);
      expect(r.captureId).toMatch(/^[0-9a-f-]{36}$/);
      const s = get("u1")!;
      expect(s.captures).toHaveLength(1);
      expect(s.recentHashes).toEqual(["0000000000000001"]);
    });

    it("returns deduped:true when the same hash repeats within the rolling window", () => {
      const a = recordCapture("u1", "aaa", 0, 1);
      const b = recordCapture("u1", "aaa", 0, 2);
      expect(a.deduped).toBe(false);
      expect(b.deduped).toBe(true);
      expect(b.captureId).toBe("");
      const s = get("u1")!;
      expect(s.captures).toHaveLength(1);
    });

    it("rolls the dedupe window past 5 entries", () => {
      for (let i = 0; i < 7; i += 1) {
        recordCapture("u1", `h${i}`, i, i);
      }
      const s = get("u1")!;
      expect(s.recentHashes).toEqual(["h2", "h3", "h4", "h5", "h6"]);
      expect(s.captures).toHaveLength(7);
    });
  });

  describe("withLock", () => {
    it("serializes concurrent mutations to the same uuid", async () => {
      let count = 0;
      const order: number[] = [];
      const tasks = [];
      for (let i = 0; i < 5; i += 1) {
        tasks.push(
          withLock("u1", async () => {
            const here = count;
            await new Promise((r) => setTimeout(r, 5));
            count = here + 1;
            order.push(count);
          })
        );
      }
      await Promise.all(tasks);
      expect(count).toBe(5);
      expect(order).toEqual([1, 2, 3, 4, 5]);
    });

    it("does not block other uuids", async () => {
      const results: string[] = [];
      await Promise.all([
        withLock("u1", async () => {
          await new Promise((r) => setTimeout(r, 5));
          results.push("u1");
        }),
        withLock("u2", async () => {
          results.push("u2");
        }),
      ]);
      expect(results.sort()).toEqual(["u1", "u2"]);
    });
  });

  it("_seed installs a custom state", () => {
    const s = freshSession("hello", 42);
    _seed(s);
    expect(get("hello")?.createdAt).toBe(42);
  });
});
