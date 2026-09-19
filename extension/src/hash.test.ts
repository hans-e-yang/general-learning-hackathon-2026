import { describe, expect, it } from "vitest";
import {
  HAMMING_THRESHOLD,
  HASH_HEX_LEN,
  averageHash,
  hammingDistanceHex,
  isDuplicate
} from "./hash.js";

const SIZE = 32;

function gray32(fill: (x: number, y: number) => number): Uint8Array {
  const pixels = new Uint8Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) pixels[y * SIZE + x] = fill(x, y);
  }
  return pixels;
}

describe("averageHash", () => {
  it("emits 16 lowercase hex chars", () => {
    const hash = averageHash(gray32((x) => x * 8), SIZE, SIZE);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(hash).toHaveLength(HASH_HEX_LEN);
  });

  it("is stable for identical frames", () => {
    const a = averageHash(gray32((x, y) => (x + y) * 4), SIZE, SIZE);
    const b = averageHash(gray32((x, y) => (x + y) * 4), SIZE, SIZE);
    expect(a).toBe(b);
    expect(hammingDistanceHex(a, b)).toBe(0);
  });

  it("hashes a uniform frame to all zero bits", () => {
    expect(averageHash(gray32(() => 128), SIZE, SIZE)).toBe("0000000000000000");
  });

  it("keeps a tiny perturbation within the duplicate threshold", () => {
    const base = gray32((x) => x * 8);
    const nudged = gray32((x) => x * 8);
    nudged[0] = 255;
    const distance = hammingDistanceHex(
      averageHash(base, SIZE, SIZE),
      averageHash(nudged, SIZE, SIZE)
    );
    expect(distance).toBeLessThan(HAMMING_THRESHOLD);
  });

  it("separates an inverted frame", () => {
    const distance = hammingDistanceHex(
      averageHash(gray32((x) => x * 8), SIZE, SIZE),
      averageHash(gray32((x) => 255 - x * 8), SIZE, SIZE)
    );
    expect(distance).toBeGreaterThanOrEqual(HAMMING_THRESHOLD);
  });

  it("rejects malformed buffers", () => {
    expect(averageHash(new Uint8Array(0), SIZE, SIZE)).toBe("");
  });
});

describe("hammingDistanceHex", () => {
  it("counts differing bits", () => {
    expect(hammingDistanceHex("0", "f")).toBe(4);
    expect(hammingDistanceHex("00", "ff")).toBe(8);
    expect(hammingDistanceHex("0000000000000000", "0000000000000001")).toBe(1);
  });
});

describe("isDuplicate", () => {
  it("treats an unfingerprintable capture as a duplicate", () => {
    expect(isDuplicate("", ["0000000000000000"])).toBe(true);
  });

  it("matches near hashes and rejects far ones", () => {
    const recent = ["0000000000000000"];
    expect(isDuplicate("0000000000000001", recent)).toBe(true);
    expect(isDuplicate("ffffffffffffffff", recent)).toBe(false);
  });
});
