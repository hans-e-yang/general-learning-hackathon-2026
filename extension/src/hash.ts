// Perceptual capture fingerprint for dedupe. Pure: no chrome.*, no DOM — the
// browser decode lives in capture-image.ts. Spec #2 words this as "32x32
// grayscale, average hash"; the frozen contract (#10) requires exactly 16 hex
// chars, so the 32x32 grayscale is box-pooled down to an 8x8 aHash (64 bits ->
// 16 hex). Hamming < 4 over 64 bits is the threshold the spec's number implies.

// Pooled grid edge, i.e. the hash is HASH_BITS x HASH_BITS bits.
export const HASH_BITS = 8;
export const HASH_HEX_LEN = (HASH_BITS * HASH_BITS) / 4;
// How many recent hashes a capture is compared against. Larger than the spec's
// original 5 so switching back and forth between tabs does not re-upload a frame
// that is still recent.
export const RECENT_HASH_LIMIT = 32;
// A capture whose hash is within this Hamming distance of a recent one is a dupe.
export const HAMMING_THRESHOLD = 4;

// Grayscale (luma) average hash. `gray` is width*height bytes; the image is
// box-averaged into HASH_BITS x HASH_BITS cells, then each cell becomes a bit
// that is 1 when it exceeds the mean brightness of the grid. Row-major.
export function averageHash(gray: Uint8Array, width: number, height: number): string {
  if (width <= 0 || height <= 0 || gray.length < width * height) return "";
  const cells = new Float64Array(HASH_BITS * HASH_BITS);
  for (let cy = 0; cy < HASH_BITS; cy++) {
    const y0 = Math.floor((cy * height) / HASH_BITS);
    const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * height) / HASH_BITS));
    for (let cx = 0; cx < HASH_BITS; cx++) {
      const x0 = Math.floor((cx * width) / HASH_BITS);
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * width) / HASH_BITS));
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          sum += gray[y * width + x];
          n++;
        }
      }
      cells[cy * HASH_BITS + cx] = n > 0 ? sum / n : 0;
    }
  }
  let mean = 0;
  for (let i = 0; i < cells.length; i++) mean += cells[i];
  mean /= cells.length;
  let hex = "";
  for (let nibble = 0; nibble < HASH_HEX_LEN; nibble++) {
    let value = 0;
    for (let bit = 0; bit < 4; bit++) {
      const idx = nibble * 4 + bit;
      value = (value << 1) | (cells[idx] > mean ? 1 : 0);
    }
    hex += value.toString(16);
  }
  return hex;
}

// Bit distance between two equal-length hex fingerprints. Shorter/absent digits
// are treated as 0 so a malformed hash degrades to "maximally different".
export function hammingDistanceHex(a: string, b: string): number {
  const len = Math.max(a.length, b.length);
  let distance = 0;
  for (let i = 0; i < len; i++) {
    const xor = (parseInt(a[i] ?? "0", 16) || 0) ^ (parseInt(b[i] ?? "0", 16) || 0);
    distance += (xor & 1) + ((xor >> 1) & 1) + ((xor >> 2) & 1) + ((xor >> 3) & 1);
  }
  return distance;
}

// Is `hash` a near-duplicate of anything in the rolling window? An empty hash
// means the capture could not be fingerprinted, so it is treated as a duplicate
// rather than sent to a backend that would reject it.
export function isDuplicate(
  hash: string,
  recent: readonly string[],
  threshold: number = HAMMING_THRESHOLD
): boolean {
  if (!hash) return true;
  return recent.some((previous) => hammingDistanceHex(hash, previous) < threshold);
}
