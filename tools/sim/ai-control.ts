/**
 * End-to-end (local) test of the two new pieces working together:
 *  - the organizer's AI can only DRAFT a pause/resume/stop (request_control) and cannot sign it;
 *  - the organizer's browser holds the Ed25519 key, signs on the confirm page, and the signed message lands in the public control file.
 * Run against a FAST server:
 *   PORT=8789 TAMBOLA_FAST=1 TAMBOLA_DATA=C:/ct/tb-wt-ai/data-sim-ai bun run apps/server/src/index.ts
 *   BASE=http://localhost:8789 bun run tools/sim/ai-control.ts
 */
import { generateOrganizerKey, nextMessage, resolveControl, cfgOf, signControl, type PublishedFile } from "../../packages/beacon/src/control";

const BASE = process.env.BASE ?? "http://localhost:8789";
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };
async function http(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(url.startsWith("http") ? url : BASE + url, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let data: any = t; try { data = JSON.parse(t); } catch { /* markdown */ }
  return { status: r.status, data, headers: r.headers };
}
const email = `hr.${Math.floor(Math.random() * 1e6)}@acme-industries.com`;
const buy = await http("POST", "/api/checkout", { org: "Acme Industries", email, country: "IN", taxId: "27ABCDE1234F1Z5", pack: 250, currency: "INR" });
const LINK: string = buy.data.devAiLink, code: string = buy.data.engagementCode;
const ae = await http("POST", "/api/auth/email", { email });
const token: string = (await http("POST", "/api/auth/verify", { email, code: ae.data.devCode })).data.token;
const auth = { authorization: `Bearer ${token}` };
const T = (tool: string, body: any = {}) => http("POST", `${LINK}/tools/${tool}`, body);

// organizer's browser: makes the key (non-extractable) and registers only the PUBLIC half
const key = await generateOrganizerKey(false);
let r = await http("PUT", `/api/e/${code}/control/key`, { publicKey: key.publicKeyHex }, auth);
check("organizer's browser registers the public key before Start", r.status === 200 && r.data.ok);
r = await http("PUT", `/api/e/${code}/control/key`, { publicKey: "ab".repeat(32) }, auth);
check("the key can never be replaced afterwards", r.status === 409);
r = await http("PUT", `/api/e/${code}/control/key`, { publicKey: key.publicKeyHex });
check("nobody without the organizer's login can register or change a key", r.status === 403);

const pub = await http("GET", `/api/e/${code}/control`);
check("phones read ONE small public file: cacheable, CORS-open, no login, no personal data", pub.status === 200 && /s-maxage=3/.test(pub.headers.get("cache-control") ?? "") && pub.headers.get("access-control-allow-origin") === "*" && pub.data.messages.length === 0 && JSON.stringify(pub.data).length < 400, `${JSON.stringify(pub.data).length} bytes`);

// the AI
const man = await http("GET", LINK);
check("manual: jobs list, draft-vs-confirm, and what a GET-only chat cannot do", ["## Jobs you may be asked to do", "request_control", "If you can only open web addresses", "cannot sign a pause"].every((s) => man.data.includes(s)));
const st = await T("get_control_status", { code });
check("AI can read the control status (phones mode, pause notice about 40 s)", st.data.mode === "phones" && st.data.registered === true && st.data.pause_notice_seconds >= 30, JSON.stringify(st.data).slice(0, 160));
const old = await T("pause_engagement", { code, reason: "Internet issue" });
check("the older server-side pause is refused for a phone-only engagement (it would not reach phones)", old.status === 409 || old.status === 400, `${old.status} ${old.data.error}`);

const d = await T("request_control", { code, action: "pause", minutes: 5 });
check("AI can only DRAFT a pause (202 + confirm link)", d.status === 202 && /\/confirm\/drf_/.test(d.data.confirm_url), d.data.summary);
const m = d.data.confirm_url.match(/\/confirm\/(drf_[0-9a-f]+)#(.+)$/)!;
const unsigned = await http("POST", `/api/ai/drafts/${m[1]}/confirm`, { code: m[2] }, auth);
check("confirming WITHOUT the organizer's signature does nothing", unsigned.status === 422 && /signature/i.test(JSON.stringify(unsigned.data)), JSON.stringify(unsigned.data).slice(0, 140));

// the organizer's browser signs what the draft says
const f = (await http("GET", `/api/e/${code}/control`)).data as PublishedFile;
const stat = (await http("GET", `/api/e/${code}/control/status`, undefined, auth)).data;
const good = await signControl(key.privateKey, nextMessage(f, stat.nowRound, { action: "pause", pauseForRounds: 5 * 20 }));
const stranger = await generateOrganizerKey();
const forged = await signControl(stranger.privateKey, nextMessage(f, stat.nowRound, { action: "pause", pauseForRounds: 100 }));
let c = await http("POST", `/api/ai/drafts/${m[1]}/confirm`, { code: m[2], signed: forged }, auth);
check("a message signed by any other key is refused", c.status === 422);
const wrongAction = await signControl(key.privateKey, nextMessage(f, stat.nowRound, { action: "stop" }));
c = await http("POST", `/api/ai/drafts/${m[1]}/confirm`, { code: m[2], signed: wrongAction }, auth);
check("a validly signed message for a DIFFERENT action than the one drafted is refused", c.status === 422);
c = await http("POST", `/api/ai/drafts/${m[1]}/confirm`, { code: m[2], signed: good }, auth);
check("with the organizer's own signature the confirmation goes through", c.status === 200 && c.data.ok === true, JSON.stringify(c.data).slice(0, 120));
const after = (await http("GET", `/api/e/${code}/control`)).data as PublishedFile;
const state = resolveControl(cfgOf(after), after.messages);
check("the signed pause is now in the public file and resolves to one 5-minute pause", after.messages.length === 1 && state.intervals.length === 1 && state.intervals[0]!.end - state.intervals[0]!.start === 100, JSON.stringify(state.intervals));
const again = await http("POST", `/api/ai/drafts/${m[1]}/confirm`, { code: m[2], signed: good }, auth);
check("the draft cannot be confirmed twice", again.status === 409);

// the AI cannot smuggle a signature in through the draft parameters
const sneaky = await T("request_control", { code, action: "resume", __signed: { ...good, seq: 2, action: "resume" } });
const m2 = sneaky.data.confirm_url.match(/\/confirm\/(drf_[0-9a-f]+)#(.+)$/)!;
const sc = await http("POST", `/api/ai/drafts/${m2[1]}/confirm`, { code: m2[2] }, auth);
check("a signature smuggled in by the AI inside the draft is stripped: still needs the organizer", sc.status === 422);

const ro = await http("GET", `${LINK}/tools/get_control_status?code=${code}`);
check("AI reads the new status afterwards: 1 pause on record", ro.data.pauses_so_far === 1);
console.log(`\n${pass}/${pass + fail} checks passed${fail ? ` - ${fail} FAILED` : ""}`);
process.exit(fail ? 1 : 0);
