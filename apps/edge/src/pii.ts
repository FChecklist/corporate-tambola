// Encryption of personal data at rest. A participant's name and mobile number are never stored in the clear: they are sealed with AES-256-GCM,
// under a key derived (HKDF-SHA-256) from a secret that lives only in the Worker's environment (DATA_KEY), never in the database or the code.
// A copy of the database (a backup, an export, a leaked token) therefore holds only ciphertext. Every record has its own random nonce, and the
// format is versioned ("v1.") so the key can be rotated. The same sealing is used for the temporary pieces of an engagement report.
export interface PiiEnv { DATA_KEY?: string; ORGANIZER_SECRET?: string }
export interface Pii { phone: string; name: string | null }

const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const AAD = enc.encode("corporate-tambola/pii/v1");

const keys = new Map<string, Promise<CryptoKey>>();
/** The data key. DATA_KEY is the real secret; the fallback (derived from the organizer secret) only exists so a deployment that forgot to set it still never stores plain text. */
function keyFor(env: PiiEnv): Promise<CryptoKey> {
  const secret = env.DATA_KEY ? "k|" + env.DATA_KEY : env.ORGANIZER_SECRET ? "fallback|" + env.ORGANIZER_SECRET : "";
  if (!secret) return Promise.reject(new Error("no data key configured"));
  let k = keys.get(secret);
  if (!k) {
    k = crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveKey"]).then((base) =>
      crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: enc.encode("corporate-tambola/salt/v1"), info: enc.encode("pii-aes-256-gcm") }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]));
    if (keys.size > 8) keys.clear();
    keys.set(secret, k);
  }
  return k;
}

/** Seals any text. The result looks like "v1.<nonce>.<ciphertext>" and is safe to store. */
export async function sealText(env: PiiEnv, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD }, await keyFor(env), enc.encode(text)));
  return `v1.${b64(iv)}.${b64(ct)}`;
}
/** Opens a sealed text; null when it was tampered with, sealed under another key, or is not ours. */
export async function openText(env: PiiEnv, sealed: string | null | undefined): Promise<string | null> {
  if (!sealed) return null;
  const p = sealed.split(".");
  if (p.length !== 3 || p[0] !== "v1") return null;
  try { return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(p[1]!), additionalData: AAD }, await keyFor(env), unb64(p[2]!))); } catch { return null; }
}
export const sealPii = (env: PiiEnv, p: Pii) => sealText(env, JSON.stringify({ p: p.phone, n: p.name }));
export async function openPii(env: PiiEnv, sealed: string | null | undefined): Promise<Pii | null> {
  const t = await openText(env, sealed);
  if (t === null) return null;
  try { const o = JSON.parse(t); return { phone: String(o.p ?? ""), name: o.n == null ? null : String(o.n) }; } catch { return null; }
}
