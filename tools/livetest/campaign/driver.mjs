// The runner of one case: finds its implementation (impl/index.mjs), runs it, never reports a case without an implementation as passed.
import { launch } from "./core.mjs";
import { IMPL } from "./impl/index.mjs";
export { launch };
export async function runCase(c, env) {
  const fn = IMPL[c.id]; const t0 = Date.now();
  if (!fn) return { id: c.id, title: c.title, status: "not-implemented", note: `driver kind "${c.driver}" is filled in S2`, ms: 0 };
  try {
    const r = await fn(c, env);
    const failed = r.checks.filter((x) => !x.ok);
    return { id: c.id, title: c.title, status: failed.length ? "fail" : "pass", checks: r.checks, game: r.game, ms: Date.now() - t0 };
  } catch (e) {
    return { id: c.id, title: c.title, status: e.name === "MeterStop" ? "stopped-by-meter" : "error", error: String(e && e.message || e).slice(0, 300), ms: Date.now() - t0 };
  }
}
