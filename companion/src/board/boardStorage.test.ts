import { describe, expect, it } from "vitest";
import type { PenElement } from "@/contracts/board";
import {
  boardStorageKey,
  parsePersistedBoards,
  readPersistedBoards,
  writePersistedBoards,
  type PersistedBoards,
} from "./boardStorage";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  } as Storage;
}

const pen: PenElement = {
  id: "pen-1",
  tool: "pen",
  author: "student",
  points: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
  color: "#1a1a1a",
  strokeWidth: 2.5,
};

describe("boardStorage", () => {
  it("round-trips board state", () => {
    const storage = memoryStorage();
    const state: PersistedBoards = {
      questions: [{ id: "q1", label: "1a" }],
      boards: { q1: [pen] },
      activeQuestionId: "q1",
    };
    writePersistedBoards(storage, "s1", state);
    expect(readPersistedBoards(storage, "s1")).toEqual(state);
  });

  it("returns null for missing or malformed payloads", () => {
    const storage = memoryStorage();
    expect(readPersistedBoards(storage, "s1")).toBeNull();
    storage.setItem(boardStorageKey("s1"), "{not json");
    expect(readPersistedBoards(storage, "s1")).toBeNull();
  });

  it("drops malformed questions, non-array boards, and bad active ids", () => {
    const parsed = parsePersistedBoards(
      JSON.stringify({
        questions: [{ id: "q1", label: "1a" }, { id: 2 }, null],
        boards: { q1: [pen], q2: "nope" },
        activeQuestionId: 7,
      }),
    );
    expect(parsed).toEqual({
      questions: [{ id: "q1", label: "1a" }],
      boards: { q1: [pen] },
      activeQuestionId: null,
    });
  });

  it("no-ops without storage", () => {
    expect(readPersistedBoards(undefined, "s1")).toBeNull();
    expect(() =>
      writePersistedBoards(undefined, "s1", {
        questions: [],
        boards: {},
        activeQuestionId: null,
      }),
    ).not.toThrow();
  });
});
