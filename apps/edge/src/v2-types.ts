// Shared shapes for the V2 modules (a leaf: type-only imports, no runtime import of worker.ts, so there is no import cycle).
import type { D1, Env } from "./worker";

export interface V2Auth {
  plat: boolean; org: string | null; kind: "platform" | "master" | "ai" | "host" | "cohost" | null;
  /** hash of the key presented (never sent anywhere) */
  kh?: string;
  /** the private label the organizer gave the key */
  label?: string | null;
  /** a key made for ONE game: 'gm' game master key, 'ga' game master key for an AI (every call is labelled AI), 'lh' Host key made without personal data */
  scopeEid?: string | null; scopeKind?: "gm" | "ga" | "lh" | null; scopeSrc?: string | null;
  viaLink?: boolean; hid?: string; hostReady?: boolean; temp?: boolean; eid?: string | null;
}

export interface V2Ctx {
  req: Request; env: Env & Record<string, any>; now: number; a: V2Auth; url: URL; p: string;
  json: (o: unknown, status?: number) => Response;
  body: (req: Request, max?: number) => Promise<any | null>;
  spend: (n?: number) => Promise<boolean>;
  busy: () => Response;
  origin: string;
  /** what a Host (or a Host's AI link) may do inside a game, from worker.ts */
  hostActions: ReadonlySet<string>;
  /** the stored game row, read once per call by the route that needs it */
  game?: (eid: string) => Promise<any | null>;
}

export const sha = async (s: string): Promise<string> => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, "0")).join("");
export const randHex = (n: number): string => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
export const cleanText = (v: unknown, max: number): string => (typeof v === "string" ? Array.from(v).filter((ch) => { const c = ch.charCodeAt(0); return !(c < 32 || c === 127 || (c >= 0x200b && c <= 0x200f) || c === 0x2028 || c === 0x2029 || c === 0xfeff); }).join("").replace(/[<>`]/g, "").replace(/\s+/g, " ").trim().slice(0, max) : "");
export type { D1, Env };

/** Payee on every receipt (owner decision 13 Nov 2026). */
export const PAYEE = "IT SERVICES BY RAJAT AGARWAL via Razorpay";
/** A game key (and a Host key made without personal data) works until this long after its game ended (owner decision 13 Nov 2026). */
export const KEY_AFTER_END_MS = 24 * 3_600_000;
export const GAME_ID = /^[A-Za-z0-9_-]{4,40}$/;
