// Types for lib.mjs, as far as the TypeScript runners (run.ts, run-modes.ts, run-organizer.ts, run-permissions.ts) and the generators use it.
// lib.mjs itself is plain JavaScript and is not type-checked; this file is the one place that says what the runners may rely on.
export interface Clock {
  get(): Promise<{ now: number; iso: string; offsetMs: number; frozen: boolean }>;
  now(): Promise<number>;
  set(msOrIso: number | string): Promise<unknown>;
  advance(ms: number): Promise<unknown>;
  freeze(): Promise<unknown>;
  unfreeze(): Promise<unknown>;
  reset(): Promise<unknown>;
  tick(): Promise<unknown>;
  advanceWithTicks(ms: number, step?: number): Promise<unknown>;
}
export interface Mail { to: string; subject: string; text: string; [k: string]: unknown }
export interface Mailbox {
  list(q?: { to?: string; subject?: string; since?: number; owner?: boolean }): Promise<Mail[]>;
  clear(): Promise<unknown>;
  waitFor(q: { to: string; subject?: string; timeout?: number; since?: number }): Promise<Mail>;
  code(m: Mail): string | null;
  links(m: Mail): string[];
}
export interface ApiLib {
  mailbox: Mailbox;
  sql(q: string, params?: unknown[]): Promise<Array<Record<string, unknown>>>;
  call(method: string, path: string, body?: unknown, headers?: Record<string, string>, opts?: { base?: string; ip?: string }): Promise<{ ok: boolean; status: number; body: unknown }>;
}
export const A: ApiLib;
export const clock: Clock;
export const MIN: number, HOUR: number, DAY: number;
export const PLATFORM_KEY: string, SIM: string;
export function roundAt(ms: number): number;
export function roundTimeMs(round: number): number;
export const PACKS: ReadonlyArray<readonly [number, ...unknown[]]>;
export function price(pack: readonly [number, ...unknown[]] | number, currency: string): { total: number; [k: string]: unknown };

export interface Rng { (): number; int(n: number): number; pick<X>(arr: readonly X[]): X; shuffle<X>(arr: readonly X[]): X[] }
export function rng(seed: number): Rng;
export function pairwise<D extends Record<string, readonly unknown[]>>(dims: D, R: Rng): Array<{ [K in keyof D]: D[K][number] }>;
export function cross(dims: Record<string, readonly unknown[]>): Array<Record<string, unknown>>;
export const FIRST: string[], LAST: string[], COMPANIES: string[], OCCASIONS: string[], TIMES: string[];
export function slug(s: unknown): string;
export function personName(R: Rng): string;
export function mobile(R: Rng): string;
export function fmtMobile(m: string, style: string): string;
export function istMidnight(ms: number): number;
export function istLabel(ms: number): string;
export function istDate(ms: number): string;
export function roundFrom(ms: number): number;
export function startAt(days: number, hhmm?: string): Promise<{ ms: number; round: number }>;
export function packFor(cap: number): number | null;
export function totalFor(cap: number): number | null;
export function r2(x: number): number;
export function friendly(body: unknown): string;

export interface Check { name: string; ok: boolean; detail: string }
/** A scenario as the generators build it and the runners run it. Fields beyond these are the generator's own and are read only inside run(). */
export interface Scenario {
  name: string;
  family?: string;
  /** a shared state (run-permissions.ts): scenarios of one group run one after another in one world */
  group?: ScenarioGroup;
  run(t: T): Promise<void>;
  timeoutMs?: number;
  time?: boolean;
  allowUnfriendly?: boolean;
  noMailCheck?: boolean;
  /** run-permissions.ts: safe cells (0) before destructive ones inside a group */
  order?: number;
}
export interface ScenarioGroup { key: string; enter(t: T): Promise<void>; leave?(): Promise<void>; world?: { notes?: string[] }; error?: string }
export class T {
  constructor(sc: { name: string }, seed: number);
  sc: { name: string };
  seed: number;
  checks: Check[];
  team: Set<string>;
  eids: string[];
  R: Rng;
  /** counters the runner sets on every scenario */
  calls: number;
  fivexx: string[];
  unfriendly: string[];
  check(name: string, ok: unknown, detail?: unknown): boolean;
  eq(name: string, got: unknown, want: unknown): boolean;
  allow(...emails: string[]): void;
  ip(): string;
}
