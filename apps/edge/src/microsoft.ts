// "Continue with Microsoft". This file only PROVES who a Microsoft ID token belongs to; what happens next (sign in, sign up, Host first open) is decided in
// worker.ts / hostsetup.ts and is exactly what the e-mail code and "Continue with Google" do.
//
// The page signs the person in with the authorization-code flow and PKCE (a single-page app: NO client secret exists anywhere) and hands the resulting ID token here.
// What is checked, with Web Crypto only (no library): the RS256 signature against Microsoft's published keys (https://login.microsoftonline.com/common/discovery/v2.0/keys,
// cached for an hour, refetched at most every 5 minutes when an unknown key id appears), `aud` is OUR client id, `iss` is https://login.microsoftonline.com/<tid>/v2.0 for
// the tenant id in the token itself (any work or school tenant, or the personal-account tenant), `exp` has not passed, `nbf`/`iat` are not in the future, and the nonce the
// page generated comes back unchanged. The e-mail is the `email` claim; when that is missing, `preferred_username` ONLY if it looks like an e-mail address.
// No name, no picture, no object id, no tenant id is kept: the e-mail address and nothing else. Tests never call Microsoft: they install a fake key set with setMicrosoftKeyProvider().

import type { Jwk } from "./google";

export interface MicrosoftEnv { MICROSOFT_CLIENT_ID?: string }

export const MICROSOFT_KEYS_URL = "https://login.microsoftonline.com/common/discovery/v2.0/keys";
const KEY_TTL_MS = 3_600_000, REFETCH_MIN_MS = 300_000, SKEW_MS = 60_000;

/** The public application (client) id (a GUID, not a secret), or null when Microsoft sign-in is not set up. */
export const microsoftClientId = (env: MicrosoftEnv): string | null => {
  const v = (env.MICROSOFT_CLIENT_ID ?? "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v) ? v : null;
};

type KeyProvider = () => Promise<Jwk[]>;
const defaultProvider: KeyProvider = async () => {
  const r = await fetch(MICROSOFT_KEYS_URL);
  if (!r.ok) throw new Error("keys " + r.status);
  const j = (await r.json()) as { keys?: Jwk[] };
  return Array.isArray(j.keys) ? j.keys : [];
};
let provider: KeyProvider = defaultProvider;
let cache: { keys: Jwk[]; at: number } | null = null;
/** Tests only: replaces the place the signing keys come from (and forgets what was cached). Call with no argument to go back to Microsoft. */
export function setMicrosoftKeyProvider(p?: KeyProvider): void { provider = p ?? defaultProvider; cache = null; }

async function keyFor(kid: string, now: number): Promise<Jwk | null> {
  const find = () => cache?.keys.find((k) => k.kid === kid && k.kty === "RSA") ?? null;
  if (cache && now - cache.at < KEY_TTL_MS) { const k = find(); if (k) return k; if (now - cache.at < REFETCH_MIN_MS) return null; }
  try { const keys = await provider(); cache = { keys, at: now }; } catch { /* keep the old copy; an unknown key then simply fails */ }
  return find();
}

const b64u = (s: string): Uint8Array<ArrayBuffer> => {
  const t = s.replace(/-/g, "+").replace(/_/g, "/"), pad = t + "=".repeat((4 - (t.length % 4)) % 4), raw = atob(pad);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
};
const jsonPart = (s: string): any => JSON.parse(new TextDecoder().decode(b64u(s)));
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MicrosoftResult = { ok: true; email: string } | { ok: false; why: "config" | "format" | "key" | "signature" | "claims" | "expired" | "nonce" };

/** Verifies a Microsoft ID token for our client id and the nonce the page made. Never throws. */
export async function verifyMicrosoftIdToken(env: MicrosoftEnv, idToken: unknown, nonce: unknown, now: number): Promise<MicrosoftResult> {
  const clientId = microsoftClientId(env);
  if (!clientId) return { ok: false, why: "config" };
  if (typeof idToken !== "string" || idToken.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(idToken)) return { ok: false, why: "format" };
  if (typeof nonce !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) return { ok: false, why: "nonce" };
  try {
    const [h, p, s] = idToken.split(".") as [string, string, string];
    const head = jsonPart(h);
    if (head?.alg !== "RS256" || typeof head.kid !== "string") return { ok: false, why: "format" }; // only the algorithm Microsoft uses; "none" and HS256 are refused
    const jwk = await keyFor(head.kid, now);
    if (!jwk) return { ok: false, why: "key" };
    const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const good = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64u(s), new TextEncoder().encode(h + "." + p));
    if (!good) return { ok: false, why: "signature" };
    const c = jsonPart(p);
    if (c?.aud !== clientId) return { ok: false, why: "claims" };
    if (typeof c.tid !== "string" || !GUID_RE.test(c.tid) || c.iss !== `https://login.microsoftonline.com/${c.tid}/v2.0`) return { ok: false, why: "claims" }; // any tenant, but the issuer must be that tenant's own
    if (typeof c.exp !== "number" || c.exp * 1000 <= now) return { ok: false, why: "expired" };
    if (typeof c.nbf === "number" && c.nbf * 1000 > now + SKEW_MS) return { ok: false, why: "claims" };
    if (typeof c.iat === "number" && c.iat * 1000 > now + SKEW_MS) return { ok: false, why: "claims" };
    if (c.nonce !== nonce) return { ok: false, why: "nonce" };
    let email = typeof c.email === "string" ? c.email.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(email)) { const u = typeof c.preferred_username === "string" ? c.preferred_username.trim().toLowerCase() : ""; email = EMAIL_RE.test(u) ? u : ""; }
    if (!email) return { ok: false, why: "claims" };
    return { ok: true, email };
  } catch { return { ok: false, why: "format" }; }
}
