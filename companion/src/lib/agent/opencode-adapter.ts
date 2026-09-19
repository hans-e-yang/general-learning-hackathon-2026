import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  AssessmentStatusSchema,
  HintEscalationSchema,
  WatchVerdictSchema,
  type ExtractedQuestion,
  type TutorTurn,
} from "@/lib/contracts";
import { normalizeQuestionLabel } from "@/lib/questionLabel";
import { looksLikeFinalAnswer } from "./answer-guard";
import type {
  ExtractInput,
  IdkInput,
  LLMAdapter,
  ScoutInput,
  ScoutVerdict,
  TutorInput,
  WatchInput,
  WatchVerdict,
} from "./llm-adapter";

const GO_BASE_URL = "https://opencode.ai/zen/go/v1";
const ZEN_BASE_URL = "https://opencode.ai/zen/v1";
const USER_AGENT = "circlr-companion/0.1";
const DEFAULT_TEXT_MODEL = "deepseek-v4.1-flash";
const DEFAULT_VISION_MODEL = "deepseek-v4-flash-vision-exp";

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
});

const TutorResultSchema = z.object({
  hint: z.string().min(1),
  level: z.number(),
  escalation: HintEscalationSchema,
});

const IdkResultSchema = z.object({
  hint: z.string().min(1),
});

const EXTRACT_SYSTEM = [
  "You extract exam questions from photos of student worksheets.",
  'Respond with strict JSON: {"questions":[{"label":"1a","text":"..."}]}.',
  "Use the printed question number/letter as label (e.g. 1, 1a, 2b). Treat sub-parts as separate questions.",
  "Transcribe each question faithfully in reading order; never answer, solve, or paraphrase.",
  "If no question is legible, return an empty array.",
].join(" ");

const SCOUT_SYSTEM = [
  "You are a fast assessment scout for a Socratic tutor.",
  "Given a worksheet question and a student's draft, judge how far the draft goes.",
  'Respond with strict JSON: {"status":"blocked|on-track|solid","reasoning":"one short sentence"}.',
  "Use blocked when there is no attempt, the draft is too short to judge, or it looks like a pasted final answer.",
  "Use on-track when the direction is right but the reasoning is incomplete.",
  "Use solid when the draft states sound reasoning.",
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
    const parsed = schema.safeParse(parseJsonLoose(raw));
    if (!parsed.success) {
      throw new Error(`OpenCode Zen returned malformed output: ${parsed.error.message}`);
    }
    return parsed.data;
  }

  async extract(input: ExtractInput): Promise<ExtractedQuestion[]> {
    const data = await this.jsonCall(
      [
        { role: "system", content: EXTRACT_SYSTEM },
        {
          role: "user",
          content: userContent(
            "Extract every question visible on this page of the worksheet.",
            input.image
          ),
        },
      ],
      { model: this.visionModel(), maxTokens: 1400 },
      ExtractResultSchema
    );
    return data.questions.map((q, index) => ({
      id: `q-p${input.pageIndex}-${index}`,
      index,
      text: q.text.trim(),
      label: normalizeQuestionLabel(q.label, index),
    }));
  }

  async scout(input: ScoutInput): Promise<ScoutVerdict> {
    const question = (input.questionText ?? "").trim() || "(question text unavailable)";
    const draft = (input.draftText ?? "").trim() || "(no attempt yet)";
    return this.jsonCall(
      [
        { role: "system", content: SCOUT_SYSTEM },
        { role: "user", content: `Question:\n${question}\n\nStudent draft:\n${draft}` },
      ],
      { model: this.textModel(), maxTokens: 600 },
      ScoutResultSchema
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

    const data = await this.jsonCall(
      [
        { role: "system", content: TUTOR_SYSTEM },
        { role: "user", content: lines.join("\n\n") },
      ],
      { model: this.textModel(), maxTokens: 900 },
      TutorResultSchema
    );
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
      { model: this.visionModel(), maxTokens: 600 },
      WatchVerdictSchema
    );
  }

  async idk(input: IdkInput): Promise<TutorTurn> {
    const question = (input.questionText ?? "").trim() || "(question text unavailable)";
    const data = await this.jsonCall(
      [
        { role: "system", content: IDK_SYSTEM },
        { role: "user", content: `Question:\n${question}` },
      ],
      { model: this.textModel(), maxTokens: 600 },
      IdkResultSchema
    );
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
}

export const opencodeAdapter = new OpenCodeAdapter();

export const __testing = { parseJsonLoose, clampLevel, userContent };
