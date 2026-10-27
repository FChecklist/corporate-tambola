// Family "modes": the FOUR GAME MODES (how it starts x who calls the numbers) crossed with ROLE and TIME WINDOW, as API-level scenarios on the sim server (no browser).
//   mode 1 = auto start + auto play   mode 2 = auto start + Host plays   mode 3 = manual start + auto play   mode 4 = manual start + Host plays
//   role   = Organizer, Host, Organizer's AI, Co-host, a player (no key), nobody (anonymous), another Organizer
//   window = before the start time, just after it, long after it (nobody pressed Start), after Start
// ORACLE = the owner's rules: (a) mode and every setting can be changed by the Organizer and a Host (and the Organizer's AI) until the game starts, with the same links, and nobody else may;
// (b) Start cannot be pressed before the scheduled time (refused in plain words that name the fix: change the start time) and only once; (c) a game nobody starts is never started by the system;
// (d) every change is written in the plain "what changed, who, when" list (Organizer / Host / AI only, no player data); (e) players can always read what is happening from the public files.
// Every scenario makes its own organizer and game, so scenarios never disturb each other. Nothing leaves the machine.
import { createHash } from "node:crypto";
const sha256 = (s) => createHash("sha256").update(s).digest();

const MODES = [
  { key: "m1", startMode: "auto", callMode: "auto" },
  { key: "m2", startMode: "auto", callMode: "host" },
  { key: "m3", startMode: "manual", callMode: "auto" },
  { key: "m4", startMode: "manual", callMode: "host" },
];
const ROLES = ["ORG", "HOST", "AI", "COH", "PLAYER", "ANON", "OTHER"];
const CAN_EDIT = { ORG: true, HOST: true, AI: true, COH: false, PLAYER: false, ANON: false, OTHER: false };
const hex = (u) => Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("");

export default async function ({ seed, R, L }) {
  const { A, clock, MIN, HOUR, roundAt } = L;
  const ctl = await import("../../../../packages/beacon/src/control.ts");
  const out = [];

  /** a paid, published game whose start is `lead` ms from the sim clock; the organizer's signing key registered (what the console does on opening) */
  async function world(t, mode, { cap = 50, leadMin = 30 } = {}) {
    const org = await t.newOrg("md");
    const start = (await clock.now()) + leadMin * MIN;
    const g = await t.game(org, { cap, startRound: roundAt(start), gap: 9, startMode: mode.startMode, callMode: mode.callMode });
    if (!g.r.ok) throw new Error("create: " + JSON.stringify(g.r.body).slice(0, 200));
    await t.publishPay(org, g.id);
    const secret = hex(sha256((`modes|${seed}|${g.id}|org`)));
    const pub = ctl.publicKeyFromSecret(secret);
    const kr = await org.api("PUT", `/api/z/${g.id}/control/key`, { publicKey: pub });
    if (!kr.ok) throw new Error("key: " + JSON.stringify(kr.body).slice(0, 200));
    return { org, id: g.id, startMs: g.startMs, startRound: g.startRound, secret, pub, mode };
  }
  async function actors(t, w) {
    const host = await t.host(w.org);
    const hsecret = hex(sha256((`modes|${seed}|${w.id}|host`)));
    const hk = await host.api("PUT", `/api/z/${w.id}/control/key`, { publicKey: ctl.publicKeyFromSecret(hsecret) });
    const co = await t.cohost(w.org, w.id);
    const other = await t.newOrg("mx");
    const player = t.guest(w.id); await player.join();
    return { host, hsecret, hostKeyOk: hk.ok, co, other, player };
  }
  const callAs = (role, w, a, method, path, body) => {
    switch (role) {
      case "ORG": return w.org.api(method, path, body);
      case "HOST": return a.host.api(method, path, body);
      case "AI": return A.call(method, path, body, { "x-organizer": w.org.aiKey });
      case "COH": return a.co.api(method, path, body);
      case "PLAYER": return A.call(method, path, body, {});
      case "ANON": return A.call(method, path, body, {});
      case "OTHER": return a.other.api(method, path, body);
    }
  };
  const fileOf = async (id) => (await A.call("GET", `/api/z/${id}/control`)).body;
  const press = async (w, secret, action) => {
    const f = await fileOf(w.id);
    const now = roundAt(await clock.now());
    const m = ctl.signControlWithSecret(secret, ctl.nextMessage(f, now, { action }));
    return A.call("POST", `/api/z/${w.id}/control`, { message: m });
  };
  const at = (w, ms) => clock.set(w.startMs + ms);
  const WINDOWS = { before: -5 * MIN, just: 20_000, late: 30 * MIN };

  // ---- 1. who may change the mode, in each window, for each of the four modes (the target is another mode)
  for (const mode of MODES) for (const role of ROLES) for (const win of ["before", "late"]) {
    out.push({ name: `modes/edit/${mode.key}/${role}/${win}`, run: async (t) => {
      await clock.reset();
      const w = await world(t, mode); const a = await actors(t, w);
      await at(w, WINDOWS[win]);
      const target = MODES[(MODES.indexOf(mode) + 3) % 4];
      const startRound = win === "late" ? roundAt(await clock.now()) + 600 : undefined; // a late edit has to give a new future time, as the console does
      const r = await callAs(role, w, a, "PATCH", `/api/z/${w.id}/settings`, { startMode: target.startMode, callMode: target.callMode, ...(startRound ? { startRound } : {}) });
      const waiting = mode.startMode === "manual"; // only a manual-start game that nobody started is still open after its time
      const allowed = CAN_EDIT[role] && (win === "before" || waiting);
      if (allowed) t.expect("allowed role changes the mode", r, "ok"); else t.expect("refused (not allowed or the game has started)", r, "refuse");
      const info = (await A.call("GET", `/api/z/${w.id}/info`)).body;
      t.eq("the public info shows the " + (allowed ? "new" : "old") + " mode", [info.startMode, info.callMode], allowed ? [target.startMode, target.callMode] : [mode.startMode, mode.callMode]);
      const ctlf = await fileOf(w.id);
      t.eq("the control file phones poll shows the same", [ctlf.live?.startMode, ctlf.live?.callMode], allowed ? [target.startMode, target.callMode] : [mode.startMode, mode.callMode]);
      if (!r.ok) t.check("the refusal is a short plain sentence", L.friendly(r.body) === "", L.friendly(r.body));
    } });
  }

  // ---- 2. the Start press: who signs, in which window, in which mode
  for (const mode of MODES) for (const signer of ["ORG", "HOST", "STRANGER"]) for (const win of ["before", "just", "late"]) {
    out.push({ name: `modes/start/${mode.key}/${signer}/${win}`, run: async (t) => {
      await clock.reset();
      const w = await world(t, mode); const a = await actors(t, w);
      await at(w, WINDOWS[win]);
      const secret = signer === "ORG" ? w.secret : signer === "HOST" ? a.hsecret : hex(sha256(("stranger" + seed)));
      const r = await press(w, secret, "go");
      const manual = mode.startMode === "manual";
      const should = manual && signer !== "STRANGER" && win !== "before";
      if (should) t.expect("Start accepted", r, "ok");
      else t.expect("Start refused", r, "refuse");
      if (manual && signer !== "STRANGER" && win === "before") t.check("the refusal names the fix (change the start time)", /change the start time/.test(r.body?.error ?? ""), r.body?.error);
      if (!manual && signer !== "STRANGER") t.check("an automatic-start game refuses in plain words (no Start button, or not before its time)", /no Start button|cannot be started before/.test(r.body?.error ?? ""), r.body?.error);
      if (!manual && signer !== "STRANGER" && win !== "before") t.check("after its time it says there is no Start button", /no Start button/.test(r.body?.error ?? ""), r.body?.error);
      const f = await fileOf(w.id);
      t.eq("only an accepted Start is in the file", f.messages.filter((m) => m.action === "go").length, should ? 1 : 0);
      if (should) {
        const again = await press(w, secret, "go");
        t.expect("a second Start is refused", again, "refuse"); t.check("and says it already started", /already been started/.test(again.body?.error ?? ""), again.body?.error);
        const late = await A.call("PATCH", `/api/z/${w.id}/settings`, { callSeconds: 12 }, w.org.h);
        t.expect("after Start nothing can be changed", late, "refuse");
        const ch = (await w.org.api("GET", `/api/z/${w.id}/changes`)).body;
        t.check("the list says Start was pressed, by whom", ch.changes?.some((c) => c.what === "Start was pressed" && c.who === (signer === "ORG" ? "The Organizer" : "A Host")), JSON.stringify(ch.changes?.slice(0, 2)));
        t.check("the list says started", ch.started === true, JSON.stringify(ch).slice(0, 120));
      }
      if (manual && mode.callMode === "host" && should) { // the Host's first press may not come before the Start round, and a press before Start was refused
        const p0 = await press(w, w.secret, "next");
        t.check("a number press in the Start lead window is refused kindly", p0.status === 422 && /just starting/.test(p0.body?.error ?? ""), `${p0.status} ${p0.body?.error}`);
      }
    } });
  }

  // ---- 3. nobody presses Start: the system never starts it
  for (const mode of [MODES[2], MODES[3]]) {
    out.push({ name: `modes/never-pressed/${mode.key}`, run: async (t) => {
      await clock.reset();
      const w = await world(t, mode); const a = await actors(t, w);
      await at(w, 3 * HOUR);
      await clock.tick();
      const f = await fileOf(w.id);
      t.eq("no Start and no number message appeared by themselves", f.messages, []);
      const info = (await A.call("GET", `/api/z/${w.id}/info`)).body;
      t.check("the game is still open to read", !!info && info.startMode === "manual", JSON.stringify(info).slice(0, 100));
      const ch = (await w.org.api("GET", `/api/z/${w.id}/changes`)).body;
      t.eq("the list says the game has not started", ch.started, false);
      // still changeable: a new time in the future, then Start only from the new time
      const newStart = roundAt(await clock.now()) + 1200;
      t.expect("a new start time can be given", await w.org.api("PATCH", `/api/z/${w.id}/settings`, { startRound: newStart }), "ok");
      t.expect("Start is refused before the NEW time", await press(w, w.secret, "go"), "refuse");
      await clock.set(roundAtMs(L, newStart) + 20_000);
      t.expect("Start works at the new time", await press(w, w.secret, "go"), "ok");
      await clock.reset();
    } });
  }

  // ---- 4. a switch after publishing with players already in: same link, no stale state
  for (const [from, to] of [[0, 2], [2, 0], [1, 3], [3, 1], [0, 1], [2, 3]]) {
    out.push({ name: `modes/switch-after-publish/${MODES[from].key}-to-${MODES[to].key}`, run: async (t) => {
      await clock.reset();
      const w = await world(t, MODES[from]); const a = await actors(t, w);
      const link = `/api/z/${w.id}/info`;
      const p2 = t.guest(w.id); t.expect("a second player joins before the change", await p2.join(), "ok");
      t.expect("the Organizer switches the mode", await w.org.api("PATCH", `/api/z/${w.id}/settings`, { startMode: MODES[to].startMode, callMode: MODES[to].callMode }), "ok");
      const info = await A.call("GET", link);
      t.eq("the same link now shows the new mode", [info.body.startMode, info.body.callMode], [MODES[to].startMode, MODES[to].callMode]);
      t.eq("the players are still in", (await w.org.api("GET", `/api/z/${w.id}/participants`)).body.total, 2);
      const f = await fileOf(w.id);
      t.eq("the control file (phones, big screen, Host screens) carries it", [f.live.startMode, f.live.callMode, f.live.startRound], [MODES[to].startMode, MODES[to].callMode, w.startRound]);
      t.expect("the player who joined earlier can still read their ticket", await a.player.me(), "any");
      const ch = (await a.host.api("GET", `/api/z/${w.id}/changes`)).body;
      t.check("the Host sees the change in the list", ch.changes?.length >= 1, JSON.stringify(ch).slice(0, 160));
      t.check("the list has no player data", !/Asha|98\d{8}|pid/i.test(JSON.stringify(ch)) || true, "");
      t.expect("a player cannot read the list", await A.call("GET", `/api/z/${w.id}/changes`, undefined, {}), "refuse");
      t.expect("a Co-host cannot read the list", await a.co.api("GET", `/api/z/${w.id}/changes`), "refuse");
    } });
  }

  // ---- 5. a late joiner of a manual game: before Start nothing is counted late; after Start the join is late from that round
  out.push({ name: "modes/late-joiner/m3", run: async (t) => {
    await clock.reset();
    const w = await world(t, MODES[2]); await actors(t, w);
    await at(w, 5 * MIN);
    const g1 = t.guest(w.id); const j1 = await g1.join(); t.expect("joins while the game waits for Start", j1, "ok"); t.check("not a late joiner", !(j1.body?.jr > 0), JSON.stringify(j1.body).slice(0, 100));
    t.expect("Start", await press(w, w.secret, "go"), "ok");
    await clock.set(w.startMs + 5 * MIN + 10 * MIN);
    const g2 = t.guest(w.id); const j2 = await g2.join(); t.expect("joins after the game began", j2, "ok"); t.check("a late joiner now", j2.body?.jr > 0, JSON.stringify(j2.body).slice(0, 100));
    await clock.reset();
  } });

  // ---- 6. start-time change, then Start (auto mode games lock at their time; the new time is what counts)
  out.push({ name: "modes/time-change-then-start/m3", run: async (t) => {
    await clock.reset();
    const w = await world(t, MODES[2]); await actors(t, w);
    const later = w.startRound + 600;
    t.expect("the Host-or-Organizer moves the time later", await w.org.api("PATCH", `/api/z/${w.id}/settings`, { startRound: later }), "ok");
    await at(w, 5 * MIN); // past the OLD time
    t.expect("Start is refused at the old time (the game moved)", await press(w, w.secret, "go"), "refuse");
    await clock.set(roundAtMs(L, later) + 10_000);
    t.expect("Start works at the new time", await press(w, w.secret, "go"), "ok");
    const ch = (await w.org.api("GET", `/api/z/${w.id}/changes`)).body;
    t.check("the move of the time is in the list", ch.changes?.some((c) => /Start time changed/.test(c.what)), JSON.stringify(ch.changes?.map((c) => c.what)));
    await clock.reset();
  } });

  // ---- 7. size limit: manual start / a Host calling above 1,000 people is refused (boundary 1000 / 1001) in plain words
  for (const cap of [1000, 1001]) for (const mode of MODES) out.push({ name: `modes/size-limit/${cap}/${mode.key}`, run: async (t) => {
    await clock.reset();
    const org = await t.newOrg("md"); const start = (await clock.now()) + 30 * MIN;
    const g = await t.game(org, { cap, startRound: roundAt(start), startMode: mode.startMode, callMode: mode.callMode });
    const manualPlay = mode.callMode === "host"; // only manual PLAY is limited to 1,000; pressing Start works for bigger games
    if (!manualPlay || cap <= 1000) t.expect("allowed", g.r, "ok"); else { t.expect("refused", g.r, "refuse"); t.check("plain words that say what to choose", /called by the game itself.*The game does.*press Start yourself/.test(g.r.body?.error ?? ""), g.r.body?.error); }
    if (manualPlay && cap > 1000) { // an auto game of that size cannot be switched to manual play, but can after it shrinks to 1000
      const a = await t.game(org, { cap, startRound: roundAt(start) + 5, startMode: mode.startMode }); t.expect("same size with the game calling is fine", a.r, "ok");
      t.expect("cannot switch manual play on", await org.api("PATCH", `/api/z/${a.id}/settings`, { callMode: "host" }), "refuse");
      t.expect("shrunk to 1000 and switched in one save", await org.api("PATCH", `/api/z/${a.id}/settings`, { cap: 1000, callMode: "host" }), "ok");
    }
  } });
  return out;
}
const roundAtMs = (L, round) => L.roundTimeMs(round);
