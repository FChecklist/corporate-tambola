// What is live, in one small file: pages/public/version.json = { commit, dirty, builtAt, game }, written by pages/build.mjs and served at /version.json.
// `commit` is the git commit the build was made from (short), `dirty` says whether files differed from it, `builtAt` is UTC. No secret, no person, no setting is ever put here.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";


export function versionStamp({ root, game, run, now = () => new Date() }) {
  const git = run ?? ((args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
  let commit = "unknown", dirty = false;
  try { commit = git(["rev-parse", "--short=12", "HEAD"]); dirty = git(["status", "--porcelain", "--untracked-files=no"]).length > 0; } catch { /* built outside git: the stamp says so */ }
  let version = "unknown"; try { version = JSON.parse(readFileSync(join(root, "apps/edge/src/releases.json"), "utf8"))[0].version; } catch { /* no release list: the stamp says so */ }
  const at = now(); // the build time is the release time: the build runs right before the deploy
  return { commit, dirty, builtAt: at.toISOString(), game, version, releasedAt: at.toISOString(), releasedAtIST: istText(at) };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "29 Oct 2026, 14:05 IST" (India time, whatever the machine's zone is). */
export function istText(d) { const t = new Date(d.getTime() + 330 * 60000), p = (n) => String(n).padStart(2, "0"); return `${p(t.getUTCDate())} ${MON[t.getUTCMonth()]} ${t.getUTCFullYear()}, ${p(t.getUTCHours())}:${p(t.getUTCMinutes())} IST`; }
/** The line every public page footer prints. */
export const versionLine = (st) => `Version ${st.version}, released ${st.releasedAtIST}`;
