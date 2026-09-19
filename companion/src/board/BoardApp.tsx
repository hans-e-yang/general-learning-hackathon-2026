"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { BoardCarousel } from "@/board/BoardCarousel";
import { BoardJumpStrip } from "@/board/BoardJumpStrip";
import { BoardSurface } from "@/board/BoardSurface";
import { BoardToolbar } from "@/board/BoardToolbar";
import { boardToJpegBase64 } from "@/board/boardImage";
import { neighborQuestionId } from "@/board/multiBoard";
import { useMultiBoardSession } from "@/board/useMultiBoardSession";
import type { BoardElement } from "@/contracts/board";
import type { AssessmentStatus } from "@/lib/contracts";
import { normalizeQuestionLabel } from "@/lib/questionLabel";
import {
  postBoardCheck,
  subscribeBoardSuggestions,
} from "@/session/writingChannel";
import { subscribeWorksheet } from "@/session/worksheetChannel";

const SESSION_KEY = "circlr-session-uuid";
/** Clear the spinner if extract never returns (network / model hang). */
const CAPTURE_PROCESSING_TIMEOUT_MS = 90_000;
/** Quiet period after the student stops drawing before we ask for a look. */
const BOARD_CHECK_DEBOUNCE_MS = 1_500;

const STATUS_LABEL: Record<AssessmentStatus, string> = {
  blocked: "Needs work",
  "on-track": "On track",
  solid: "Solid",
};

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
  const boardsRef = useRef<Record<string, BoardElement[]>>({});
  const activeRef = useRef<string | null>(null);
  const lastSentRef = useRef<Record<string, string>>({});
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced: after the student stops drawing, render the active board and ask
  // the backend for a look. Skips empty or unchanged boards.
  const scheduleBoardCheck = useCallback(() => {
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    checkTimerRef.current = setTimeout(() => {
      checkTimerRef.current = null;
      const questionId = activeRef.current;
      if (!questionId) return;
      const els = boardsRef.current[questionId] ?? [];
      if (els.length === 0) return;
      const fingerprint = JSON.stringify(els);
      if (lastSentRef.current[questionId] === fingerprint) return;
      lastSentRef.current[questionId] = fingerprint;
      const image = boardToJpegBase64(els);
      if (!image) return;
      void postBoardCheck(sessionUuid, { questionId, image }).catch(() => {});
    }, BOARD_CHECK_DEBOUNCE_MS);
  }, [sessionUuid]);

  const {
    questions,
    boards,
    activeQuestionId,
    setActiveQuestionId,
    syncQuestions,
    deleteQuestion,
    applyRemoteElement,
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
  } = useMultiBoardSession({ onChange: scheduleBoardCheck });

  useEffect(() => {
    boardsRef.current = boards;
    activeRef.current = activeQuestionId;
  }, [boards, activeQuestionId]);

  const [captureProcessing, setCaptureProcessing] = useState(false);
  const [statuses, setStatuses] = useState<
    Record<string, { status: AssessmentStatus; reasoning: string }>
  >({});
  const [hints, setHints] = useState<Record<string, string>>({});

  useEffect(() => {
    return () => {
      if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    };
  }, []);

  useEffect(() => {
    return subscribeBoardSuggestions(sessionUuid, {
      onTick: (d) =>
        setStatuses((prev) => ({
          ...prev,
          [d.questionId]: { status: d.status, reasoning: d.reasoning },
        })),
      onTutor: (d) =>
        setHints((prev) => ({ ...prev, [d.questionId]: d.hint })),
      onBoardElement: (d) => {
        if (d.questionId) applyRemoteElement(d.questionId, d.element);
      },
    });
  }, [sessionUuid, applyRemoteElement]);

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
      {activeQuestionId &&
      (statuses[activeQuestionId] || hints[activeQuestionId]) ? (
        <div className="board-suggestion-strip" role="status" aria-live="polite">
          {statuses[activeQuestionId] ? (
            <span
              className={`board-status-badge is-${statuses[activeQuestionId].status}`}
            >
              {STATUS_LABEL[statuses[activeQuestionId].status]}
            </span>
          ) : null}
          {hints[activeQuestionId] ? (
            <p className="board-suggestion-hint">{hints[activeQuestionId]}</p>
          ) : null}
        </div>
      ) : null}
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
