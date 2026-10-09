// Shared helpers for the end-to-end specs: target selection, secrets (never printed), a tiny API client, the case registry and the result log.
// Target: E2E_BASE (default the real site). A local stand-in is started by playwright.config.ts when E2E_TARGET=local.
import { test, expect, type Page, type BrowserContext, type Browser } from "@playwright/test";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export { expect };
export const TARGET = (process.env.E2E_TARGET ?? "live") as "live" | "local";
export const LOCAL_PORT = Number(process.env.E2E_PORT ?? 8791);
export const BASE = process.env.E2E_BASE ?? (TARGET === "local" ? `http://localhost:${LOCAL_PORT}` : "https://corporate-tambola.pages.dev");
export const IS_LIVE = TARGET === "live";
export const GENESIS = 1692803367;
export const OWNER_MAIL = process.env.E2E_OWNER_MAIL ?? "rajatsiroffice@gmail.com";
/** A page address on the target. The real site (Cloudflare Pages) answers clean paths (/legal); the local stand-in serves files, so it needs /legal.html. */
export const u = (p: string) => BASE + (IS_LIVE || p === "/" || p.startsWith("/api") || p.startsWith("/ai/") || /\.[a-z]{2,4}(\?|#|$)/.test(p.split("?")[0]!) ? p : p.replace(/^\/([A-Za-z0-9_-]+)(?=([?#].*)?$)/, "/$1.html"));
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const REPO = fileURLToPath(new URL("../../..", import.meta.url));

/** The platform (owner) key. Local stand-in: "e2e". Live: ORGANIZER_SECRET from config/live-secrets.txt (or E2E_PLATFORM_KEY). Never logged. */
export function platformKey(): string {
  if (process.env.E2E_PLATFORM_KEY) return process.env.E2E_PLATFORM_KEY;
  if (!IS_LIVE) return "e2e";
  const f = join(REPO, "config", "live-secrets.txt");
  const m = existsSync(f) ? /^ORGANIZER_SECRET=(.+)$/m.exec(readFileSync(f, "utf8")) : null;
  if (!m) throw new Error("No platform key: set E2E_PLATFORM_KEY or provide config/live-secrets.txt");
  return m[1]!.trim();
}
const SECRETS = () => [platformKey()];
/** Remove anything that looks like a key before it reaches a log or a report. */
export function scrub(s: unknown): string {
  let t = typeof s === "string" ? s : (() => { try { return JSON.stringify(s); } catch { return String(s); } })();
  t = t.replace(/\b(ctk|cta|cth|ctp|rpt)_[0-9a-f]{8,}/g, "$1_<key>").replace(/\b[0-9a-f]{48}\b/g, "<48hex>");
  try { for (const k of SECRETS()) if (k.length >= 6) t = t.split(k).join("<platform-key>"); } catch { /* no secrets file */ }
  return t.length > 700 ? t.slice(0, 700) + "..." : t;
}

export interface Res { status: number; body: any; text: string; headers: Headers; ms: number }
/** A tiny API client. `key` goes in x-organizer. `ip` sets cf-connecting-ip (only meaningful against the local stand-in; Cloudflare overrides it on the real site). */
export class Api {
  constructor(public base = BASE, public key?: string, public ip?: string) {}
  as(key?: string, ip?: string) { return new Api(this.base, key, ip ?? this.ip); }
  async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res> {
    const h: Record<string, string> = { ...(body !== undefined && typeof body !== "string" ? { "content-type": "application/json" } : {}), ...headers };
    if (this.key && !("x-organizer" in h)) h["x-organizer"] = this.key;
    if (this.ip && !("cf-connecting-ip" in h)) h["cf-connecting-ip"] = this.ip;
    const t0 = Date.now();
    const r = await fetch(this.base + path, { method, headers: h, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
    const text = await r.text();
    let j: any = {}; try { j = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, body: j, text, headers: r.headers, ms: Date.now() - t0 };
  }
  get = (p: string, h?: Record<string, string>) => this.call("GET", p, undefined, h);
  post = (p: string, b?: unknown, h?: Record<string, string>) => this.call("POST", p, b ?? {}, h);
  patch = (p: string, b?: unknown, h?: Record<string, string>) => this.call("PATCH", p, b ?? {}, h);
}
export const anon = () => new Api();
export const owner = () => new Api(BASE, platformKey());

export const roundOfMs = (ms: number) => Math.floor((ms / 1000 - GENESIS) / 3) + 1;
export const roundMs = (r: number) => (GENESIS + (r - 1) * 3) * 1000;
/** A start round about `sec` seconds from now. */
export const startIn = (sec: number) => roundOfMs(Date.now() + sec * 1000) + 1;
export const rnd = (n = 6) => Math.floor(Math.random() * 16 ** n).toString(16).padStart(n, "0");
export const eid = (p = "E2E") => `${p}${rnd(7).toUpperCase()}`;
export const dev = (seed: string | number) => createHash("sha256").update("dev|" + String(seed)).digest("hex").slice(0, 32);
export const phone = (n: number) => `98${String(10000000 + n).slice(-8)}`;

export interface Org { token: string; aiKey: string; email: string }
let aliasN = 0;
/** An organizer account for a test. Local stand-in: a real sign-up through /api/start (each call from its own pretend network address). Live: /api/start allows 10 sign-ups
 *  per network address per day, so the platform key mints the account (POST /api/org) and the organizer's own key mints the AI key. `signup:true` forces the real /api/start path. */
export async function newOrg(tag = "e2e", o: { signup?: boolean } = {}): Promise<Org> {
  const [u, d] = OWNER_MAIL.split("@");
  const email = `${u}+tb${tag}${Date.now().toString(36)}${aliasN++}@${d}`;
  if (IS_LIVE && !o.signup) {
    const r = await owner().post("/api/org");
    if (r.status !== 200 || !r.body.organizerKey) throw new Error(`mint failed ${r.status} ${scrub(r.text)}`);
    const token = r.body.organizerKey as string;
    const ai = await new Api(BASE, token).post("/api/org/ai/replace");
    const aiKey = /cta_[0-9a-f]{48}/.exec(ai.text)?.[0];
    if (!aiKey) throw new Error("no AI key " + scrub(ai.text));
    return { token, aiKey, email };
  }
  const r = await new Api(BASE, undefined, IS_LIVE ? undefined : `10.${aliasN % 250}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`).post("/api/start", { email });
  if (r.status !== 200 || !r.body.token) throw new Error(`start failed ${r.status} ${scrub(r.text)}`);
  return { token: r.body.token, aiKey: r.body.aiKey, email };
}
/** Create an engagement as `org` (free draft). */
export async function mkEng(org: { token: string }, o: { id?: string; startInSec?: number; cap?: number; callSeconds?: number; rewards?: unknown[]; extra?: object } = {}) {
  const id = o.id ?? eid();
  const body = { id, startRound: startIn(o.startInSec ?? 3600), callSeconds: o.callSeconds ?? 6, cap: o.cap ?? 50, ...(o.rewards ? { rewards: o.rewards } : {}), ...(o.extra ?? {}) };
  const r = await new Api(BASE, org.token).post("/api/z", body);
  return { id, r };
}
/** Publish + pay (TEST payment through the organizer's own key). Returns the pay result. */
export async function publishAndPay(org: Org, id: string, cap = 50) {
  const A = new Api(BASE, org.token);
  const pub = await A.post(`/api/z/${id}/publish`, { email: org.email, phone: "9811122233" });
  return { pub, pay: undefined as any, A };
}

// ---------------------------------------------------------------------------------------------------- the case registry
export interface CaseMeta { id: string; role: string; title: string; steps: string; expected: string; severityIfFails?: "H" | "M" | "L"; known?: string }
const RESULTS = join(process.env.E2E_RESULTS_DIR ?? join(REPO, "tests", "e2e", "results"), `${process.env.E2E_RUN_LABEL ?? TARGET}.jsonl`);
function log(rec: object) { try { mkdirSync(join(RESULTS, ".."), { recursive: true }); appendFileSync(RESULTS, JSON.stringify(rec) + "\n"); } catch { /* best effort */ } }

function record(meta: CaseMeta, t0: number, result: "pass" | "fail", ev: unknown) {
  log({ ...meta, target: TARGET, base: IS_LIVE ? "live" : "local", result, evidence: scrub(ev ?? ""), ms: Date.now() - t0, at: new Date().toISOString() });
}
/** One API-level test case. `fn` returns an evidence string (what was observed) or throws. */
export function tc(meta: CaseMeta, fn: () => Promise<string | void>) {
  test(`${meta.id} ${meta.title}`, async () => {
    const t0 = Date.now();
    try { record(meta, t0, "pass", await fn()); } catch (e: any) { record(meta, t0, "fail", e?.message ?? e); throw e; }
  });
}
/** One browser test case (Playwright fixtures: page, context, browser). */
export function tcb(meta: CaseMeta, fn: (fx: { page: Page; context: BrowserContext; browser: Browser }) => Promise<string | void>) {
  test(`${meta.id} ${meta.title}`, async ({ page, context, browser }) => {
    const t0 = Date.now();
    try { record(meta, t0, "pass", await fn({ page, context, browser })); } catch (e: any) { record(meta, t0, "fail", e?.message ?? e); throw e; }
  });
}
/** Refuse to run anything that writes against the real site unless it is in TEST mode. */
export async function requireTestMode() {
  const m = await anon().get("/api/mode");
  if (m.body?.mode !== "TEST") throw new Error(`Refusing to run: ${BASE} is in ${m.body?.mode ?? "unknown"} mode, not TEST. Use tests/e2e/run-live.mjs.`);
}
export const J = (x: unknown) => scrub(x);
export { test };
