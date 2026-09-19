"use client";

import { useSyncExternalStore } from "react";
import { BoardSurface } from "@/board/BoardSurface";
import { BoardToolbar } from "@/board/BoardToolbar";
import { useBoardSession } from "@/board/useBoardSession";

const SESSION_KEY = "circlr-session-uuid";

function readSessionUuid(): string {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("s");
  if (fromQuery) return fromQuery;
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(SESSION_KEY, created);
  return created;
}

function subscribeSession() {
  return () => {};
}

function getSessionSnapshot(): string {
  return readSessionUuid();
}

function getServerSnapshot(): null {
  return null;
}

function BoardShell({ sessionUuid }: { sessionUuid: string }) {
  const isDev = process.env.NODE_ENV === "development";
  const {
    elements,
    tool,
    setTool,
    livePoints,
    setLivePoints,
    commitStroke,
    commitText,
    removeElement,
    moveText,
    injectTutorDemo,
  } = useBoardSession({ sessionUuid, mode: "stub" });

  return (
    <div className="board-app">
      <BoardToolbar
        tool={tool}
        onToolChange={setTool}
        showTutorInject={isDev}
        onTutorInject={injectTutorDemo}
      />
      <BoardSurface
        elements={elements}
        tool={tool}
        livePoints={livePoints}
        onLivePointsChange={setLivePoints}
        onStrokeCommit={commitStroke}
        onTextCommit={commitText}
        onTextRemove={removeElement}
        onTextMove={moveText}
      />
    </div>
  );
}

export function BoardApp() {
  const sessionUuid = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getServerSnapshot,
  );

  if (!sessionUuid) {
    return <div className="board-app" aria-busy="true" />;
  }

  return <BoardShell sessionUuid={sessionUuid} />;
}
