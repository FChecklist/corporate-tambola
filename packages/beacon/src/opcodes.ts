// Compact request body for ONE claim (1.5.3): "k|<pid>|<device>|<pattern>|<idx>|<round>" instead of the JSON object. The server accepts BOTH, so a page that is still open from
// before an update keeps working. Only the claim is shortened (the signal and the replies are already a few bytes); nothing about who wins or when is in this file.
export interface ClaimBody { pid: string; device?: string; claims: { pattern: string; idx: number; round?: number }[] }
const SAFE = /^[A-Za-z0-9_-]{0,80}$/;
/** The text to send instead of the JSON, or null when the claim does not fit the short form (then the JSON goes as before). */
export function compactClaim(b: unknown): string | null {
  const o = b as ClaimBody | null; if (!o || typeof o.pid !== "string" || !Array.isArray(o.claims) || o.claims.length !== 1) return null;
  const c = o.claims[0]!, dev = o.device ?? "";
  if (Object.keys(o).some((k) => k !== "pid" && k !== "device" && k !== "claims") || Object.keys(c).some((k) => k !== "pattern" && k !== "idx" && k !== "round")) return null;
  if (!SAFE.test(o.pid) || !o.pid || !SAFE.test(dev) || typeof c.pattern !== "string" || !/^[a-z0-9]{2,12}$/.test(c.pattern) || !Number.isInteger(c.idx) || c.idx < 0 || (c.round !== undefined && (!Number.isInteger(c.round) || c.round < 1))) return null;
  return `k|${o.pid}|${dev}|${c.pattern}|${c.idx}|${c.round ?? 1}`;
}
/** The server's side: the short text back into the object the claim route already understands (null if it is not a short claim). */
export function parseCompactClaim(t: string): ClaimBody | null {
  if (!t.startsWith("k|")) return null;
  const p = t.split("|"); if (p.length !== 6) return null;
  const [, pid, device, pattern, idx, round] = p as [string, string, string, string, string, string];
  if (!pid || !SAFE.test(pid) || !SAFE.test(device) || !/^[a-z0-9]{2,12}$/.test(pattern) || !/^\d{1,6}$/.test(idx) || !/^\d{1,3}$/.test(round) || Number(round) < 1) return null;
  return { pid, ...(device ? { device } : {}), claims: [{ pattern, idx: Number(idx), ...(Number(round) > 1 ? { round: Number(round) } : {}) }] };
}
