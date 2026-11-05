// Lets REAL browser pages play against a local replica with no live beacon: (1) every beacon request (drand mirrors or the site's own /api/beacon relay) is answered here with a round signed by the TEST key,
// (2) the page scripts get the drand public key replaced by the test key as they are served (nothing on disk changes), so the page's own signature check still runs, against the test chain.
import { createRequire } from "node:module"; import { createHash } from "node:crypto"; import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../../../../", import.meta.url)); const req = createRequire(ROOT + "packages/beacon/package.json");
const { bls12_381 } = req("@noble/curves/bls12-381"); const SS = bls12_381.shortSignatures, DST = "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_";
const sk = createHash("sha256").update("corporate-tambola cloud load test: local stand-in beacon key (NOT the drand key)").digest(); sk[0] &= 0x3f;
export const TEST_PUBKEY = Buffer.from(SS.getPublicKey(sk).toRawBytes(true)).toString("hex");
export const DRAND_PUBKEY = "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a";
const GENESIS = 1692803367, roundAt = (ms) => Math.floor((ms / 1000 - GENESIS) / 3) + 1, roundMs = (r) => (GENESIS + (r - 1) * 3) * 1000; const cache = new Map();
const signed = (r) => { let x = cache.get(r); if (!x) { const rb = new Uint8Array(8); new DataView(rb.buffer).setBigUint64(0, BigInt(r)); const sig = SS.sign(SS.hash(createHash("sha256").update(rb).digest(), DST), sk).toRawBytes(true); x = { round: r, signature: Buffer.from(sig).toString("hex"), randomness: createHash("sha256").update(sig).digest("hex") }; cache.set(r, x); } return x; };
export const stats = { served: 0, notYet: 0, patchedScripts: 0 };
export async function install(ctx) {
  await ctx.route((u) => /\/public\/(latest|\d+)$/.test(u.pathname), async (route) => { const m = /\/public\/(latest|\d+)$/.exec(new URL(route.request().url()).pathname); const r = m[1] === "latest" ? roundAt(Date.now()) : Number(m[1]);
    const cors = { "access-control-allow-origin": "*", "content-type": "application/json" };
    if (Date.now() < roundMs(r)) { stats.notYet++; return route.fulfill({ status: 404, headers: cors, body: "{}" }); } stats.served++; return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(signed(r)) }); });
  await ctx.route((u) => /\.js$/.test(u.pathname) && /localhost/.test(u.host), async (route) => { const res = await route.fetch(); let body = await res.text(); if (body.includes(DRAND_PUBKEY)) { body = body.split(DRAND_PUBKEY).join(TEST_PUBKEY); stats.patchedScripts++; } const h = { ...res.headers() }; delete h["content-length"]; delete h["content-encoding"]; return route.fulfill({ status: res.status(), headers: h, body }); });
}
