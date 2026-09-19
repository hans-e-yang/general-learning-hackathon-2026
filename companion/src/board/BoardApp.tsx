"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { BoardCarousel } from "@/board/BoardCarousel";
import { renderBoardToJpeg } from "@/board/boardImage";
import { BoardJumpStrip } from "@/board/BoardJumpStrip";
import { BoardSurface } from "@/board/BoardSurface";
import { BoardToolbar } from "@/board/BoardToolbar";
import { neighborQuestionId } from "@/board/multiBoard";
import { useMultiBoardSession } from "@/board/useMultiBoardSession";
import type { BoardElement } from "@/contracts/board";
import { normalizeQuestionLabel } from "@/lib/questionLabel";
import { subscribeWorksheet } from "@/session/worksheetChannel";

const SESSION_KEY = "circlr-session-uuid";
/** Clear the spinner if extract never returns (network / model hang). */
const CAPTURE_PROCESSING_TIMEOUT_MS = 90_000;

function readQuerySessionUuid(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("s");
}

function subscribeSession(onStoreChange: () => void) {
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

function getSessionSnapshot(): string | null {
  return readQuerySessionUuid();
}

function getServerSnapshot(): null {
  return null;
}

async function mintSessionUuid(): Promise<string> {
  const res = await fetch("/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`POST /session failed: ${res.status}`);
  const data = (await res.json()) as { uuid?: string };
  if (!data.uuid) throw new Error("POST /session returned no uuid");
  return data.uuid;
}

async function sessionExists(uuid: string): Promise<boolean> {
  try {
    const res = await fetch(`/session/${uuid}`);
    return res.ok;
  } catch {
    return false;
  }
}

function writeSessionToUrl(uuid: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("s", uuid);
  window.history.replaceState({}, "", url.toString());
  window.dispatchEvent(new Event("popstate"));
}

function BoardShell({ sessionUuid }: { sessionUuid: string }) {
  /** Idle canvas snapshot → agent annotations come back over the board SSE. */
  const annotateOnIdle = useCallback(
    async ({
      questionId,
      elements,
    }: {
      questionId: string;
      elements: BoardElement[];
    }) => {
      if (elements.length === 0) return;
      const image = renderBoardToJpeg(elements);
      if (!image) return;
      const res = await fetch(`/session/${sessionUuid}/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "annotate", questionId, image }),
      });
      if (!res.ok) {
        throw new Error(`annotate request failed: ${res.status}`);
      }
    },
    [sessionUuid],
  );

  const {
    questions,
    activeQuestionId,
    setActiveQuestionId,
    syncQuestions,
    deleteQuestion,
    goPrev,
    goNext,
    elements,
    tool,
    setTool,
    penColor,
    setPenColor,
    penWeight,
    setPenWeight,
    eraserSize,
    setEraserSize,
    shapeKind,
    setShapeKind,
    selectedId,
    setSelectedId,
    livePoints,
    setLivePoints,
    commitStroke,
    commitShape,
    eraseStrokes,
    commitText,
    removeElement,
    moveText,
    movePen,
    moveShape,
  } = useMultiBoardSession({
    sessionUuid,
    mode: "live",
    onIdle: annotateOnIdle,
  });
  const [captureProcessing, setCaptureProcessing] = useState(false);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const clearBusy = () => {
      if (timeout) clearTimeout(timeout);
      timeout = undefined;
      setCaptureProcessing(false);
    };
    const unsub = subscribeWorksheet(
      sessionUuid,
      (qs) => {
        syncQuestions(
          qs.map((q) => ({
            id: q.id,
            label: normalizeQuestionLabel(q.label, q.index, q.text),
          })),
        );
      },
      {
        onCaptureProcessing: (busy) => {
          if (timeout) clearTimeout(timeout);
          timeout = undefined;
          setCaptureProcessing(busy);
          if (busy) {
            timeout = setTimeout(clearBusy, CAPTURE_PROCESSING_TIMEOUT_MS);
          }
        },
      },
    );
    return () => {
      unsub();
      if (timeout) clearTimeout(timeout);
    };
  }, [sessionUuid, syncQuestions]);

  const activeLabel =
    questions.find((q) => q.id === activeQuestionId)?.label ?? null;
  const canPrev =
    neighborQuestionId(questions, activeQuestionId, -1) !== null;
  const canNext =
    neighborQuestionId(questions, activeQuestionId, 1) !== null;
  const empty = questions.length === 0;

  return (
    <div className="board-app">
      <BoardToolbar
        tool={tool}
        onToolChange={setTool}
        penColor={penColor}
        onPenColorChange={setPenColor}
        penWeight={penWeight}
        onPenWeightChange={setPenWeight}
        eraserSize={eraserSize}
        onEraserSizeChange={setEraserSize}
        shapeKind={shapeKind}
        onShapeKindChange={setShapeKind}
      />
      <div className="board-status-row">
        <BoardJumpStrip
          items={questions}
          activeId={activeQuestionId}
          onSelect={setActiveQuestionId}
        />
        {captureProcessing ? (
          <p className="board-capture-busy" role="status" aria-live="polite">
            <span className="board-capture-spinner" aria-hidden="true" />
            Reading capture…
          </p>
        ) : null}
      </div>
      <BoardCarousel
        label={activeLabel}
        canPrev={canPrev}
        canNext={canNext}
        onPrev={goPrev}
        onNext={goNext}
        onDelete={
          activeQuestionId !== null
            ? () => deleteQuestion(activeQuestionId)
            : undefined
        }
        canDelete={activeQuestionId !== null}
        empty={empty}
        processing={captureProcessing}
      >
        <div className="board-stage">
          <BoardSurface
            key={activeQuestionId ?? "empty"}
            elements={elements}
            tool={tool}
            penColor={penColor}
            penWeight={penWeight}
            eraserSize={eraserSize}
            shapeKind={shapeKind}
            selectedId={selectedId}
            onSelectedIdChange={setSelectedId}
            livePoints={livePoints}
            onLivePointsChange={setLivePoints}
            onStrokeCommit={commitStroke}
            onShapeCommit={commitShape}
            onEraseStrokes={eraseStrokes}
            onTextCommit={commitText}
            onTextRemove={removeElement}
            onTextMove={moveText}
            onPenMove={movePen}
            onShapeMove={moveShape}
          />
        </div>
      </BoardCarousel>
    </div>
  );
}

export function BoardApp() {
  const queryUuid = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getServerSnapshot,
  );
  const [resolvedUuid, setResolvedUuid] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setBootError(null);
        // Prefer ?s= from the extension; verify it still exists (dev server restarts wipe memory).
        if (queryUuid && (await sessionExists(queryUuid))) {
          if (cancelled) return;
          window.localStorage.setItem(SESSION_KEY, queryUuid);
          setResolvedUuid(queryUuid);
          return;
        }
        // Stale ?s= or no query: mint a live Session on this server.
        const uuid = await mintSessionUuid();
        if (cancelled) return;
        window.localStorage.setItem(SESSION_KEY, uuid);
        writeSessionToUrl(uuid);
        setResolvedUuid(uuid);
      } catch (err) {
        if (!cancelled) {
          setBootError(
            err instanceof Error ? err.message : "Failed to start a Session",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryUuid]);

  if (bootError) {
    return (
      <div className="board-app">
        <p className="board-session-error" role="alert">
          {bootError}
        </p>
      </div>
    );
  }

  if (!resolvedUuid) {
    return <div className="board-app" aria-busy="true" />;
  }

  return <BoardShell sessionUuid={resolvedUuid} />;
}
