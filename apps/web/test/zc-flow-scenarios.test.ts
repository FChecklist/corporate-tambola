// New organizer flow, scenario matrix (2026-10-30, owner order): the cross product of the options, 10,000+ scenarios in fast mode, each checked against an independent oracle (logic test),
// plus a wire test (screen choices -> API payload) and a smoke test (every step draws for sample scenarios).
// FALSIFIED BY: scen-pay-pending-opens, scen-cap-ignored, scen-family-after-cutoff, scen-cohost-approver-missing, scen-open-needs-approval, scen-listed-offlist-enters, wire-callmode-lost, wire-startmode-lost
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { PRIZE_HOUSES } from "../../../packages/beacon/src/config";
import { waitingLapsed, familyCutoffPassed } from "../../edge/src/approvals";

const pub = (f: string) => readFileSync(join(import.meta.dir, "../public", f), "utf8");
const rolesWin: any = {}; new Function("window", pub("zc-flow-roles.js"))(rolesWin); const R = rolesWin.ZROLES;
const src = ["zc-flow-game.js", "pack/zc-flow.js", "zc-flow-roles.js", "zc-flow-tambola.js"].map(pub).join("\n");
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

const AXES = {
  start: ["auto", "manual"], caller: ["auto", "host"], tickets: [1, 2], family: [false, true], validation: ["system", "manual"], criterion: ["employee", "email"],
  link: ["open", "listed", "family", "cohost", "host"], onList: [true, false], approval: [true, false], pay: ["pending", "paid", "free"], timing: ["early", "late"], cap: ["room", "full"], bumper: [0, 1, 2, 5, 10], lucky: [0, 1, 3], waited: [10, 40],
} as const;
function* matrix() {
  const keys = Object.keys(AXES) as (keyof typeof AXES)[];
  const idx = keys.map(() => 0);
  while (true) {
    const sc: any = {}; keys.forEach((k, i) => (sc[k] = (AXES[k] as readonly any[])[idx[i]]));
    yield sc;
    let i = keys.length - 1;
    while (i >= 0 && ++idx[i] === (AXES[keys[i]] as readonly any[]).length) { idx[i] = 0; i--; }
    if (i < 0) return;
  }
}
/** The oracle: the owner's rules (note 29) as a flat list, first match wins. Not the same code as zc-flow-roles.js. */
function oracle(sc: any, minutesToStart: number) {
  const rules: [boolean, string, string[]][] = [
    [sc.pay === "pending", "not_open", []],
    [sc.cap === "full", "full", []],
    [sc.link === "family" && !sc.family, "refused", []],
    [sc.link === "family" && minutesToStart <= 15, "refused", []],
    [sc.link === "family" && sc.waited >= 30, "lapsed", []],
    [sc.link === "family", "waiting", ["family host"]],
    [sc.link === "open", "in", []],
    [sc.validation === "system" && sc.onList, "in", []],
    [sc.waited >= 30, "lapsed", []],
    [sc.link === "cohost", "waiting", ["Co-host", "Host", "organizer"]],
    [true, "waiting", ["Host", "organizer"]],
  ];
  const r = rules.find((x) => x[0])!; return { outcome: r[1], approvers: r[2] };
}
const SUMMARY = (st: string, ca: string) => "Your game: " + (st === "manual" ? "starts at the time you set when you press Start." : "starts by itself at the time you set.") + " " + (ca === "host" ? "You call the numbers." : "The game calls the numbers.");
function newPage(calls: any[] = [], answers: (u: string) => any = () => ({ ok: true })) {
  const w: any = new Window({ url: "http://localhost/zc.html?flow=new&e=EABCDEF" });
  w.document.body.innerHTML = '<main id="app"></main>'; w.ZG = { roundAt: (m: number) => m, PRIZE_HOUSES };
  const f = async (u: string, o: any = {}) => { calls.push({ u, m: o.method || "GET", b: o.body ? JSON.parse(o.body) : null }); return { ok: true, json: async () => answers(u) }; };
  new Function("window", "document", "location", "fetch", "MutationObserver", src)(w, w.document, w.location, f, w.MutationObserver);
  return w;
}

const PRIZE_PAGE = (() => { const w: any = new Window({ url: "http://localhost/zc.html?flow=new&e=EABCDEF" }); w.document.body.innerHTML = '<main id="app"></main>'; w.ZG = { roundAt: (m: number) => m, PRIZE_HOUSES };
  new Function("window", "document", "location", "fetch", "MutationObserver", src)(w, w.document, w.location, async () => ({ ok: true, json: async () => ({ ok: true }) }), w.MutationObserver); return w.ZFLOW; })();
const PRIZE_CACHE = new Map<string, any[]>();
test("logic: every scenario of the matrix (10,000+) gives the owner's outcome and the right approvers", () => {
  let n = 0; const bad: string[] = [];
  for (const sc of matrix()) {
    n++;
    const minutes = sc.timing === "late" ? 10 : 120;
    const got = R.decide({ link: sc.link, validation: sc.validation, onList: sc.onList, family: sc.family, pay: sc.pay, minutesToStart: minutes, capFull: sc.cap === "full", waitedMinutes: sc.waited });
    const want = oracle(sc, minutes);
    if (got.outcome !== want.outcome || JSON.stringify(got.approvers) !== JSON.stringify(want.approvers)) { if (bad.length < 5) bad.push(JSON.stringify(sc) + " got " + JSON.stringify(got) + " want " + JSON.stringify(want)); }
    if (want.outcome === "waiting" && !got.approvers.length) bad.push("no approver for " + JSON.stringify(sc));
    // prizes: Super Bumper only with 2 tickets and only the ticked Houses 1 to n, each once; never an A/B split; one Super Bumper prize line per House
    const pk = sc.tickets + "/" + sc.bumper; let two = PRIZE_CACHE.get(pk);
    if (!two) { const F = PRIZE_PAGE, houses = F.housesOf({ PRIZE_HOUSES }), sel = F.defaultPrizes(houses); const bump = { on: sc.bumper > 0, n: Math.max(1, sc.bumper), gift: "Hamper", other: "", worth: "" }; two = F.buildRewards(sel, bump, sc.tickets, "INR").filter((x: any) => x.scope === "two_ticket"); PRIZE_CACHE.set(pk, two); }
    if (waitingLapsed(0, sc.waited * 60_000) !== (sc.waited >= 30) || familyCutoffPassed(60 * 60_000, (60 - minutes) * 60_000) !== (minutes <= 15)) bad.push("engine limits disagree " + JSON.stringify(sc));
    const wantTwo = sc.tickets === 2 && sc.bumper > 0 ? sc.bumper : 0;
    if (two.length !== wantTwo || two.some((x: any, i: number) => x.ordinal !== undefined && x.ordinal !== i + 1)) { if (bad.length < 5) bad.push("bumper " + JSON.stringify(sc) + " got " + two.length + " want " + wantTwo); }
  }
  console.log("scenarios run:", n, "failed:", bad.length);
  expect(n).toBeGreaterThanOrEqual(10000);
  expect(bad).toEqual([]);
});

test("logic: the Step 1 summary line is right for the four start and caller choices, and every role reads who approves", () => {
  const w = newPage();
  for (const st of AXES.start) for (const ca of AXES.caller) expect(w.ZTAMBOLA.runSummary({ start: st, call: ca }, "the time you set")).toBe(SUMMARY(st, ca));
  expect(R.approvalText("cohost")).toBe(""); expect(R.approvalText("host")).toContain("wait for you or the organizer"); expect(R.approvalText("organizer")).toContain("wait for you or a Host"); // 1.7.0: only what the engine does (no Co-host or family approval sentences)
  for (const r of ["organizer", "host", "cohost"]) expect(/\bwe\b|invite|private|Rs /i.test(R.approvalText(r))).toBe(false);
});

test("wire: every card and size becomes the right audience payload; every start/caller choice is saved and survives Step 2", async () => {
  let count = 0;
  for (const card of ["people", "family", "extended"]) for (const up of [100, 250, 500]) {
    const a = newPage().ZFLOW.audienceSettings(card, up); count++;
    expect(a.cap).toBe(up); expect(a.invites.on).toBe(card !== "people"); expect(a.invites.per).toBe(4);
    expect(a.invites.cats).toEqual(card === "people" ? [] : card === "family" ? ["family"] : ["family", "colleagues"]);
  }
  expect(count).toBe(9);
  for (const st of AXES.start) for (const ca of AXES.caller) {
    const calls: any[] = []; const w = newPage(calls);
    w.ZFLOW.state.eid = "EABCDEF"; w.ZFLOW.state.open = 1; w.ZFLOW.draw(); await tick();
    const set = (name: string, v: string) => { const r = w.document.querySelector(`input[name="${name}"][value="${v}"]`); r.checked = true; r.dispatchEvent(new w.Event("change")); };
    set("zt-start", st); set("zt-call", ca); await tick();
    const last = [...calls].reverse().find((c) => c.m === "PATCH" && c.b && "callMode" in c.b);
    expect(last.u).toBe("/api/z/EABCDEF/settings"); expect(last.b).toEqual({ startMode: st, callMode: ca });
    const sv = w.document.createElement("button"); sv.id = "zf-save2"; w.document.body.append(sv); calls.length = 0; sv.click(); await tick(900);
    expect(calls.some((c) => c.m === "PATCH" && c.b && c.b.startMode === st && c.b.callMode === ca)).toBe(true);
  }
});

test("smoke: every step draws for all three cards and both ticket counts without an error", async () => {
  let drawn = 0;
  for (const tix of [1, 2]) for (const card of ["people", "family", "extended"]) {
    const w = newPage([], (u) => (u.includes("ai-manifest") ? { packs: [{ upTo: 100, inr: 2399 }] } : { ok: true }));
    const F = w.ZFLOW; F.state.eid = "EABCDEF"; F.who.card = card; F.prizes.tix = tix; F.state.when = { ms: Date.now() + 86400000, zone: "Asia/Kolkata" };
    for (let step = 1; step <= 5; step++) { for (let k = 1; k < step; k++) F.state.done[k] = true; F.state.open = step; F.draw(); await tick(15); drawn++; expect(w.document.getElementById("zf-sec" + step)).not.toBe(null); }
  }
  expect(drawn).toBe(30);
});
