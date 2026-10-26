// Corporate Tambola use-case matrix: generator, oracle evaluator and counter (throwaway tooling; no dependencies, no network).
//   node docs/flow/04-count-cases.mjs              counts after every pruning step, per family and per dimension
//   node docs/flow/04-count-cases.mjs --list [J|A|I|P]   one case per line as JSON (id, dimensions, expected answer)
//   node docs/flow/04-count-cases.mjs --examples 60      the example table used in 04-use-case-dimensions-and-oracle.md
// The decision tables live in 04-use-case-oracle.json; this file only walks them. It never reads the Worker's source.
import { readFileSync } from "node:fs";

export const O = JSON.parse(readFileSync(new URL("./04-use-case-oracle.json", import.meta.url), "utf8"));
const D = O.dimensions;
export const PLAY = D.playMode.values;
export const AUDIENCES = Object.keys(D.audience);
export const ROUTES = Object.keys(D.route);
export const STATES = Object.keys(D.state);
export const CAPS = Object.keys(D.capacity);
export const LIFES = Object.keys(D.lifecycle);
const LABEL = { host: "Priya", cohost: "Ravi" }; // the labels of the fixture Host and Co-host

// ------------------------------------------------------------------------------------------------ the tiny rule language
const test = (val, cond) => (cond !== null && typeof cond === "object" && !Array.isArray(cond) && "not" in cond ? !test(val, cond.not) : Array.isArray(cond) ? cond.includes(val) : val === cond);
const matches = (when, ctx) => Object.entries(when).every(([k, v]) => test(ctx[k], v));
const first = (rules, ctx) => rules.find((r) => matches(r.when, ctx));
const fill = (msgKey, vars = {}) => (msgKey == null ? null : O.messages[msgKey].replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)));

// ------------------------------------------------------------------------------------------------ F-JOIN
export function joinCtx(c) {
  const a = D.audience[c.audience];
  const ctx = { ...c, closed: a.closed, employeesOnly: a.employeesOnly, invites: a.invites };
  ctx.owner = first(O.derive.ownerRules.map((r) => ({ ...r })), ctx)?.owner ?? "o";
  ctx.limited = ctx.owner === "c" || ctx.owner === "s";
  return ctx;
}
export const ownerLabel = (owner, overlimit) => (overlimit ? "the organizer" : owner === "o" ? "the organizer" : owner === "h" ? LABEL.host : owner === "c" ? LABEL.cohost : "the person who invited you");
export const placedLabel = (owner) => (owner === "o" ? "Organizer" : owner === "h" ? `Host ${LABEL.host}` : owner === "c" ? `Co-host ${LABEL.cohost}` : "Guest (ticket 1)");
export function evalJoin(c) {
  const ctx = joinCtx(c);
  const rule = first(O.join.rules, ctx);
  if (!rule) return { rule: null, status: 0, code: "NO-RULE" };
  const t = rule.then, overlimit = !!t.overlimit;
  const via = ctx.route === "PERSONAL" ? "personal-link" : ctx.route === "DIRECT" ? "direct" : "common-link";
  const limit = ctx.owner === "c" ? O.derive.limitOf.c : O.derive.limitOf.s;
  const withLabel = t.waiting ? ownerLabel(ctx.owner, overlimit) : null;
  const target = overlimit ? "overlimit" : ctx.owner;
  const out = {
    rule: rule.id, status: t.status, code: t.code, waiting: !!t.waiting,
    msg: t.msg ? fill(t.msg, { with: withLabel, limit }) : null,
    with: withLabel, via: t.waiting ? via : null,
    sees: t.waiting ? O.derive.viewers[target] : null, final: t.final,
  };
  if (t.final === "new-ticket") {
    const inviterKind = t.placement === "listedOwner" ? (ctx.route === "PERSONAL" ? "c" : "o") : ctx.owner;
    out.person = { status: "joined", inviter: inviterKind };
    out.seat = { inv: inviterKind === "s" ? 1 : null, src: inviterKind === "c" ? "co:<hex>" : inviterKind === "h" ? "ho:<hex>" : "link" };
    out.jr = ctx.lifecycle === "late_join" ? "current round (>0)" : 0;
  }
  if (t.final === "same-ticket") out.jr = "unchanged";
  if (t.again) out.again = true;
  if (t.needPhone) out.needPhone = true;
  return out;
}
export function stateValid(audience, verify, state, lifecycle) {
  const a = D.audience[audience], ctx = { verify, employeesOnly: a.employeesOnly };
  if ((O.stateInvalidWhen[state] ?? []).some((w) => matches(w, ctx))) return false;
  if ((O.lifecycleStateInvalid[lifecycle] ?? []).includes(state)) return false;
  return true;
}
const audVerify = () => AUDIENCES.flatMap((a) => D.audience[a].verifyAllowed.map((v) => [a, v]));

/** Walks the join cross product and reports the size after every pruning step. */
export function joinCases() {
  const steps = { raw: 0, afterPR01: 0, afterPR02_03: 0, afterPR04: 0, afterPR05: 0 };
  steps.raw = AUDIENCES.length * 4 * ROUTES.length * STATES.length * CAPS.length * LIFES.length;
  const all = [], valid = [];
  for (const [audience, verify] of audVerify()) for (const route of ROUTES) for (const state of STATES) for (const lifecycle of LIFES) for (const capacity of CAPS) {
    steps.afterPR01++;
    if (!stateValid(audience, verify, state, lifecycle)) continue;
    steps.afterPR02_03++;
    const c = { audience, verify, route, state, capacity, lifecycle };
    const r = evalJoin(c);
    const caps = O.join.rules.find((x) => x.id === r.rule)?.capacities ?? ["ROOM"];
    if (!caps.includes(capacity)) continue;
    steps.afterPR04++;
    all.push({ c, r });
  }
  // PR-05: rules with 'ignores' keep one case per combination of the other dimensions
  const seen = new Set();
  for (const x of all) {
    const rule = O.join.rules.find((y) => y.id === x.r.rule), ign = new Set(rule?.ignores ?? []);
    if (ign.size) {
      const key = x.r.rule + "|" + ["audience", "verify", "route", "state", "capacity", "lifecycle"].filter((k) => !ign.has(k)).map((k) => x.c[k]).join("|");
      if (seen.has(key)) continue; seen.add(key);
    }
    valid.push(x);
  }
  steps.afterPR05 = valid.length;
  return { steps, cases: valid };
}

// ------------------------------------------------------------------------------------------------ F-APPROVAL
export const ROLES_WRONG = O.approval.derivation.wrongRoles;
function rightRoles(req, decisionLifecycle) {
  const roles = ["ORG", "HOST"];
  if (!req.overlimit && req.owner === "c" && decisionLifecycle !== "reopen") roles.push("COHOST_OWNER");
  if (!req.overlimit && req.owner === "s") roles.push("L1_OWNER");
  return roles;
}
export function approvalCtx(c) {
  const a = D.audience[c.audience];
  const req = c.request;
  const inChain = c.role == null ? true : ["ORG", "HOST"].includes(c.role) || (c.role === "COHOST_OWNER" && req.owner === "c" && !req.overlimit) || (c.role === "L1_OWNER" && req.owner === "s" && !req.overlimit);
  return { ...c, invites: a.invites, inChain };
}
export function evalApproval(c) {
  const ctx = approvalCtx(c);
  const rule = first(O.approval.rules, ctx);
  if (!rule) return { rule: null, status: 0 };
  const t = rule.then, req = c.request;
  const out = { rule: rule.id };
  const msgKey = t.approver?.msg;
  const vars = { limit: req.owner === "c" ? 100 : 4, cap: "<cap>" };
  if (t.approver) {
    out.approver = { status: t.approver.status, code: t.approver.code ?? null };
    if (msgKey) out.approver.msg = fill(c.approval === "APPROVE_ALL" && t.approver.msgAll ? t.approver.msgAll : msgKey, vars);
    if (t.approver.body) out.approver.body = JSON.parse(JSON.stringify(t.approver.body).replace("\"by-rule\"", JSON.stringify(placedBy(c, req))));
    if (t.approver.body?.message) out.approver.body.message = fill(t.approver.body.message);
  } else out.approver = null;
  out.me = t.me === "waiting" && c.lifecycle === "organizer_ends" ? "lapsed" : t.me;
  if (rule.id === "A-NEVER") out.me = c.lifecycle === "organizer_ends" ? "lapsed" : "waiting";
  if (t.rejoin === "joinOracle") {
    const j = evalJoin({ ...c.request.case, lifecycle: c.lifecycle });
    out.rejoin = { status: j.status, code: j.code, note: "the join oracle for the original request at this lifecycle" };
  } else if (t.rejoin) out.rejoin = t.rejoin;
  if (t.final) out.final = t.final;
  return out;
}
function placedBy(c, req) {
  const role = c.role;
  const own = role === "HOST" ? `Host ${LABEL.host}` : "Organizer";
  if (req.overlimit) return own;
  if (c.capacity === "OVER_QUOTA" && (role === "ORG" || role === "HOST")) return own;
  return placedLabel(req.owner);
}
export function approvalCases() {
  const stateClass = { S04: "unlisted", S08: "idmiss", S09: "idmiss", S10: "idmiss" };
  const reqs = [], seenReq = new Set();
  for (const [audience, verify] of audVerify()) for (const route of ROUTES) for (const state of STATES) for (const reqLife of ["none", "reopen"]) for (const capacity of ["ROOM", "OVER_QUOTA"]) {
    if (reqLife === "reopen" && route !== "COHOST") continue;
    if (!stateValid(audience, verify, state, reqLife)) continue;
    const jc = { audience, verify, route, state, capacity, lifecycle: reqLife };
    const j = evalJoin(jc);
    if (!j.waiting) continue;
    const caps = O.join.rules.find((x) => x.id === j.rule).capacities ?? ["ROOM"];
    if (!caps.includes(capacity)) continue;
    const ctx = joinCtx(jc);
    const idKind = (state === "S08" || state === "S09" || state === "S10") && (verify === "id" || verify === "either") ? "id" : "phone";
    const overlimit = capacity === "OVER_QUOTA" && j.rule === "J-OVER-QUOTA-OPEN";
    const key = [audience, route, stateClass[state], idKind, reqLife, overlimit].join("|"); // PR-10
    if (seenReq.has(key)) continue; seenReq.add(key);
    reqs.push({ audience, verify, route, state, reqLife, request: { case: jc, owner: ctx.owner, overlimit, rule: j.rule } });
  }
  const out = [], seen = new Set();
  const push = (rq, approval, role, lifecycle, capacity) => {
    const c = { audience: rq.audience, verify: rq.verify, route: rq.route, state: rq.state, reqLife: rq.reqLife, request: rq.request, approval, role, lifecycle, capacity };
    const r = evalApproval(c);
    const rule = O.approval.rules.find((x) => x.id === r.rule);
    const caps = rule?.capacities ?? ["ROOM"];
    if (!caps.includes(capacity)) return;
    const ign = new Set(rule?.ignores ?? []);
    if (ign.size) {
      const key = r.rule + "|" + ["audience", "verify", "route", "state", "reqLife", "approval", "role", "lifecycle", "capacity"].filter((k) => !ign.has(k)).map((k) => c[k]).join("|") + (ign.has("route") ? "" : "|" + rq.request.owner);
      if (seen.has(key)) return; seen.add(key);
    }
    out.push({ c, r });
  };
  for (const rq of reqs) {
    const quotaCaps = (lc) => (!rq.request.overlimit && (rq.request.owner === "c" || rq.request.owner === "s") ? ["ROOM", "OVER_QUOTA"] : ["ROOM"]);
    if (rq.reqLife === "reopen") { // PR-11: after a reopen only the Co-host link request differs
      const right = rightRoles(rq.request, "reopen");
      for (const role of right) push(rq, "APPROVE", role, "reopen", "ROOM");
      push(rq, "NEVER", null, "reopen", "ROOM");
      push(rq, "WRONG_ROLE", "COHOST_OTHER", "reopen", "ROOM");
      continue;
    }
    // base: lifecycle none
    const right = rightRoles(rq.request, "none");
    for (const approval of ["APPROVE", "APPROVE_ALL"]) for (const role of right) for (const capacity of quotaCaps()) push(rq, approval, role, "none", capacity);
    for (const role of right) push(rq, "DECLINE", role, "none", "ROOM");
    for (const role of right) push(rq, "APPROVE_AFTER_FULL", role, "none", "FULL");
    for (const role of right) push(rq, "APPROVE_AFTER_REMOVAL", role, "none", "ROOM");
    for (const role of ROLES_WRONG) push(rq, "WRONG_ROLE", role, "none", "ROOM");
    push(rq, "NEVER", null, "none", "ROOM");
    // sweep
    for (const lifecycle of ["pause_resume", "late_join", "organizer_ends", "cancelled_before_start"]) {
      for (const role of rightRoles(rq.request, lifecycle)) push(rq, "APPROVE", role, lifecycle, "ROOM");
      push(rq, "NEVER", null, lifecycle, "ROOM");
      if (lifecycle === "organizer_ends" || lifecycle === "cancelled_before_start") for (const role of ["COHOST_OTHER", "L1_OTHER"]) push(rq, "WRONG_ROLE", role, lifecycle, "ROOM");
    }
  }
  return { requests: reqs.length, cases: out };
}

// ------------------------------------------------------------------------------------------------ F-INPUT
export const profileOf = (audience, verify) => (verify === "mobile" ? "mobile" : verify + (D.audience[audience].employeesOnly ? ".eo" : ""));
export function evalInput(defectId, audience, verify) {
  let d = O.input.defects.find((x) => x.id === defectId);
  if (d.same) d = { ...O.input.defects.find((x) => x.id === d.same), id: d.id, request: d.request };
  const prof = profileOf(audience, verify);
  const raw = d.expectAll ?? d.expect?.[prof];
  if (raw === "continue") {
    const j = evalJoin({ audience, verify, route: "DIRECT", state: "S04", capacity: "ROOM", lifecycle: "none" });
    return { kind: "continue", status: j.status, code: j.code, waiting: j.waiting, msg: j.msg, rule: j.rule };
  }
  return { kind: "fixed", status: raw[0], code: raw[1], waiting: raw[0] === 403 && raw[1] === "waiting", msg: fill(raw[2], { with: "the organizer" }) };
}
export function inputCases() {
  const out = [], seen = new Set();
  for (const d of O.input.defects) for (const [audience, verify] of audVerify()) {
    const r = evalInput(d.id, audience, verify);
    const key = r.kind === "fixed" ? `${d.id}|${profileOf(audience, verify)}` : `${d.id}|${audience}|${verify}`;
    if (seen.has(key)) continue; seen.add(key);
    out.push({ c: { audience, verify, defect: d.id }, r });
  }
  return { cases: out };
}

// ------------------------------------------------------------------------------------------------ F-PERM
export function evalPerm(c) {
  const ctx = { ...c };
  const rule = first(O.perm.rules, ctx);
  const [status, code, msg] = rule.then;
  return { rule: rule.id, status, code, msg: msg ? fill(msg) : O.perm.okNotes[c.op] ?? "ok" };
}
export function permCases() {
  const out = [], seen = new Set();
  for (const caller of O.perm.callers) for (const op of Object.keys(O.perm.ops)) for (const invites of O.perm.invites) for (const lifecycle of O.perm.lifecycle) {
    if ((op === "EXPORT" || op === "WAITING_LIST" || op === "LIST") && false) continue;
    const c = { caller, op, invites, lifecycle };
    const r = evalPerm(c);
    const rule = O.perm.rules.find((x) => x.id === r.rule), ign = new Set(rule.ignores ?? []);
    const key = r.rule + "|" + ["caller", "op", "invites", "lifecycle"].filter((k) => !ign.has(k)).map((k) => c[k]).join("|");
    if (seen.has(key)) continue; seen.add(key);
    out.push({ c, r });
  }
  return { raw: O.perm.callers.length * Object.keys(O.perm.ops).length * 2 * O.perm.lifecycle.length, cases: out };
}

// ------------------------------------------------------------------------------------------------ everything, with the play-mode replicate
export function allCases() {
  const J = joinCases(), A = approvalCases(), I = inputCases(), P = permCases();
  const rows = [];
  const tag = (fam, play, c, extra) => `${fam}.${play}.${extra}`;
  for (const play of PLAY) {
    for (const { c, r } of J.cases) rows.push({ id: tag("J", play, c, [c.audience, c.verify, c.route, c.state, c.capacity, c.lifecycle].join(".")), family: "J", play, ...c, expected: r });
    for (const { c, r } of A.cases) rows.push({ id: tag("A", play, c, [c.audience, c.verify, c.route, c.state, c.approval, c.role ?? "none", c.capacity, c.lifecycle].join(".") + (c.reqLife === "reopen" ? ".reqReopen" : "")), family: "A", play, ...c, expected: r });
    for (const { c, r } of I.cases) rows.push({ id: tag("I", play, c, [c.audience, c.verify, c.defect].join(".")), family: "I", play, ...c, expected: r });
    for (const { c, r } of P.cases) rows.push({ id: tag("P", play, c, [c.caller, c.op, "inv" + (c.invites ? 1 : 0), c.lifecycle].join(".")), family: "P", play, ...c, expected: r });
  }
  return { J, A, I, P, rows };
}

// ------------------------------------------------------------------------------------------------ examples (the first 60 concrete named cases)
const sayState = { S01: "listed by mobile", S02: "listed by ID only", S03: "listed by mobile and ID", S04: "an outsider (not listed)", S05: "removed", S06: "already joined on another phone", S07: "second ticket on the same phone", S08: "types a wrong ID", S09: "types the ID of a joined colleague", S10: "types the ID of a listed colleague who has not joined", S11: "returning on the same phone" };
const sayRoute = { ORG: "the Organizer's link", HOST: "a Host's link", COHOST: "a Co-host's link", PERSONAL: "a personal link", GUEST_L1: "a level-1 guest's invite link", GUEST_L2: "a level-2 guest's invite link", DIRECT: "the bare game address" };
const sayAud = { EMP_ONLY: "employees-only game", LIST: "closed-list game", LIST_INV: "closed-list game with guest invites", ANYONE: "open game", EMP_ID_OTHERS: "open game (employees by ID, others by mobile)", ANYONE_INV: "open game with guest invites" };
const sayVerify = { mobile: "mobile", id: "ID", either: "ID or mobile", both: "ID and mobile" };
const short = (e) => (e == null ? "" : e.approver === undefined ? `${e.status}${e.code && e.code !== "ticket" ? " " + e.code : e.code === "ticket" ? " ticket" : ""}${e.waiting ? " (waiting, with " + e.with + ")" : ""}${e.rule ? " [" + e.rule + "]" : ""}` : `${e.approver ? e.approver.status + (e.approver.code ? " " + e.approver.code : "") : "no call"}; phone sees ${e.me}${e.rejoin?.status ? "; re-join " + e.rejoin.status + (e.rejoin.code ? " " + e.rejoin.code : "") : ""} [${e.rule}]`);
export function examples(n = 60) {
  const { rows } = allCases();
  const pick = [], seenKey = new Set();
  const add = (row) => { if (pick.length < n && !pick.includes(row)) { pick.push(row); } };
  // one JOIN case per join rule (auto), preferring a different route each time
  const routeCycle = ["DIRECT", "ORG", "HOST", "COHOST", "PERSONAL", "GUEST_L1", "GUEST_L2"];
  let k = 0;
  for (const rule of O.join.rules) {
    const cand = rows.filter((r) => r.family === "J" && r.play === "auto" && r.expected.rule === rule.id);
    const want = routeCycle[k++ % routeCycle.length];
    add(cand.find((r) => r.route === want && r.audience !== "ANYONE_INV") ?? cand.find((r) => r.audience !== "ANYONE_INV") ?? cand[0]);
  }
  // approvals: one per approval rule, then a few role contrasts
  for (const rule of O.approval.rules) { const cand = rows.filter((r) => r.family === "A" && r.play === "auto" && r.expected.rule === rule.id); if (cand.length) add(cand[Math.floor(cand.length / 3)]); }
  // input defects: eight different
  for (const id of ["D01", "D03", "D06", "D11", "D13", "D15", "D16", "D17"]) { const cand = rows.filter((r) => r.family === "I" && r.play === "auto" && r.defect === id); if (cand.length) add(cand[Math.floor(cand.length / 2)]); }
  // permissions: one per permission rule
  for (const rule of O.perm.rules) { const cand = rows.filter((r) => r.family === "P" && r.play === "auto" && r.expected.rule === rule.id); if (cand.length) add(cand[0]); }
  // manual-mode twins of the first three
  for (const r of pick.slice(0, 3)) { const twin = rows.find((x) => x.play === "manual" && x.id.replace(".manual.", ".auto.") === r.id); if (twin) add(twin); }
  void seenKey;
  return pick.slice(0, n).map((r, i) => {
    let given = "";
    if (r.family === "J") given = `${sayAud[r.audience]}, give ${sayVerify[r.verify]}; arrives by ${sayRoute[r.route]}; ${sayState[r.state]}; capacity ${r.capacity}; ${r.lifecycle}`;
    if (r.family === "A") given = `${sayAud[r.audience]}, give ${sayVerify[r.verify]}; request came by ${sayRoute[r.route]} (${sayState[r.state]}); approval ${r.approval}${r.role ? " by " + r.role : ""}; list/capacity ${r.capacity}; ${r.lifecycle}`;
    if (r.family === "I") given = `${sayAud[r.audience]}, give ${sayVerify[r.verify]}; defect ${r.defect}: ${O.input.defects.find((d) => d.id === r.defect).what}`;
    if (r.family === "P") given = `${r.caller} does ${r.op}; guest invites ${r.invites ? "on" : "off"}; ${r.lifecycle}`;
    return { n: i + 1, id: r.id, given, expect: short(r.expected) + (r.expected.msg ? ` "${r.expected.msg}"` : r.expected.approver?.msg ? ` "${r.expected.approver.msg}"` : "") };
  });
}

// ------------------------------------------------------------------------------------------------ CLI
const isMain = process.argv[1] && new URL(import.meta.url).pathname.replace(/^\//, "").toLowerCase() === process.argv[1].replace(/\\/g, "/").toLowerCase();
if (isMain) {
  const args = process.argv.slice(2);
  if (args[0] === "--list") {
    const fam = args[1] ?? "";
    for (const r of allCases().rows) if (!fam || r.family === fam) console.log(JSON.stringify(r));
  } else if (args[0] === "--examples") {
    for (const e of examples(Number(args[1] ?? 60))) console.log(`| ${e.n} | \`${e.id}\` | ${e.given} | ${e.expect.replace(/\|/g, "/")} |`);
  } else {
    const { J, A, I, P, rows } = allCases();
    const by = (fam, key) => { const m = {}; for (const r of rows) if (r.family === fam && r.play === "auto") m[r[key]] = (m[r[key]] ?? 0) + 1; return m; };
    console.log("DIMENSIONS");
    console.log("  playMode", PLAY.length, "| verify 4 | audience", AUDIENCES.length, "(5 specified + 1 extension) | route", ROUTES.length, "| state", STATES.length, "| capacity", CAPS.length, "| lifecycle", LIFES.length);
    console.log("  (audience x verify) pairs allowed by PR-01:", audVerify().length);
    console.log("F-JOIN (play=auto)");
    console.log("  raw cross (6 audiences x 4 verify x 7 routes x 11 states x 4 capacities x 6 lifecycles):", J.steps.raw);
    console.log("  after PR-01 (audience x verify pairs):", J.steps.afterPR01);
    console.log("  after PR-02/PR-03 (impossible person states):", J.steps.afterPR02_03);
    console.log("  after PR-04 (capacity only where it can matter):", J.steps.afterPR04);
    console.log("  after PR-05 (gate-dominated duplicates):", J.steps.afterPR05, " of which waiting requests:", J.cases.filter((x) => x.r.waiting).length);
    console.log("F-APPROVAL (play=auto): requests", A.requests, "-> cases", A.cases.length);
    console.log("F-INPUT (play=auto):", I.cases.length, "| F-PERM (play=auto): raw", P.raw, "-> cases", P.cases.length);
    const auto = rows.filter((r) => r.play === "auto");
    console.log("TOTAL play=auto:", auto.length, "| play=manual:", rows.length - auto.length, "| FULL MATRIX (both play modes):", rows.length);
    const core = auto.filter((r) => r.lifecycle !== "pause_resume");
    console.log("  without the pause_resume replicate (auto only):", core.length);
    console.log("  extension audience ANYONE_INV share (auto):", auto.filter((r) => r.audience === "ANYONE_INV").length);
    console.log("BY FAMILY (auto):", { J: J.cases.length, A: A.cases.length, I: I.cases.length, P: P.cases.length });
    console.log("J by audience:", by("J", "audience"));
    console.log("J by lifecycle:", by("J", "lifecycle"));
    console.log("J by route:", by("J", "route"));
    console.log("J by state:", by("J", "state"));
    console.log("J by capacity:", by("J", "capacity"));
    console.log("A by approval:", by("A", "approval"));
    console.log("A by lifecycle:", by("A", "lifecycle"));
    const ruleCount = {}; for (const r of auto) { const k = r.family + ":" + r.expected.rule; ruleCount[k] = (ruleCount[k] ?? 0) + 1; }
    console.log("cases per answering rule (auto):", ruleCount);
    const sig = new Set(auto.map((r) => JSON.stringify([r.family, r.expected.rule, r.expected.status ?? r.expected.approver?.status, r.expected.code, r.expected.waiting, r.expected.with, r.expected.me, r.expected.final, r.expected.person?.inviter, r.expected.seat?.inv, r.expected.rejoin?.status]))).size;
    console.log("distinct answer signatures (auto):", sig);
  }
}
