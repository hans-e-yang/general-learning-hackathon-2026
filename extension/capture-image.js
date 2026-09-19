// Browser-only capture transforms. The pure logic lives in hash.ts; this file
// is the thin impure seam that talks to the browser image APIs and is exercised
// by the running extension, not by unit tests.
//
// IMPORTANT: this runs in an MV3 service worker, where window-only APIs such as
// `Image`/`HTMLImageElement` do not exist. Decoding must go through
// `createImageBitmap` + `OffscreenCanvas`.
//
// `processCapture` returns bare base64 (no `data:` prefix) to match the frozen
// #10 contract, alongside the 32x32 -> 8x8 average hash of the same frame.
import { averageHash } from "./hash.js";
const TARGET_WIDTH = 1280;
const JPEG_QUALITY = 0.7;
const HASH_SIZE = 32;
async function decode(dataUrl) {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return createImageBitmap(blob);
}
function bytesToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}
// Downscale to 1280px wide (never upscale), re-encode as JPEG q=0.7, and hash the
// same frame. One decode for both outputs.
export async function processCapture(dataUrl) {
    const bitmap = await decode(dataUrl);
    try {
        const scale = Math.min(1, TARGET_WIDTH / bitmap.width);
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const jpegCanvas = new OffscreenCanvas(width, height);
        const jpegCtx = jpegCanvas.getContext("2d");
        if (!jpegCtx)
            throw new Error("2d context unavailable");
        jpegCtx.drawImage(bitmap, 0, 0, width, height);
        const blob = await jpegCanvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
        const image = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
        const hashCanvas = new OffscreenCanvas(HASH_SIZE, HASH_SIZE);
        const hashCtx = hashCanvas.getContext("2d");
        if (!hashCtx)
            throw new Error("2d context unavailable");
        hashCtx.drawImage(bitmap, 0, 0, HASH_SIZE, HASH_SIZE);
        const { data } = hashCtx.getImageData(0, 0, HASH_SIZE, HASH_SIZE);
        const gray = new Uint8Array(HASH_SIZE * HASH_SIZE);
        for (let i = 0; i < gray.length; i++) {
            gray[i] = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
        }
        return { image, hash: averageHash(gray, HASH_SIZE, HASH_SIZE) };
    }
    finally {
        bitmap.close();
    }
}
