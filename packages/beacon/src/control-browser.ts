// Organizer-side browser helper (bundled to apps/web/public/control.js, exposes window.TBControl).
// Holds the engagement's signing key in IndexedDB as a NON-EXTRACTABLE CryptoKey: the page can sign, nothing can read the key out.
// Built with: bun run build:control   (not covered by unit tests: needs a browser; the signing and publishing logic it calls is).
import { generateOrganizerKey, nextMessage, publicKeyFromSecret, signControl, signControlWithSecret, type ControlAction, type PublishedFile } from "./control";

const DB = "tambola-control";
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("keys");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
/** A browser with WebCrypto Ed25519 holds a non-extractable CryptoKey; one without it (older Safari or Firefox) holds a raw secret made by the pure-JS fallback, so a Host-mode game can still be run from it. */
type StoredKey = { publicKeyHex: string; privateKey?: CryptoKey; secretHex?: string };
const newKey = async (): Promise<StoredKey> => {
  try { return await generateOrganizerKey(false); }
  catch { const raw = crypto.getRandomValues(new Uint8Array(32)); const secretHex = Array.from(raw, (x) => x.toString(16).padStart(2, "0")).join(""); return { secretHex, publicKeyHex: publicKeyFromSecret(secretHex) }; }
};
const get = async (k: string): Promise<StoredKey | undefined> => { const d = await idb(); return new Promise((res, rej) => { const q = d.transaction("keys").objectStore("keys").get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); };
const put = async (k: string, v: unknown) => { const d = await idb(); return new Promise<void>((res, rej) => { const q = d.transaction("keys", "readwrite").objectStore("keys").put(v, k); q.onsuccess = () => res(); q.onerror = () => rej(q.error); }); };

const MIRRORS = ["https://api.drand.sh", "https://api2.drand.sh", "https://api3.drand.sh", "https://drand.cloudflare.com"];
const relay = () => { try { return location.origin && /^https?:$/.test(location.protocol) ? [location.origin + "/api/beacon"] : []; } catch { return []; } }; // our own server relays the beacon for a network that blocks the beacon's servers
const CHAIN = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971";
const GENESIS = 1692803367;
const BEACON_MS = 4000; // one address gets this long: a network that silently drops the traffic must never hold a press
/** One address's answer for the latest round, or null. Gives up after `ms`; the abort covers reading the answer too, and a fetch that ignores the abort is dropped by the race. */
async function askRound(m: string, ms: number): Promise<number | null> {
  const ctl = typeof AbortController === "function" ? new AbortController() : undefined; // an older browser without it still stops waiting: the race below ends the wait
  let to: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => { const r = await fetch(`${m}/${CHAIN}/public/latest`, ctl ? { signal: ctl.signal } : undefined); if (!r.ok) return null; const j = await r.json(); return Number.isInteger(j.round) ? (j.round as number) : null; })(),
      new Promise<null>((res) => { to = setTimeout(() => { try { ctl?.abort(); } catch { /* already done */ } res(null); }, ms); }),
    ]);
  } catch { return null; } finally { clearTimeout(to); }
}
/** Current beacon round. Only used to stamp a message; a wrong value can hurt only this organizer's own game, never forge anything. */
export async function beaconRound(ms = BEACON_MS): Promise<number> {
  // Our own server (the one address that works wherever this page loaded) and the beacon's servers are all asked at once and the first answer wins, so a network that drops
  // the beacon's servers costs a press nothing. No answer within `ms` falls back to the beacon's own schedule worked out from the clock: a last resort only.
  const got = await new Promise<number | null>((done) => {
    const all = [...relay(), ...MIRRORS]; let left = all.length;
    if (!left) return done(null);
    for (const m of all) askRound(m, ms).then((n) => { if (n !== null) done(n); else if (--left === 0) done(null); });
  });
  return got ?? Math.floor((Date.now() / 1000 - GENESIS) / 3) + 1;
}

type Auth = { token: string; base?: string; prefix?: string };
const P = (a: Auth) => `${a.base ?? ""}${a.prefix ?? "/api/e"}`;
const hdr = (a: Auth) => ({ "content-type": "application/json", authorization: `Bearer ${a.token}` });

const TBControl = {
  /** Make sure this engagement has a key registered. Call once while the engagement is still open. Returns false if this browser lacks the key. */
  async ensureKey(code: string, a: Auth, profile: "standard" | "fast" = "standard"): Promise<{ ok: boolean; created?: boolean; reason?: string }> {
    const base = a.base ?? "";
    const pub = await (await fetch(`${P(a)}/${code}/control`)).json().catch(() => null);
    const mine = await get(code);
    const signs = (k: { publicKeyHex: string } | undefined) => !!k && (k.publicKeyHex === pub?.pubKey || (Array.isArray(pub?.hostKeys) && pub.hostKeys.includes(k.publicKeyHex)));
    if (pub?.pubKey && signs(mine)) return { ok: true };
    // no key yet: this browser registers the organizer's key. A key already there: a Host's browser asks to add its own key beside it (the store checks who is asking;
    // anyone else, the organizer's second browser included, is told the key lives elsewhere)
    const k = mine ?? (await newKey());
    const r = await fetch(`${P(a)}/${code}/control/key`, { method: "PUT", headers: hdr(a), body: JSON.stringify({ publicKey: k.publicKeyHex, profile }) });
    if (!r.ok) return { ok: false, reason: pub?.pubKey ? "This engagement's signing key lives in another browser." : (await r.json().catch(() => ({}))).error ?? "Could not register the key." };
    if (!mine) await put(code, k);
    return { ok: true, created: true };
  },
  /** Build, sign and return the next control message (does not publish it). */
  async sign(code: string, a: Auth, action: ControlAction, o: { pauseForRounds?: number; untilRound?: number; addRounds?: number } = {}) {
    const base = a.base ?? "";
    // Sent with the sign-in header on purpose: the server shares a plain read of this file for up to a second, and a number taken from that copy can repeat the one a press made a moment ago ("sequence number already used")
    const f = (await (await fetch(`${P(a)}/${code}/control`, { cache: "no-store", headers: hdr(a) })).json()) as PublishedFile;
    const k = await get(code);
    if (!k || (k.publicKeyHex !== f.pubKey && !(f.hostKeys ?? []).includes(k.publicKeyHex))) throw new Error("This browser does not hold the signing key for this engagement.");
    const msg = nextMessage(f, await beaconRound(), { action, ...o });
    return k.secretHex ? signControlWithSecret(k.secretHex, msg) : signControl(k.privateKey!, msg);
  },
  /** Sign and publish in one step (what the console's Pause / Resume buttons call). */
  async publish(code: string, a: Auth, action: ControlAction, o: { pauseForRounds?: number; untilRound?: number; addRounds?: number } = {}) {
    const message = await TBControl.sign(code, a, action, o);
    const r = await fetch(`${P(a)}/${code}/control`, { method: "POST", headers: hdr(a), body: JSON.stringify({ message }) });
    return { status: r.status, data: await r.json().catch(() => ({})), message };
  },
};
(globalThis as any).TBControl = TBControl;
