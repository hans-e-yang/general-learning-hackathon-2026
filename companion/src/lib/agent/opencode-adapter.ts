import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { BoardAnnotationTurn } from "@/contracts/board";
import {
  AssessmentStatusSchema,
  HintEscalationSchema,
  ShapeKindSchema,
  TriageVerdictSchema,
  WatchVerdictSchema,
  type ExtractedQuestion,
  type TutorTurn,
} from "@/lib/contracts";
import { stableQuestionId } from "@/lib/questionIdentity";
import { composeQuestionLabels } from "@/lib/questionLabel";
import { looksLikeFinalAnswer } from "./answer-guard";
import type {
  AnnotateInput,
  ExtractInput,
  IdkInput,
  LLMAdapter,
  PromptMessage,
  ScoutInput,
  ScoutVerdict,
  TriageInput,
  TriageVerdict,
  TutorInput,
  WatchInput,
  WatchVerdict,
} from "./llm-adapter";

const GO_BASE_URL = "https://opencode.ai/zen/go/v1";
const ZEN_BASE_URL = "https://opencode.ai/zen/v1";
const USER_AGENT = "circlr-companion/0.1";
const DEFAULT_TEXT_MODEL = "deepseek-v4.1-flash";
const DEFAULT_VISION_MODEL = "deepseek-v4-flash-vision-exp";

// The vision model is a reasoning model: it spends completion tokens on hidden
// reasoning before emitting any content. A budget that is too small yields
// finish_reason=length with empty content, so vision calls need generous room.
const VISION_MAX_TOKENS = 6000;

const MIN_LEVEL = 0;
const MAX_LEVEL = 3;

function clampLevel(n: number): number {
  if (!Number.isFinite(n)) return MIN_LEVEL;
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(n)));
}

type TextPart = { type: "text"; text: string };
type ImagePart = { type: "image_url"; image_url: { url: string } };
type ContentPart = TextPart | ImagePart;

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

interface ChatCompletionResponse {
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | Array<{ text?: string }> };
  }>;
}

interface ChatOptions {
  model: string;
  maxTokens?: number;
  temperature?: number;
}

function baseUrl(): string {
  if (process.env.OPENCODE_BASE_URL) return process.env.OPENCODE_BASE_URL;
  const plan = process.env.CIRCLR_OPENCODE_PLAN ?? "go";
  return plan === "zen" ? ZEN_BASE_URL : GO_BASE_URL;
}

function toDataUrl(base64Jpeg: string): string {
  if (base64Jpeg.startsWith("data:")) return base64Jpeg;
  return `data:image/jpeg;base64,${base64Jpeg}`;
}

function userContent(instruction: string, image?: string): string | ContentPart[] {
  if (!image) return instruction;
  return [
    { type: "text", text: instruction },
    { type: "image_url", image_url: { url: toDataUrl(image) } },
  ];
}

function toPromptMessages(messages: ChatMessage[]): PromptMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content:
      typeof m.content === "string"
        ? m.content
        : m.content.map((part) => (part.type === "text" ? part.text : "[image]")).join("\n"),
  }));
}

function jsonSlices(raw: string): string[] {
  const slices: string[] = [];
  const objStart = raw.indexOf("{");
  const objEnd = raw.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) slices.push(raw.slice(objStart, objEnd + 1));
  const arrStart = raw.indexOf("[");
  const arrEnd = raw.lastIndexOf("]");
  if (arrStart >= 0 && arrEnd > arrStart) slices.push(raw.slice(arrStart, arrEnd + 1));
  return slices;
}

export function parseJsonLoose(raw: string): unknown {
  const trimmed = raw.trim();
  const attempts = new Set<string>([trimmed]);
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) attempts.add(fenced[1].trim());
  for (const slice of jsonSlices(trimmed)) attempts.add(slice);
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      // try the next candidate slice
    }
  }
  throw new Error("OpenCode Zen response was not valid JSON");
}

const ExtractResultSchema = z.object({
  questions: z.array(
    z.object({
      text: z.string().min(1),
      label: z.string().optional(),
    }),
  ),
});

const ScoutResultSchema = z.object({
  status: AssessmentStatusSchema,
  reasoning: z.string().min(1),
  escalate: z.boolean().optional(),
});

const TutorResultSchema = z.object({
  hint: z.string().min(1),
  level: z.number(),
  escalation: HintEscalationSchema,
});

const IdkResultSchema = z.object({
  hint: z.string().min(1),
});

const AnnotateResultSchema = z.object({
  annotations: z
    .array(
      z.discriminatedUnion("tool", [
        z.object({
          tool: z.literal("text"),
          x: z.number(),
          y: z.number(),
          source: z.string().min(1),
        }),
        z.object({
          tool: z.literal("shape"),
          shape: ShapeKindSchema,
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
        }),
        z.object({
          tool: z.literal("pen"),
          points: z.array(z.object({ x: z.number(), y: z.number() })).min(2),
        }),
      ])
    )
    .max(3),
});

const EXTRACT_SYSTEM = [
  "You extract exam questions from photos of student worksheets.",
  'Respond with strict JSON: {"questions":[{"label":"1a","text":"..."}]}.',
  "Scan the image top to bottom and return EVERY legible question and sub-part. There is no upper limit — do not stop early and do not omit the last exercise on the page.",
  "Each sub-part is its own question. Labels MUST mirror the print:",
  '- Exercise 1 with parts a) and b) → labels "1a" and "1b" (never bare "1","2","3" for those parts).',
  '- Exercise 5 with parts a) and b) → labels "5a" and "5b" (never a bare "5" when sub-parts exist).',
  '- A standalone "Question 2" or "Exercise 4" with no a)/b) → label "2" or "4".',
  "Keep each text field to one short identifying sentence (not the full problem statement).",
  "Never answer or solve. If no question is legible, return an empty array.",
].join(" ");

const SCOUT_SYSTEM = [
  "You are a fast assessment scout for a Socratic tutor.",
  "Given a worksheet question and a student's draft, judge how far the draft goes.",
  'Respond with strict JSON: {"status":"blocked|on-track|solid","reasoning":"one short sentence","escalate":true|false}.',
  "Use blocked when there is no attempt, the draft is too short to judge, or it looks like a pasted final answer.",
  "Use on-track when the direction is right but the reasoning is incomplete.",
  "Use solid when the draft states sound reasoning.",
  "Set escalate=true when the draft would benefit from a Socratic nudge right now (blocked or on-track); false when it is solid.",
  "Never write the answer or any solution step.",
].join(" ");

const TUTOR_SYSTEM = [
  "You are a Socratic tutor inside a study companion.",
  "Never give the final answer, a numeric result, or a completed solution.",
  "Ask one focused question or name one next step that moves the student forward.",
  "Follow the hint ladder: level 0 is the smallest nudge; level 3 is the most explicit guidance that still leaves the final step to the student.",
  'Respond with strict JSON: {"hint":"...","level":0-3,"escalation":"up|same|down"}.',
  "escalation is up when the student is stuck and needs more help than the current level, down when they reason well, same otherwise.",
].join(" ");

const ANNOTATE_SYSTEM = [
  "You mark a shared whiteboard beside a student working on a question.",
  "Propose at most 3 small additive annotations (a circle, an arrow, or a very short note) that point attention at the step to reconsider.",
  "Never erase, remove, move, or cover the student's work, and never write the final answer or a numeric result.",
  'Coordinates are in an 800x1200 canvas. Respond with strict JSON: {"annotations":[{"tool":"text","x":0,"y":0,"source":"short note"},{"tool":"shape","shape":"rect|ellipse|line|triangle","x":0,"y":0,"width":0,"height":0},{"tool":"pen","points":[{"x":0,"y":0}]}]}.',
  "Return an empty annotations array when no mark would help.",
].join(" ");

const IDK_SYSTEM = [
  "A student pressed \"I don't know\".",
  "Give the smallest possible unblock: restate the first sentence of the question back to them and ask them to say, in their own words, what it is asking.",
  "Never give the answer.",
  'Respond with strict JSON: {"hint":"..."}.',
].join(" ");

const WATCH_SYSTEM = [
  "You are a live watcher for a student's handwritten work on a whiteboard or worksheet.",
  "Look at the work in the image and the surrounding question/draft context.",
  'Respond with strict JSON: {"flag":true|false,"severity":"low|medium|high","ghostKey":"short-slug","reasoning":"one sentence"}.',
  "Set flag=false when the work is on track or not yet legible.",
  "When flag=true, severity reflects how serious the slip is and ghostKey is a short stable slug for the kind of slip (for example \"sign-error\" or \"unit-mismatch\") so repeats can be counted.",
  "Never provide the correction or the answer.",
].join(" ");

const TRIAGE_SYSTEM = [
  "You decide whether a newly captured screen image carries information a study session does not already have.",
  "You are given a digest of the session context (known question labels/count and capture count) and the new capture image.",
  'Respond with strict JSON: {"update":true|false,"reason":"one short sentence","novelty":"new-questions|new-material|none"}.',
  "Compare printed question labels in the image to the digest's labels list.",
  "Set update=true and novelty=new-questions when any legible question/sub-part label is missing from that list (for example digest has 1a,1b,1c but the image shows 4 or 5) — even on a small scroll of the same PDF.",
  "Set update=true and novelty=new-material when the frame shows new worked content or a new region without new question labels.",
  "Set update=false and novelty=none only when every legible question label is already listed and nothing material is new.",
  "When unsure, prefer update=true.",
  "Never restate, answer, or solve anything.",
].join(" ");

export interface OpenCodeAdapterOptions {
  apiKey?: string;
  textModel?: string;
  visionModel?: string;
  baseUrl?: string;
  sessionId?: string;
}

export class OpenCodeAdapter implements LLMAdapter {
  readonly name = "opencode";

  private sessionIdValue: string | undefined;

  constructor(private readonly options: OpenCodeAdapterOptions = {}) {}

  private apiKey(): string {
    const key = this.options.apiKey ?? process.env.OPENCODE_API;
    if (!key) {
      throw new Error("OPENCODE_API is not set; cannot use the OpenCode adapter");
    }
    return key;
  }

  private textModel(): string {
    return this.options.textModel ?? process.env.CIRCLR_MODEL ?? DEFAULT_TEXT_MODEL;
  }

  private visionModel(): string {
    return (
      this.options.visionModel ?? process.env.CIRCLR_VISION_MODEL ?? DEFAULT_VISION_MODEL
    );
  }

  private sessionId(): string {
    if (this.options.sessionId) return this.options.sessionId;
    if (process.env.OPENCODE_SESSION) return process.env.OPENCODE_SESSION;
    this.sessionIdValue ??= randomUUID();
    return this.sessionIdValue;
  }

  private async chat(messages: ChatMessage[], opts: ChatOptions): Promise<string> {
    const res = await fetch(`${this.options.baseUrl ?? baseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey()}`,
        "user-agent": USER_AGENT,
        "x-opencode-session": this.sessionId(),
      },
      body: JSON.stringify({
        model: opts.model,
        messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 700,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `OpenCode request failed (${res.status}) for ${opts.model}: ${detail.slice(0, 300)}`
      );
    }
    const data = (await res.json()) as ChatCompletionResponse;
    const choice = data?.choices?.[0];
    const content = choice?.message?.content;
    const text =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.map((part) => part.text ?? "").join("")
          : "";
    if (!text.trim()) {
      throw new Error(
        `OpenCode returned an empty completion for ${opts.model} (finish_reason=${choice?.finish_reason ?? "unknown"})`
      );
    }
    return text;
  }

  private async jsonCall<T>(messages: ChatMessage[], opts: ChatOptions, schema: z.ZodType<T>): Promise<T> {
    const raw = await this.chat(messages, opts);
    // TEMP: raw completion capture for E2E inspection. Remove after.
    const g = globalThis as unknown as { __circlrRaw?: unknown[] };
    (g.__circlrRaw ??= []).push({
      at: Date.now(),
      model: opts.model,
      system: messages.find((m) => m.role === "system")?.content,
      messages,
      raw,
    });
    const parsed = schema.safeParse(parseJsonLoose(raw));
    if (!parsed.success) {
      throw new Error(`OpenCode Zen returned malformed output: ${parsed.error.message}`);
    }
    return parsed.data;
  }

  async extract(input: ExtractInput): Promise<ExtractedQuestion[]> {
    const known =
      input.knownLabels && input.knownLabels.length > 0
        ? `Already extracted labels (keep returning them if still visible; also add any new ones): ${input.knownLabels.join(", ")}.`
        : "No questions extracted yet.";
    const data = await this.jsonCall(
      [
        { role: "system", content: EXTRACT_SYSTEM },
        {
          role: "user",
          content: userContent(
            [
              "Extract every question and sub-part visible in this worksheet image, top to bottom.",
              "Do not cap the list — include later exercises and their a)/b) children (for example 5a and 5b) when they appear.",
              "Finish the page: if Exercise 5 is visible, its sub-parts must appear in the JSON.",
              known,
            ].join(" "),
            input.image
          ),
        },
      ],
      { model: this.visionModel(), maxTokens: VISION_MAX_TOKENS },
      ExtractResultSchema
    );
    const labels = composeQuestionLabels(
      data.questions.map((q) => ({ label: q.label, text: q.text.trim() })),
    );
    return data.questions.map((q, index) => {
      const text = q.text.trim();
      const label = labels[index] ?? String(index + 1);
      return {
        id: stableQuestionId(label, text),
        index,
        text,
        label,
      };
    });
  }

  async scout(input: ScoutInput): Promise<ScoutVerdict> {
    const question = (input.questionText ?? "").trim() || "(question text unavailable)";
    const draft = (input.draftText ?? "").trim() || "(no attempt yet)";
    const instruction = `Question:\n${question}\n\nStudent draft:\n${draft}`;
    const data = await this.jsonCall(
      [
        { role: "system", content: SCOUT_SYSTEM },
        { role: "user", content: userContent(instruction, input.image) },
      ],
      {
        model: input.image ? this.visionModel() : this.textModel(),
        maxTokens: input.image ? VISION_MAX_TOKENS : 600,
      },
      ScoutResultSchema
    );
    return {
      status: data.status,
      reasoning: data.reasoning,
      escalate: data.escalate ?? data.status !== "solid",
    };
  }

  async triage(input: TriageInput): Promise<TriageVerdict> {
    const context = input.contextSummary?.trim() || "(no context captured yet)";
    const instruction = input.image
      ? `Session context digest:\n${context}\n\nDecide whether the attached capture adds new information.`
      : `No image was attached; assess from the context only.\n\nSession context digest:\n${context}`;
    return this.jsonCall(
      [
        { role: "system", content: TRIAGE_SYSTEM },
        { role: "user", content: userContent(instruction, input.image) },
      ],
      { model: this.visionModel(), maxTokens: VISION_MAX_TOKENS },
      TriageVerdictSchema
    );
  }

  async tutor(input: TutorInput): Promise<TutorTurn> {
    const currentLevel = clampLevel(input.currentLevel);
    const history =
      input.threadHistory
        .slice(-4)
        .map((turn) => `[level ${turn.level}, ${turn.escalation}] ${turn.hint}`)
        .join("\n") || "(no prior turns)";
    const lines = [
      `Question:\n${input.questionText}`,
      `Student draft:\n${(input.draftText ?? "").trim() || "(no attempt yet)"}`,
      `Current hint level: ${currentLevel}`,
      `Prior turns:\n${history}`,
    ];
    if (input.message) lines.push(`Student asks:\n${input.message}`);
    if (input.image) {
      lines.push(
        "The student's work is attached as an image; ground your question in what it actually shows."
      );
    }

    const messages: ChatMessage[] = [
      { role: "system", content: TUTOR_SYSTEM },
      { role: "user", content: userContent(lines.join("\n\n"), input.image) },
    ];
    const data = await this.jsonCall(
      messages,
      {
        model: input.image ? this.visionModel() : this.textModel(),
        maxTokens: input.image ? VISION_MAX_TOKENS : 900,
      },
      TutorResultSchema
    );
    input.onPrompt?.(toPromptMessages(messages));
    const hint = data.hint.trim();
    if (looksLikeFinalAnswer(hint)) {
      throw new Error("OpenCodeAdapter invariant violated: tutor hint looks like a final answer");
    }
    return {
      questionId: input.questionId,
      hint,
      level: clampLevel(data.level),
      escalation: input.message ? "same" : data.escalation,
    };
  }

  async watch(input: WatchInput): Promise<WatchVerdict> {
    const context = [
      `Page index: ${input.pageIndex}`,
      input.questionText ? `Question:\n${input.questionText}` : "",
      input.draftText ? `Student draft:\n${input.draftText}` : "",
      typeof input.recurrenceCount === "number"
        ? `This kind of slip has been flagged ${input.recurrenceCount} time(s) before.`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const instruction = input.image
      ? `Inspect the student's visible work in the image.\n\n${context}`
      : `No image was attached; assess from the context only.\n\n${context}`;
    return this.jsonCall(
      [
        { role: "system", content: WATCH_SYSTEM },
        { role: "user", content: userContent(instruction, input.image) },
      ],
      { model: this.visionModel(), maxTokens: VISION_MAX_TOKENS },
      WatchVerdictSchema
    );
  }

  async idk(input: IdkInput): Promise<TutorTurn> {
    const question = (input.questionText ?? "").trim() || "(question text unavailable)";
    const messages: ChatMessage[] = [
      { role: "system", content: IDK_SYSTEM },
      { role: "user", content: userContent(`Question:\n${question}`, input.image) },
    ];
    const data = await this.jsonCall(
      messages,
      {
        model: input.image ? this.visionModel() : this.textModel(),
        maxTokens: input.image ? VISION_MAX_TOKENS : 600,
      },
      IdkResultSchema
    );
    input.onPrompt?.(toPromptMessages(messages));
    const hint = data.hint.trim();
    if (looksLikeFinalAnswer(hint)) {
      throw new Error("OpenCodeAdapter invariant violated: idk hint looks like a final answer");
    }
    return {
      questionId: input.questionId,
      hint,
      level: 0,
      escalation: "same",
    };
  }

  async annotate(input: AnnotateInput): Promise<BoardAnnotationTurn[]> {
    const boardSummary =
      input.board.length > 0
        ? input.board.map((el) => `${el.tool}:${el.id}`).join(", ")
        : "(empty canvas)";
    const lines = [
      `Question:\n${(input.questionText ?? "").trim() || "(none)"}`,
      `Student draft:\n${(input.draftText ?? "").trim() || "(no attempt yet)"}`,
    ];
    if (input.hint) lines.push(`Tutor hint:\n${input.hint}`);
    if (input.message) lines.push(`Student asks:\n${input.message}`);
    lines.push(`Canvas elements:\n${boardSummary}`);

    const messages: ChatMessage[] = [
      { role: "system", content: ANNOTATE_SYSTEM },
      { role: "user", content: lines.join("\n\n") },
    ];
    const data = await this.jsonCall(
      messages,
      { model: this.textModel(), maxTokens: 500 },
      AnnotateResultSchema
    );
    input.onPrompt?.(toPromptMessages(messages));

    return data.annotations.map((annotation): BoardAnnotationTurn => {
      const id = `tutor-${annotation.tool}-${randomUUID()}`;
      if (annotation.tool === "text") {
        return {
          kind: "board-text",
          element: {
            id,
            author: "tutor",
            x: annotation.x,
            y: annotation.y,
            source: annotation.source,
          },
        };
      }
      if (annotation.tool === "shape") {
        return {
          kind: "board-shape",
          element: {
            id,
            author: "tutor",
            shape: annotation.shape,
            x: annotation.x,
            y: annotation.y,
            width: annotation.width,
            height: annotation.height,
          },
        };
      }
      return {
        kind: "board-pen",
        element: { id, author: "tutor", points: annotation.points },
      };
    });
  }
}

export const opencodeAdapter = new OpenCodeAdapter();

export const __testing = { parseJsonLoose, clampLevel, userContent };
