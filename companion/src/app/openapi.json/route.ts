import { readFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

export const runtime = "nodejs";

let cached: { json: unknown; generatedAt: number } | null = null;

async function loadSpec(): Promise<unknown> {
  const file = path.join(process.cwd(), "openapi.yaml");
  const text = await readFile(file, "utf8");
  return yaml.load(text, { schema: yaml.JSON_SCHEMA });
}

export async function GET() {
  if (!cached) {
    const parsed = await loadSpec();
    cached = { json: parsed, generatedAt: Date.now() };
  }
  return Response.json(cached.json, {
    headers: {
      "cache-control": "no-store",
      "x-contracts-generated-at": String(cached.generatedAt),
    },
  });
}
