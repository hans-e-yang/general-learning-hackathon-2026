import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("/health GET", () => {
  it("reports ok without a session", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
