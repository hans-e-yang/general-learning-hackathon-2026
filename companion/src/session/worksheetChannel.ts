import { QuestionBlockSchema, SessionSnapshotSchema } from "@/lib/contracts";
import { z } from "zod";

export type WorksheetQuestion = z.infer<typeof QuestionBlockSchema>;
export type WorksheetListener = (questions: WorksheetQuestion[]) => void;

export type SubscribeWorksheetOptions = {
  baseUrl?: string;
  onError?: () => void;
};

const ExtractionDataSchema = z.object({
  partial: z.boolean(),
  questions: z.array(QuestionBlockSchema),
});

export function questionsFromSsePayload(
  type: string,
  data: unknown,
): WorksheetQuestion[] | null {
  if (type === "snapshot") {
    const parsed = SessionSnapshotSchema.safeParse(data);
    if (parsed.success) return parsed.data.worksheet;
    // Tolerate snapshot drift: still pull worksheet if present.
    const loose = z
      .object({ worksheet: z.array(QuestionBlockSchema) })
      .safeParse(data);
    return loose.success ? loose.data.worksheet : null;
  }
  if (type === "extraction.update") {
    const parsed = ExtractionDataSchema.safeParse(data);
    return parsed.success ? parsed.data.questions : null;
  }
  return null;
}

/**
 * Wire format (events/route encodeEvent):
 *   event: <type>
 *   data: <JSON of evt.data only>
 * Named listeners receive data-only payloads; onmessage is unused for those.
 */
export function subscribeWorksheet(
  sessionUuid: string,
  onQuestions: WorksheetListener,
  options?: SubscribeWorksheetOptions,
): () => void {
  const base = (options?.baseUrl ?? "").replace(/\/$/, "");
  const url = `${base}/session/${sessionUuid}/events`;
  const source = new EventSource(url);

  const handle = (type: string, raw: string) => {
    try {
      const data = JSON.parse(raw) as unknown;
      const qs = questionsFromSsePayload(type, data);
      if (qs) onQuestions(qs);
    } catch {
      // ignore heartbeats / bad frames
    }
  };

  source.addEventListener("snapshot", (ev) => {
    handle("snapshot", (ev as MessageEvent).data);
  });
  source.addEventListener("extraction.update", (ev) => {
    handle("extraction.update", (ev as MessageEvent).data);
  });
  source.onerror = () => {
    options?.onError?.();
  };

  return () => source.close();
}
