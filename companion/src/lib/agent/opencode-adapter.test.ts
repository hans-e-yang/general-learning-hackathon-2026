import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAdapter } from "./index";
import { OpenCodeAdapter, __testing } from "./opencode-adapter";

const ENV_KEYS = [
  "CIRCLR_LLM",
  "OPENCODE_API",
  "CIRCLR_MODEL",
  "CIRCLR_VISION_MODEL",
  "OPENCODE_BASE_URL",
  "OPENCODE_SESSION",
  "CIRCLR_OPENCODE_PLAN",
] as const;

function completion(content: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        { message: { content: typeof content === "string" ? content : JSON.stringify(content) } },
      ],
    }),
    text: async () => "",
  } as unknown as Response;
}

function adapter(overrides: Partial<ConstructorParameters<typeof OpenCodeAdapter>[0]> = {}) {
  return new OpenCodeAdapter({
    apiKey: "test-key",
    textModel: "test-text",
    visionModel: "test-vision",
    baseUrl: "https://example.test/zen/v1",
    ...overrides,
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("agent/getAdapter", () => {
  it("defaults to the fake adapter", () => {
    expect(getAdapter().name).toBe("fake");
  });

  it("selects the OpenCode adapter when CIRCLR_LLM=opencode", () => {
    process.env.CIRCLR_LLM = "opencode";
    expect(getAdapter().name).toBe("opencode");
  });
});

describe("opencode-adapter/request shape", () => {
  it("posts JSON to Zen with bearer auth and the configured model", async () => {
    fetchMock.mockResolvedValueOnce(
      completion({ status: "on-track", reasoning: "right direction" })
    );
    await adapter().scout({ captureHash: "h", pageIndex: 0, draftText: "therefore x=1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.test/zen/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("test-text");
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("defaults to the OpenCode Go base URL", async () => {
    fetchMock.mockResolvedValueOnce(
      completion({ status: "on-track", reasoning: "right direction" })
    );
    await new OpenCodeAdapter({ apiKey: "test-key" }).scout({
      captureHash: "h",
      pageIndex: 0,
      draftText: "therefore x=1",
    });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://opencode.ai/zen/go/v1/chat/completions");
  });

  it("uses the Zen base URL when CIRCLR_OPENCODE_PLAN=zen", async () => {
    process.env.CIRCLR_OPENCODE_PLAN = "zen";
    fetchMock.mockResolvedValueOnce(
      completion({ status: "on-track", reasoning: "right direction" })
    );
    await new OpenCodeAdapter({ apiKey: "test-key" }).scout({
      captureHash: "h",
      pageIndex: 0,
      draftText: "therefore x=1",
    });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://opencode.ai/zen/v1/chat/completions");
  });

  it("identifies itself with a user agent and stable Go session header", async () => {
    fetchMock.mockResolvedValueOnce(
      completion({ status: "on-track", reasoning: "right direction" })
    );
    await adapter({ sessionId: "sess-1" }).scout({
      captureHash: "h",
      pageIndex: 0,
      draftText: "therefore x=1",
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["user-agent"]).toMatch(/^circlr-companion\//);
    expect(headers["x-opencode-session"]).toBe("sess-1");
  });

  it("throws a clear error when OPENCODE_API is missing", async () => {
    await expect(
      new OpenCodeAdapter({ baseUrl: "https://example.test/zen/v1" }).scout({
        captureHash: "h",
        pageIndex: 0,
        draftText: "x",
      })
    ).rejects.toThrow(/OPENCODE_API/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("opencode-adapter/extract", () => {
  it("sends the capture image as a data URL to the vision model and mints stable IDs", async () => {
    fetchMock.mockResolvedValueOnce(
      completion({ questions: [{ text: "  Solve for x.  " }, { text: "Find the limit." }] })
    );

    const result = await adapter().extract({
      captureHash: "feedfacec0ffee01",
      pageIndex: 2,
      image: "Zm9v",
    });

    expect(result).toEqual([
      { id: "q-1", index: 0, text: "Solve for x.", label: "1" },
      { id: "q-2", index: 1, text: "Find the limit.", label: "2" },
    ]);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe("test-vision");
    const parts = body.messages[1].content as Array<Record<string, unknown>>;
    expect(parts[0]).toMatchObject({ type: "text" });
    expect(parts[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,Zm9v" },
    });
  });

  it("includes known labels in the extract user prompt when provided", async () => {
    fetchMock.mockResolvedValueOnce(
      completion({ questions: [{ label: "4", text: "Exercise 4." }] })
    );
    await adapter().extract({
      captureHash: "h",
      pageIndex: 0,
      image: "Zm9v",
      knownLabels: ["1a", "1b", "1c"],
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const parts = body.messages[1].content as Array<Record<string, unknown>>;
    expect(parts[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("1a, 1b, 1c"),
    });
    expect(parts[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("5a and 5b"),
    });
  });

  it("omits the image part when no capture image is provided", async () => {
    fetchMock.mockResolvedValueOnce(completion({ questions: [] }));
    await adapter().extract({ captureHash: "h", pageIndex: 0 });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(typeof body.messages[1].content).toBe("string");
  });
});

describe("opencode-adapter/tutor", () => {
  it("clamps an out-of-range level and returns the questionId", async () => {
    fetchMock.mockResolvedValueOnce(
      completion({ hint: "Name the quantity you are solving for.", level: 9, escalation: "up" })
    );
    const turn = await adapter().tutor({
      questionId: "q1",
      questionText: "Solve for x.",
      threadHistory: [],
      currentLevel: 0,
    });
    expect(turn).toEqual({
      questionId: "q1",
      hint: "Name the quantity you are solving for.",
      level: 3,
      escalation: "up",
    });
  });

  it("forces escalation to `same` when the student asked a question", async () => {
    fetchMock.mockResolvedValueOnce(
      completion({ hint: "What does the symbol mean?", level: 1, escalation: "up" })
    );
    const turn = await adapter().tutor({
      questionId: "q1",
      questionText: "Solve for x.",
      threadHistory: [],
      currentLevel: 0,
      message: "what does this symbol mean?",
    });
    expect(turn.escalation).toBe("same");
  });

  it("rejects a hint that looks like a final answer", async () => {
    fetchMock.mockResolvedValueOnce(
      completion({ hint: "The answer is 42.", level: 3, escalation: "up" })
    );
    await expect(
      adapter().tutor({ questionId: "q1", questionText: "x", threadHistory: [], currentLevel: 0 })
    ).rejects.toThrow(/final answer/);
  });

  it("rejects malformed JSON from the model", async () => {
    fetchMock.mockResolvedValueOnce(completion("not json at all"));
    await expect(
      adapter().tutor({ questionId: "q1", questionText: "x", threadHistory: [], currentLevel: 0 })
    ).rejects.toThrow(/not valid JSON/);
  });
});

describe("opencode-adapter/turn images", () => {
  const IMG = "Zm9vYmFy";

  it("uses the vision model and attaches the image to the tutor request", async () => {
    fetchMock.mockResolvedValueOnce(
      completion({ hint: "Look at step 2.", level: 1, escalation: "same" })
    );
    await adapter().tutor({
      questionId: "q1",
      questionText: "Solve for x.",
      threadHistory: [],
      currentLevel: 0,
      image: IMG,
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe("test-vision");
    expect(JSON.stringify(body.messages)).toContain("data:image/jpeg;base64,Zm9vYmFy");
  });

  it("stays on the text model for tutor when no image is attached", async () => {
    fetchMock.mockResolvedValueOnce(
      completion({ hint: "Look at step 2.", level: 1, escalation: "same" })
    );
    await adapter().tutor({
      questionId: "q1",
      questionText: "Solve for x.",
      threadHistory: [],
      currentLevel: 0,
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe("test-text");
  });

  it("uses the vision model for scout when an image is attached", async () => {
    fetchMock.mockResolvedValueOnce(
      completion({ status: "on-track", reasoning: "right direction" })
    );
    await adapter().scout({
      captureHash: "h",
      pageIndex: 0,
      draftText: "therefore x=1",
      image: IMG,
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe("test-vision");
  });

  it("uses the vision model for idk when an image is attached", async () => {
    fetchMock.mockResolvedValueOnce(completion({ hint: "What is it asking?" }));
    await adapter().idk({ questionId: "q1", questionText: "x", image: IMG });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe("test-vision");
  });
});

describe("opencode-adapter/scout + watch + idk", () => {
  it("validates the scout status enum", async () => {
    fetchMock.mockResolvedValueOnce(completion({ status: "bogus", reasoning: "x" }));
    await expect(
      adapter().scout({ captureHash: "h", pageIndex: 0, draftText: "x" })
    ).rejects.toThrow(/malformed output/);
  });

  it("passes the image to the vision model for watch", async () => {
    fetchMock.mockResolvedValueOnce(
      completion({ flag: true, severity: "high", ghostKey: "sign-error", reasoning: "sign flipped" })
    );
    const verdict = await adapter().watch({
      captureHash: "feedfacec0ffee01",
      pageIndex: 0,
      image: "Zm9v",
      recurrenceCount: 1,
    });
    expect(verdict).toEqual({
      flag: true,
      severity: "high",
      ghostKey: "sign-error",
      reasoning: "sign flipped",
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe("test-vision");
  });

  it("returns a level-0 turn from idk", async () => {
    fetchMock.mockResolvedValueOnce(completion({ hint: "What is the question asking?" }));
    const turn = await adapter().idk({ questionId: "q1", questionText: "Why does sin x / x -> 1?" });
    expect(turn).toEqual({
      questionId: "q1",
      hint: "What is the question asking?",
      level: 0,
      escalation: "same",
    });
  });

  it("derives escalate=true for a non-solid scout status when the model omits it (#29)", async () => {
    fetchMock.mockResolvedValueOnce(
      completion({ status: "on-track", reasoning: "right direction" })
    );
    const verdict = await adapter().scout({
      captureHash: "h",
      pageIndex: 0,
      draftText: "therefore x = 1",
    });
    expect(verdict.escalate).toBe(true);
  });

  it("honors an explicit escalate=false from the model", async () => {
    fetchMock.mockResolvedValueOnce(
      completion({ status: "solid", reasoning: "sound", escalate: false })
    );
    const verdict = await adapter().scout({
      captureHash: "h",
      pageIndex: 0,
      draftText: "by definition, therefore, hence",
    });
    expect(verdict.escalate).toBe(false);
  });
});

describe("opencode-adapter/annotate (canvas tools)", () => {
  it("maps model annotations to tutor-authored board turns", async () => {
    fetchMock.mockResolvedValueOnce(
      completion({
        annotations: [
          { tool: "shape", shape: "ellipse", x: 10, y: 20, width: 30, height: 40 },
          { tool: "text", x: 1, y: 2, source: "re-check this step" },
        ],
      })
    );

    const turns = await adapter().annotate({
      questionId: "q1",
      questionText: "x?",
      board: [],
    });

    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({
      kind: "board-shape",
      element: { author: "tutor", shape: "ellipse", width: 30, height: 40 },
    });
    expect(turns[1]).toMatchObject({
      kind: "board-text",
      element: { author: "tutor", source: "re-check this step" },
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe("test-text");
  });

  it("returns an empty list when the model proposes no marks", async () => {
    fetchMock.mockResolvedValueOnce(completion({ annotations: [] }));
    const turns = await adapter().annotate({ questionText: "x?", board: [] });
    expect(turns).toEqual([]);
  });

  it("rejects a malformed annotation payload", async () => {
    fetchMock.mockResolvedValueOnce(
      completion({ annotations: [{ tool: "shape", x: 1 }] })
    );
    await expect(adapter().annotate({ questionText: "x?", board: [] })).rejects.toThrow(
      /malformed output/
    );
  });
});

describe("opencode-adapter/triage (#28)", () => {
  it("sends the capture image to the vision model and validates the verdict", async () => {
    fetchMock.mockResolvedValueOnce(
      completion({ update: true, reason: "new questions", novelty: "new-questions" })
    );
    const verdict = await adapter().triage({
      captureHash: "feedfacec0ffee01",
      pageIndex: 0,
      image: "Zm9v",
      contextSummary: "questions=0; captures=0",
    });
    expect(verdict).toEqual({
      update: true,
      reason: "new questions",
      novelty: "new-questions",
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe("test-vision");
    const parts = body.messages[1].content as Array<Record<string, unknown>>;
    expect(parts[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,Zm9v" },
    });
  });

  it("accepts a no-update verdict with no novelty", async () => {
    fetchMock.mockResolvedValueOnce(
      completion({ update: false, reason: "same page as before" })
    );
    const verdict = await adapter().triage({ captureHash: "h", pageIndex: 0 });
    expect(verdict).toEqual({ update: false, reason: "same page as before" });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(typeof body.messages[1].content).toBe("string");
  });

  it("rejects a malformed triage verdict", async () => {
    fetchMock.mockResolvedValueOnce(completion({ novelty: "none" }));
    await expect(adapter().triage({ captureHash: "h", pageIndex: 0 })).rejects.toThrow(
      /malformed output/
    );
  });
});

describe("opencode-adapter/parseJsonLoose", () => {
  it("unwraps fenced JSON", () => {
    expect(__testing.parseJsonLoose('```json\n{"flag":false,"reasoning":"ok"}\n```')).toEqual({
      flag: false,
      reasoning: "ok",
    });
  });

  it("recovers JSON embedded in prose", () => {
    expect(__testing.parseJsonLoose('Sure! {"status":"solid","reasoning":"sound"} done')).toEqual({
      status: "solid",
      reasoning: "sound",
    });
  });

  it("throws when no JSON is present", () => {
    expect(() => __testing.parseJsonLoose("nothing to see")).toThrow(/not valid JSON/);
  });
});
