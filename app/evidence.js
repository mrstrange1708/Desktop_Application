// evidence.js — hash-chained event log + perceptual screen hashing
import crypto from "crypto";

export const GENESIS = "0".repeat(64);

const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");

// Every entry stores the previous entry's hash, so editing, deleting or reordering
// any line breaks every hash after it.
// ponytail: unkeyed — someone who rewrites the whole file can recompute it, and cutting
// lines off the end is invisible. Send the final hash + entry count to the server at submit
// (or HMAC with a server-issued session key) to make it real evidence.
export function chainEntry(prevHash, entry) {
    const body = { ...entry, prev: prevHash };
    return { ...body, hash: sha256(JSON.stringify(body)) };
}

export function verifyChain(text) {
    const lines = text.split("\n").filter(Boolean);
    let prev = GENESIS;
    for (const [i, line] of lines.entries()) {
        try {
            const { hash, ...body } = JSON.parse(line);
            if (body.prev !== prev || sha256(JSON.stringify(body)) !== hash) throw new Error();
            prev = hash;
        } catch {
            return { ok: false, entries: lines.length, brokenAt: i + 1 };
        }
    }
    return { ok: true, entries: lines.length };
}

// 9x8 BGRA bitmap (nativeImage.resize(...).toBitmap()) → 72 grayscale values
export function grayFromBitmap(bgra) {
    const gray = new Uint8Array(72);
    for (let i = 0; i < 72; i++) gray[i] = bgra[i * 4] * 0.114 + bgra[i * 4 + 1] * 0.587 + bgra[i * 4 + 2] * 0.299;
    return gray;
}

// dHash: 64 bits, one per pixel = "is it brighter than its right neighbour".
// Survives compression noise, flips when the screen content actually changes.
export function dHash(gray) {
    let hash = 0n;
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) hash = (hash << 1n) | (gray[y * 9 + x] > gray[y * 9 + x + 1] ? 1n : 0n);
    }
    return hash;
}

export function hamming(a, b) {
    let bits = 0;
    for (let x = a ^ b; x; x >>= 1n) bits += Number(x & 1n);
    return bits;
}
