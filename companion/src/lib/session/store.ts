import { randomUUID } from "node:crypto";
import { RECENT_HASH_LIMIT, type SessionState } from "./types";

declare global {
  var __circlrStore: Map<string, SessionState> | undefined;
  var __circlrLocks: Map<string, Promise<unknown>> | undefined;
}

const store: Map<string, SessionState> = (globalThis.__circlrStore ??= new Map());
const locks: Map<string, Promise<unknown>> = (globalThis.__circlrLocks ??= new Map());

export function freshSession(uuid: string, now: number = Date.now()): SessionState {
  return {
    uuid,
    createdAt: now,
    captures: [],
    recentHashes: [],
    worksheet: [],
    drafts: {},
    threads: {},
    ghostCounts: {},
    ghostSummary: [],
    exportReady: false,
  };
}

export function getOrCreate(
  uuid: string,
  init: (uuid: string) => SessionState = freshSession
): SessionState {
  let s = store.get(uuid);
  if (!s) {
    s = init(uuid);
    store.set(uuid, s);
  }
  return s;
}

export function get(uuid: string): SessionState | undefined {
  return store.get(uuid);
}

export async function withLock<T>(uuid: string, fn: () => Promise<T> | T): Promise<T> {
  const prev = locks.get(uuid) ?? Promise.resolve();
  let resolveNext!: () => void;
  const next = new Promise<void>((resolve) => {
    resolveNext = resolve;
  });
  locks.set(uuid, prev.then(() => next));
  await prev;
  try {
    return await fn();
  } finally {
    resolveNext();
    if (locks.get(uuid) === next) {
      locks.delete(uuid);
    }
  }
}

export interface RecordCaptureResult {
  captureId: string;
  deduped: boolean;
}

export function recordCapture(
  uuid: string,
  hash: string,
  pageIndex: number,
  timestamp: number
): RecordCaptureResult {
  const s = getOrCreate(uuid);
  if (s.recentHashes.includes(hash)) {
    return { captureId: "", deduped: true };
  }
  const captureId = randomUUID();
  s.captures.push({ captureId, pageIndex, hash, timestamp, deduped: false });
  s.recentHashes.push(hash);
  if (s.recentHashes.length > RECENT_HASH_LIMIT) {
    s.recentHashes.shift();
  }
  return { captureId, deduped: false };
}

export function clearForTests(): void {
  store.clear();
  locks.clear();
}

export function _seed(s: SessionState): void {
  store.set(s.uuid, s);
}

export function _size(): number {
  return store.size;
}
