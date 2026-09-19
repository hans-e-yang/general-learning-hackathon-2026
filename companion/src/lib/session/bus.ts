import { EventEmitter } from "node:events";
import type { SseEvent } from "@/lib/contracts";

declare global {
  var __circlrBus: EventEmitter | undefined;
  var __circlrBusReplay: Map<string, BusEvent[]> | undefined;
  var __circlrBusCounters: Map<string, number> | undefined;
}

const bus: EventEmitter = (globalThis.__circlrBus ??= new EventEmitter());
const replay: Map<string, BusEvent[]> = (globalThis.__circlrBusReplay ??= new Map());
const counters: Map<string, number> = (globalThis.__circlrBusCounters ??= new Map());

const REPLAY_CAP = 100;
bus.setMaxListeners(1000);

export interface BusEvent {
  id: number;
  evt: SseEvent;
}

const keyFor = (uuid: string): string => `sse:${uuid}`;

export function publish(uuid: string, evt: SseEvent): BusEvent {
  const next = (counters.get(uuid) ?? 0) + 1;
  counters.set(uuid, next);
  const wire: BusEvent = { id: next, evt };
  const buf = replay.get(uuid) ?? [];
  buf.push(wire);
  if (buf.length > REPLAY_CAP) {
    buf.shift();
  }
  replay.set(uuid, buf);
  bus.emit(keyFor(uuid), wire);
  return wire;
}

export type BusListener = (wire: BusEvent) => void;

export function subscribe(uuid: string, listener: BusListener): () => void {
  bus.on(keyFor(uuid), listener);
  return () => bus.off(keyFor(uuid), listener);
}

export function replayAfter(uuid: string, lastId: number): BusEvent[] {
  const buf = replay.get(uuid) ?? [];
  return buf.filter((w) => w.id > lastId);
}

export function clearForTests(): void {
  bus.removeAllListeners();
  replay.clear();
  counters.clear();
}

export function _lastReplayLength(uuid: string): number {
  return (replay.get(uuid) ?? []).length;
}
