type SessionMode = "assignment" | "review";

// Frozen cross-app contract (extension/README.md): POST /session → { uuid }.
type SessionResponse = {
  uuid: string;
  mode: SessionMode;
};

const DEMO_SESSION_UUID = "00000000-0000-0000-0000-000000000000";

function isSessionMode(value: unknown): value is SessionMode {
  return value === "assignment" || value === "review";
}

function makeSession(uuid: string, mode: SessionMode): SessionResponse {
  return { uuid, mode };
}

export async function GET() {
  return Response.json(makeSession(DEMO_SESSION_UUID, "assignment"));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const mode = isSessionMode(body?.mode) ? body.mode : "assignment";

  return Response.json(makeSession(crypto.randomUUID(), mode), { status: 201 });
}
