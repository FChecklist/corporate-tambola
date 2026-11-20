import { sha } from "./lib";
import { MIN, HOUR, DAY, T0, ordinals, DEFAULT_REWARDS, press, rawPress, ORG_SECRET, HOST_SECRET, listParticipants, type PhoneOpts } from "./lib";
import { roundTimeMs, roundAt, pickNumber, deriveCalls } from "../../packages/beacon/src";
import { cfgOf, resolveControl } from "../../packages/beacon/src/control";
import { hostGameOf } from "../../packages/beacon/src/game";
import { roundEid } from "../../packages/beacon/src/config";
import { rndOf } from "./lib";
import { check, runLoop, fairnessProbes, writeRec, type Ctx } from "./engine";
import { build, wrapUp, stdChecks, retentionCheck, leftovers, cpuProbe, snapLimits, type GameDef } from "./games";
import { makePhone, phoneJoin, type Phone } from "./lib";

let seed = 20261120; const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000);

/** a reasonable mix of real-world phones: most normal, a few on a bad line, a few behind a firewall, a few whose first mirror lies, a few cheats */
const mix = (n: number, o: { joinWindowMs?: number; lateFrac?: number; office?: string; lateAtMs?: number } = {}) => (i: number): PhoneOpts => {
  const r = rng();
  return { joinAtMs: Math.floor(rng() * (o.joinWindowMs ?? 10 * MIN)) + (rng() < (o.lateFrac ?? 0) ? (o.lateAtMs ?? 20 * MIN) : 0), ...(o.office ? { ip: o.office } : {}), blockedAll: i % 40 === 3, liar: i % 50 === 11, flaky: r < 0.08 ? 0.3 : 0, cheater: i % 100 === 7 };
};

export const GAMES: GameDef[] = [
  { title: "Scheduled start, game calls the numbers (whole office behind one network address)", run: async (n, people) => {
    const c = await build(n, "Scheduled start, auto numbers", "start: scheduled / numbers: auto", people, { id: "G250-01", startInRounds: 300, cap: people }, mix(people, { lateFrac: 0.04, office: "203.0.113.7", lateAtMs: 18 * MIN }));
    await runLoop(c, { maxMinutes: 120 });
    const out = await wrapUp(c);
    stdChecks(c, out, { minPrizes: 7 });
    await fairnessProbes(c, { forge: true });
    await retentionCheck(c);
    writeRec(c.rec, c.w);
  } },
  // ---------------------------------------------------------------- 2: host presses Start, game calls the numbers
  { title: "Host presses Start, game calls the numbers", run: async (n, people) => {
    const c = await build(n, "Host-started, auto numbers", "start: Host presses Start / numbers: auto", people, { id: "G250-02", startInRounds: 300, cap: people, startMode: "manual" }, mix(people, { joinWindowMs: 60_000 }), { host: true }); // everybody opens the link within one minute (a QR code on the big screen)
    const R = c.rec.extra as any; R.logBeforeGo = 0;
    c.onTick = async (c) => { await goBot(c, HOST_SECRET, 2 * MIN); const ref = c.refPhone(); if (ref && !c.goPressed) R.logBeforeGo = Math.max(R.logBeforeGo, ref.rt.view().log.length); };
    await runLoop(c, { maxMinutes: 130 });
    const out = await wrapUp(c);
    stdChecks(c, out, { minPrizes: 7 });
    check(c.rec.checks, "no number was shown by any phone before the Host pressed Start", R.logBeforeGo === 0, `${R.logBeforeGo}`);
    check(c.rec.checks, "the Start press was accepted", c.goPressed && R.goStatus === 200, `${R.goStatus} ${R.goError ?? ""}`);
    await startProbes(c);
    await fairnessProbes(c, { forge: true });
    await retentionCheck(c);
    writeRec(c.rec, c.w);
  } },
  // ---------------------------------------------------------------- 3: host presses Start, host calls every number
  { title: "Host presses Start, Host calls every number", run: async (n, people) => {
    const c = await build(n, "Host-started, host-called numbers", "start: Host presses Start / numbers: Host presses Next", people, { id: "G250-03", startInRounds: 300, cap: people, startMode: "manual", callMode: "host" }, mix(people), { host: true });
    const R = c.rec.extra as any; R.logBeforeGo = 0; c.hostBot.everyMs = 12_000;
    c.onTick = async (c) => { await goBot(c, HOST_SECRET, 2 * MIN); const ref = c.refPhone(); if (ref && !c.goPressed) R.logBeforeGo = Math.max(R.logBeforeGo, ref.rt.view().log.length); await nextProbes(c); };
    await runLoop(c, { maxMinutes: 140 });
    const out = await wrapUp(c);
    stdChecks(c, out, { minPrizes: 7 });
    R.presses = c.presses; R.pressRefused = c.pressRefused;
    check(c.rec.checks, "no number before the Host pressed Start", R.logBeforeGo === 0, `${R.logBeforeGo}`);
    check(c.rec.checks, "every number came from one Host press (presses >= numbers called)", c.presses >= (c.rec.timings as any).numbersCalled, `${c.presses} presses, ${(c.rec.timings as any).numbersCalled} numbers`);
    await fairnessProbes(c, { forge: true });
    await retentionCheck(c);
    writeRec(c.rec, c.w);
  } },
  // ---------------------------------------------------------------- 4: scheduled start, host calls every number (the Host stalls once, the Organizer takes over once)
  { title: "Scheduled start, Host calls every number (Host stalls, Organizer takes over)", run: async (n, people) => {
    const c = await build(n, "Scheduled start, host-called numbers", "start: scheduled / numbers: Host presses Next", people, { id: "G250-04", startInRounds: 300, cap: people, callMode: "host" }, mix(people), { host: true });
    const R = c.rec.extra as any; c.hostBot.secret = HOST_SECRET; c.hostBot.everyMs = 11_000; R.stalls = 0;
    c.onTick = async (c) => {
      const ref = c.refPhone(); const len = ref?.rt.view().log.length ?? 0;
      if (len >= 20 && !R.stalled) { R.stalled = true; R.stallFrom = c.w.t; c.hostBot.everyMs = 4 * MIN; R.stalls++; }           // the Host steps away for 4 minutes
      if (R.stalled && !R.stallEnded && c.w.t - R.stallFrom > 4.2 * MIN) { R.stallEnded = true; c.hostBot.everyMs = 11_000; }
      if (len >= 40 && !R.switched) { R.switched = true; c.hostBot.secret = ORG_SECRET; c.hostBot.who = "Organizer"; } // the Organizer takes over the button
      await nextProbes(c);
      await grindProbe(c);
    };
    await runLoop(c, { maxMinutes: 150 });
    const out = await wrapUp(c);
    stdChecks(c, out, { minPrizes: 7 });
    R.presses = c.presses; R.pressRefused = c.pressRefused;
    check(c.rec.checks, "every number came from one press (Host, then Organizer)", c.presses >= (c.rec.timings as any).numbersCalled, `${c.presses} presses`);
    check(c.rec.fairness, "a Host who waited cannot pick WHICH already-published beacon round decides the next number (a press that names a past round is refused)", R.grind?.status >= 400, JSON.stringify(R.grind));
    await fairnessProbes(c, { forge: true });
    await retentionCheck(c);
    writeRec(c.rec, c.w);
  } },
  // ---------------------------------------------------------------- 5: ID-only invite, 250 IDs on the list, intruders refused
  { title: "ID-only invite: 250 employee IDs on the list, intruders refused", run: async (n, people) => {
    const id = "G250-05";
    const ids = Array.from({ length: people }, (_, i) => "E" + (1001 + i));
    const messy = (i: number, e: string) => (i % 10 === 0 ? e.toLowerCase().replace("e", "e-") : i % 10 === 1 ? e.replace("E", "E ") : e); // 25 people type their ID in a messy way
    const c = await build(n, "ID-only invite, 250 IDs + intruders", "who: only people on the ID list (employee ID, no mobile)", people, { id, startInRounds: 300, cap: people, verify: "id", employeesOnly: true, whoCanJoin: "list" },
      (i) => ({ ...mix(people)(i), empId: messy(i, ids[i]!), phone: "", name: "Employee " + (i + 1), blockedAll: i % 40 === 3 }));
    const R = c.rec.extra as any;
    // the Organizer loads the list: 250 names + IDs (in parts of 50, as the console does)
    let added = 0, loadErr = "";
    for (let i = 0; i < ids.length; i += 50) { const r = await c.w.call("POST", `/api/z/${id}/people`, { people: ids.slice(i, i + 50).map((e, k) => ({ name: "Employee " + (i + k + 1), empId: e })) }, c.org.h); if (r.status === 200) added += r.body.added ?? r.body.count ?? 50; else loadErr += r.status + " " + JSON.stringify(r.body).slice(0, 120) + "; "; }
    R.listLoaded = added; if (loadErr) c.rec.notes.push("list load: " + loadErr);
    check(c.rec.checks, "the Organizer loaded 250 IDs on the list", added >= people || added === 0 && !loadErr, `${added} ${loadErr}`);
    const lst = await c.w.call("GET", `/api/z/${id}/people`, undefined, c.org.h); R.listCount = lst.body?.total ?? lst.body?.count ?? lst.body?.people?.length; R.listPageKeys = Object.keys(lst.body ?? {});
    // intruders: unknown IDs, foreign-script IDs, an already-used ID from a second phone, a name guesser
    const mk = (k: number, o: PhoneOpts) => makePhone(c.w, id, 1000 + k, { maxTries: 2, joinAtMs: 4 * MIN + k * 7000, phone: "", ...o });
    const unknown = Array.from({ length: 30 }, (_, k) => mk(k, { empId: "X" + (9001 + k), name: "Intruder " + k }));
    const foreign = ["E١٠٠١", "Éa1", "ΑΒ12", "员工1", "E1٠٠٣", "ＥＺ９９９", "<script>alert(1)</script>", "E1001'; DROP TABLE person;--"].map((e, k) => mk(100 + k, { empId: e, name: "Foreign " + k }));
    const dupes = Array.from({ length: 10 }, (_, k) => mk(200 + k, { empId: ids[k * 7 + 5]!, name: "Impostor " + k, joinAtMs: 25 * MIN + k * 1000 })); // somebody else's ID, a different phone, after the owner joined
    c.extraPhones.push(...unknown, ...foreign, ...dupes);
    const R2 = { guessTries: 0, guessBlocked: 0 };
    c.onTick = async (c) => {
      if (!R.guessed && c.w.t > 14 * MIN) { R.guessed = true; for (let k = 0; k < 80; k++) { const r = await c.w.call("POST", `/api/z/${id}/join`, { empId: "ZZ" + (5000 + k), name: "Guesser", device: (k.toString(16).padStart(2, "0") + "c".repeat(30)) }, { "cf-connecting-ip": "198.51.100.9" }); R2.guessTries++; if (r.status === 429) R2.guessBlocked++; } R.guesser = { ...R2 }; }
    };
    await runLoop(c, { maxMinutes: 130 });
    // the intruders' outcome
    const entered = (a: any[]) => a.filter((p) => p.rt.pid).length;
    R.intruders = { unknownTried: unknown.length, unknownEntered: entered(unknown), foreignTried: foreign.length, foreignEntered: entered(foreign), impostorTried: dupes.length, impostorEntered: entered(dupes), errors: Object.entries([...unknown, ...foreign, ...dupes].reduce((m: Record<string, number>, p) => { const k = String(p.joinError ?? (p.rt.pid ? "ENTERED" : "no answer")).slice(0, 90); m[k] = (m[k] ?? 0) + 1; return m; }, {})) };
    const w8 = await c.w.call("GET", `/api/z/${id}/waiting`, undefined, c.org.h); const waiting = w8.body?.waiting ?? []; R.waitingRoom = waiting.length;
    let declined = 0; for (const x of waiting) { const r = await c.w.call("POST", `/api/z/${id}/waiting/${encodeURIComponent(x.id)}`, { decision: "decline" }, c.org.h); if (r.status === 200) declined++; } R.declined = declined;
    const out = await wrapUp(c);
    stdChecks(c, out, { minPrizes: 7 });
    check(c.rec.checks, "no intruder with an unknown ID got a ticket", R.intruders.unknownEntered === 0, `${R.intruders.unknownEntered}`);
    check(c.rec.checks, "no foreign-script / script-injection ID got a ticket", R.intruders.foreignEntered === 0, `${R.intruders.foreignEntered}`);
    check(c.rec.checks, "nobody could take a ticket by typing another person's ID from a second phone", R.intruders.impostorEntered === 0, `${R.intruders.impostorEntered}`);
    check(c.rec.checks, "the ID guesser was slowed down (rate limit)", R.guesser.guessBlocked > 0, JSON.stringify(R.guesser));
    check(c.rec.checks, "exactly the listed people hold tickets (store participants == 250 listed, minus any firewalled phone)", out.people.length <= people && out.people.length === c.phones.filter((p) => p.rt.pid).length, `${out.people.length}`);
    const tk = new Set(c.phones.filter((p) => p.rt.pid).map((p) => JSON.stringify(p.rt.view().ticket)));
    check(c.rec.checks, "every ticket in the game is different (no two players hold the same ticket)", tk.size === c.phones.filter((p) => p.rt.pid).length, `${tk.size} distinct of ${c.phones.filter((p) => p.rt.pid).length}`);
    check(c.rec.checks, "messy typing (e-1001, E 1001, lower case) found the same listed person", c.phones.filter((p, i) => i % 10 <= 1 && i % 40 !== 3 && i % 50 !== 11).every((p) => p.rt.pid), `${c.phones.filter((p, i) => i % 10 <= 1 && i % 40 !== 3 && !p.rt.pid).length} did not join`);
    await fairnessProbes(c, { forge: true });
    await retentionCheck(c);
    writeRec(c.rec, c.w);
  } },
  // ---------------------------------------------------------------- 6: late joiners, leaving and coming back
  { title: "Players join late, leave and come back during the game", run: async (n, people) => {
    const id = "G250-06"; const startMs = 300 * 3000 + 40 * 3000; // scheduled start + grace, in ms after the game was made
    const opt = (i: number): PhoneOpts => {
      const base = { blockedAll: i % 40 === 3, liar: i % 50 === 11, cheater: i % 100 === 7 };
      if (i < 140) return { ...base, joinAtMs: Math.floor(rng() * 10 * MIN) };                                              // A: on time
      if (i < 200) return { ...base, joinAtMs: startMs + 60_000 + Math.floor(rng() * 7 * MIN) };                           // B: 60 late joiners (up to 8 minutes into the game)
      if (i < 225) { const off = startMs + (1 + Math.floor(rng() * 4)) * MIN; return { ...base, joinAtMs: Math.floor(rng() * 10 * MIN), offFrom: off, offTo: off + (3 + Math.floor(rng() * 3)) * MIN }; } // C: 25 lose the connection / close the page for 4-10 minutes and come back
      return { ...base, joinAtMs: Math.floor(rng() * 10 * MIN) };                                                           // D (10) change phone, E (5) leave, F (10) normal
    };
    const c = await build(n, "Late joiners, leave and rejoin", "players: 140 on time, 60 late, 25 offline and back, 10 new phone, 5 leave", people, { id, startInRounds: 300, cap: people }, opt);
    const R = c.rec.extra as any; R.newPhone = { tried: 0, refusedOtherPhone: 0, afterUnbindJoined: 0, sameTicket: 0 }; R.left = { tried: 0, ok: 0, rejoinTried: 0, rejoinAnswer: [] as string[] };
    const swap = c.phones.slice(225, 235), leavers = c.phones.slice(235, 240); const repl: Phone[] = [];
    c.onTick = async (c) => {
      const w = c.w;
      if (!R.swapDone && w.t > startMs + 6 * MIN) { // D: ten people lose their phone / clear the browser: the same mobile number on a new device
        R.swapDone = true;
        for (const old of swap) {
          if (!old.rt.pid) continue; R.newPhone.tried++;
          const np = makePhone(w, id, old.i, { ...old.opts, joinAtMs: 0, maxTries: 1 }, new Map()); np.phone = old.phone; np.name = old.name;
          const ok = await phoneJoin(np); if (!ok && /different browser|another phone|different/i.test(String(np.joinError))) R.newPhone.refusedOtherPhone++;
          // the Organizer moves the ticket to the new phone
          const u = await w.call("POST", `/api/z/${id}/unbind`, { phone: old.phone }, c.org.h); (R.newPhone.unbind ??= []).push(u.status);
          np.opts.maxTries = 99; const ok2 = await phoneJoin(np);
          if (ok2) { R.newPhone.afterUnbindJoined++; if (np.rt.pid === old.rt.pid) R.newPhone.sameTicket++; }
          old.pageOpen = false; repl.push(np);
        }
        c.extraPhones.push(...repl);
      }
      if (!R.leaveDone && w.t > startMs + 10 * MIN) { // E: five people press "leave and delete me"
        R.leaveDone = true;
        for (const p of leavers) {
          if (!p.rt.pid) continue; R.left.tried++;
          const r = await w.call("POST", `/api/z/${id}/leave`, { pid: p.rt.pid, device: (p.rt as any).device() }, { "cf-connecting-ip": p.ip });
          if (r.status === 200) R.left.ok++; (R.left.status ??= []).push(r.status); p.pageOpen = false;
          const seatRow = w.one("SELECT blocked FROM seat WHERE eid=? AND pid=?", id, p.rt.pid); (R.left.seatBlockedAfter ??= []).push(seatRow?.blocked ?? null);
          const part = w.one("SELECT pii FROM participant WHERE eid=? AND pid=?", id, p.rt.pid); (R.left.piiLeftAfter ??= []).push(part?.pii ? 1 : 0);
        }
      }
      if (R.leaveDone && !R.rejoinDone && w.t > startMs + 11 * MIN) { // and one of them comes back
        R.rejoinDone = true;
        for (const p of leavers) { if (!p.rt.pid) continue; R.left.rejoinTried++; const np = makePhone(w, id, p.i, { ...p.opts, joinAtMs: 0, maxTries: 1 }, p.store); const ok = await phoneJoin(np); R.left.rejoinAnswer.push(ok ? "joined again" : String(np.joinError).slice(0, 80)); }
      }
      if (!R.fullTried && w.t > startMs + 9 * MIN) { R.fullTried = true; const r = await w.call("POST", `/api/z/${id}/join`, { phone: "9555500001", name: "Too late", device: "ab".repeat(16) }, { "cf-connecting-ip": "1.2.3.4" }); R.fullAnswer = r.status + " " + (r.body?.error ?? ""); }
    };
    await runLoop(c, { maxMinutes: 150 });
    const late = c.phones.slice(140, 200).filter((p) => p.rt.pid);
    R.late = { joined: late.length, withHiddenNumbers: late.filter((p) => (p.rt.view().late?.hidden ?? 0) > 0).length, hiddenAvg: late.length ? +(late.reduce((a, p) => a + (p.rt.view().late?.hidden ?? 0), 0) / late.length).toFixed(1) : 0, wonAnything: late.filter((p) => p.rt.view().won.length).length };
    const offl = c.phones.slice(200, 225).filter((p) => p.rt.pid);
    R.offline = { phones: offl.length, caughtUp: offl.filter((p) => p.rt.view().log.length > 0 && p.rt.phase === "ended").length, notCaught: offl.filter((p) => !(p.rt.view().log.length > 0 && p.rt.phase === "ended")).map((p) => `${p.phone} phase=${p.rt.phase} log=${p.rt.view().log.length} blocked=${!!p.opts.blockedAll} liar=${!!p.opts.liar} off=${p.opts.offFrom}-${p.opts.offTo} t=${c.w.t}`) };
    const out = await wrapUp(c);
    stdChecks(c, out, { minPrizes: 7 });
    check(c.rec.checks, "late joiners joined and play from their own first number", R.late.joined >= 55, JSON.stringify(R.late));
    check(c.rec.checks, "a new phone with the same number was refused until the Organizer moved the ticket", R.newPhone.tried > 0 && R.newPhone.refusedOtherPhone === R.newPhone.tried, JSON.stringify(R.newPhone));
    check(c.rec.checks, "after the Organizer moved the ticket the new phone got the SAME ticket", R.newPhone.sameTicket === R.newPhone.tried, JSON.stringify(R.newPhone));
    check(c.rec.checks, "players who pressed leave were taken out and their details deleted at once", R.left.ok === R.left.tried && (R.left.piiLeftAfter ?? []).every((x: number) => x === 0), JSON.stringify(R.left));
    check(c.rec.checks, "the 251st person is refused politely while all 250 places are taken", /^409 .*full/i.test(String(R.fullAnswer)), String(R.fullAnswer));
    check(c.rec.checks, "phones that were offline caught up to the same numbers when they came back", R.offline.caughtUp === R.offline.phones || R.offline.caughtUp >= R.offline.phones - 2, JSON.stringify(R.offline));
    await fairnessProbes(c, { forge: true });
    await retentionCheck(c);
    writeRec(c.rec, c.w);
  } },
  // ---------------------------------------------------------------- 7: pause and resume
  { title: "Pause and resume (Organizer, Host, extend, early resume)", run: async (n, people) => {
    const id = "G250-07";
    const c = await build(n, "Pause and resume", "pauses: timed (auto-resume), open-ended + manual resume, extended, 1-round", people, { id, startInRounds: 300, cap: people, afterPrizes: "keep" }, mix(people), { host: true });
    const R = c.rec.extra as any; R.pauses = [] as any[]; R.samples = [] as [number, number][]; // [utc ms, log length of the reference phone]
    const step = async (name: string, secret: string, action: any, extra: any = {}) => { const r = await press(c.w, id, secret, action, extra); R.pauses.push({ name, action, atSimMin: +(c.w.t / MIN).toFixed(1), status: r.status, error: r.body?.error }); return r; };
    c.onTick = async (c) => {
      const ref = c.refPhone(); if (!ref) return; const len = ref.rt.view().log.length; R.samples.push([c.w.utc(), len]);
      const w = c.w; const at = (n: number) => len >= n;
      if (at(12) && !R.p1) { R.p1 = w.t; await step("Organizer pauses for 20 rounds (1 minute)", ORG_SECRET, "pause", { pauseForRounds: 20 }); }
      if (R.p1 && !R.p1b && w.t > R.p1 + 30_000) { R.p1b = true; const r = await step("Host tries to pause again while paused", HOST_SECRET, "pause", { pauseForRounds: 5 }); R.pauseWhilePausedRefused = r.status >= 400; }
      if (at(25) && !R.p2 && w.t > (R.p1 ?? 0) + 3 * MIN) { R.p2 = w.t; await step("Host pauses (no end time)", HOST_SECRET, "pause"); }
      if (R.p2 && !R.p2r && w.t > R.p2 + 4 * MIN) { R.p2r = w.t; await step("Organizer resumes", ORG_SECRET, "resume"); }
      if (at(35) && !R.p3 && R.p2r && w.t > R.p2r + 2 * MIN) { R.p3 = w.t; await step("Organizer pauses for 10 rounds", ORG_SECRET, "pause", { pauseForRounds: 10 }); }
      if (R.p3 && !R.p3x && w.t > R.p3 + 15_000) { R.p3x = true; await step("Organizer extends by 20 rounds", ORG_SECRET, "extend", { addRounds: 20 }); }
      if (R.p3x && !R.p3r && w.t > R.p3 + 50_000) { R.p3r = true; await step("Organizer resumes early", ORG_SECRET, "resume"); }
      if (at(45) && !R.p4 && R.p3r && w.t > R.p3r + 2 * MIN) { R.p4 = w.t; await step("Host pauses for 2 rounds", HOST_SECRET, "pause", { pauseForRounds: 2 }); }
      if (R.p2 && !R.p2r && !R.leadProbe && w.t > R.p2 + 60_000) { // while paused: a Resume or a Pause that names a round too close (one the beacon may already have published) must be refused, or an Organizer could steer which number comes next
        R.leadProbe = true; const nowR = roundAt(w.utc());
        const b = await rawPress(w, id, ORG_SECRET, { action: "resume", atBeaconRound: nowR - 2, signedAtRound: nowR - 4 }); R.resumeInPast = b.status + " " + (b.body?.error ?? "");
        const d = await rawPress(w, id, ORG_SECRET, { action: "extend", atBeaconRound: nowR - 1, signedAtRound: nowR - 21, untilRound: nowR + 60 }); R.extendInPast = d.status + " " + (d.body?.error ?? "");
        const e = await rawPress(w, id, HOST_SECRET, { action: "resume", atBeaconRound: nowR, signedAtRound: nowR - 3 }); R.resumeThisRound = e.status + " " + (e.body?.error ?? "");
      }
      if (R.p1 && !R.stranger) { R.stranger = true; const r = await rawPress(w, id, "99".repeat(32), { action: "pause", atBeaconRound: roundAt(w.utc()) + 30, untilRound: roundAt(w.utc()) + 60 }); R.strangerPause = r.status; const q = await press(w, id, ORG_SECRET, "resume"); R.resumeWhenNotPaused = q.status; const big = await press(w, id, ORG_SECRET, "pause", { pauseForRounds: 100000 }); R.hugePause = big.status + " " + (big.body?.error ?? ""); }
    };
    await runLoop(c, { maxMinutes: 170 });
    const out = await wrapUp(c);
    const t = out.truth; const f = t.st!;
    R.intervals = f.intervals.map((iv: any) => ({ ...iv, rounds: (iv.end ?? iv.start) - iv.start }));
    stdChecks(c, out, { minPrizes: 7 });
    // during every pause no phone revealed a number: the reference phone's log length at the pause start == at every sample inside it
    let held = 0, leaked = 0;
    for (const iv of f.intervals as any[]) {
      const a = roundTimeMs(iv.start), b = roundTimeMs(iv.end ?? iv.start);
      const inside = (R.samples as [number, number][]).filter(([u]) => u >= a + 6000 && u < b); if (inside.length < 2) continue; // allow the signing-to-effect delay of the first seconds
      held++; if (new Set(inside.map((x) => x[1])).size !== 1) leaked++;
    }
    check(c.rec.checks, `no number was shown during any of the ${held} pauses that could be sampled`, held > 0 && leaked === 0, `${held} pauses sampled, ${leaked} showed a number`);
    check(c.rec.checks, "every pause and resume the Organizer or Host pressed was accepted", R.pauses.filter((p: any) => !/tries to pause again/.test(p.name)).every((p: any) => p.status === 200), JSON.stringify(R.pauses.filter((p: any) => p.status !== 200)));
    check(c.rec.fairness, "a Resume or an Extend that names a round that has already begun (its beacon number is public) is refused, so nobody can pick the round the numbers restart from", /^4/.test(String(R.resumeInPast)) && /^4/.test(String(R.extendInPast)) && /^4/.test(String(R.resumeThisRound)), `${R.resumeInPast} | ${R.extendInPast} | ${R.resumeThisRound}`);
    check(c.rec.checks, "a second pause while paused is refused", R.pauseWhilePausedRefused === true, "");
    check(c.rec.checks, "a pause signed by a stranger, a resume with nothing paused and an endless pause are all refused", R.strangerPause >= 400 && R.resumeWhenNotPaused >= 400 && /^4/.test(String(R.hugePause)), `${R.strangerPause} ${R.resumeWhenNotPaused} ${R.hugePause}`);
    await fairnessProbes(c, { forge: true });
    await retentionCheck(c);
    writeRec(c.rec, c.w);
  } },
  // ---------------------------------------------------------------- 8: every prize type, ordinal names, tie-breaks
  { title: "Every prize type, 1st to 25th winners, tie-breaks, two tickets each", run: async (n, people) => {
    const id = "G250-08";
    const L = (pattern: string, count: number, scope = "ticket") => Array.from({ length: count }, (_, k) => ({ pattern, scope, ordinal: k + 1, text: `${pattern} prize ${k + 1}` }));
    const rewards = [...L("early5", 25), ...L("early7", 2), ...L("early10", 1), ...L("top", 3), ...L("mid", 2), ...L("bot", 2), ...L("twolines", 2), ...L("corners", 2), ...L("star", 1), ...L("plus", 1), ...L("frame", 1), ...L("topbottom", 1), ...L("midcorners", 1), ...L("odd5", 1), ...L("even5", 1), ...L("low5", 1), ...L("high5", 1), ...L("full", 4), ...L("full", 1, "two_ticket"), { pattern: "unlucky", scope: "ticket", ordinal: 1, text: "Unlucky gift" }];
    const c = await build(n, "All prize types and tie-breaks", "tickets: 2 each; ties: next (one after the other by public tie-break); 25 Early Five winners, 4 Full House, Super Bumper, Unlucky", people, { id, startInRounds: 300, cap: people, tickets: 2, rewards, ties: "next", afterPrizes: "end" }, mix(people));
    const R = c.rec.extra as any; R.rewardLines = rewards.length;
    await runLoop(c, { maxMinutes: 170 });
    const out = await wrapUp(c);
    stdChecks(c, out, { minPrizes: 20 });
    const t = out.truth;
    // ties: how many call numbers produced more than one completer, and the order used
    const byCall = new Map<string, number>(); for (const s of t.settled) { const k = s.pattern + "@" + s.idx; byCall.set(k, (byCall.get(k) ?? 0) + 1); }
    R.positionsOnSameCall = [...byCall.entries()].filter(([, v]) => v > 1).map(([k, v]) => `${k}x${v}`);
    check(c.rec.checks, "the tie rule (next) gave each winner position to exactly one ticket", t.settled.every((s) => s.pids.length === 1), `${t.settled.filter((s) => s.pids.length !== 1).length} positions with several tickets`);
    check(c.rec.checks, "at least one real tie (two tickets completing on the same number) happened and was ordered", R.positionsOnSameCall.length > 0, JSON.stringify(R.positionsOnSameCall));
    // ordinal names: what a phone and the organizer's own record say for the 21st, 22nd, 23rd place
    const ref = c.refPhone()!; const pv = ref.rt.view();
    const names = pv.cfg.rewards.filter((r: any) => r.pattern === "early5").map((r: any) => r.ordinal);
    R.earlyFiveOrdinals = names.length;
    const { prizeStatus } = await import("../../packages/beacon/src/prize-status");
    const ps = prizeStatus(pv.cfg, [], 1).filter((x) => x.key === "early5").map((x) => x.name);
    const exp = (k: number) => { const m = k % 100; return k + (m >= 11 && m <= 13 ? "th" : k % 10 === 1 ? "st" : k % 10 === 2 ? "nd" : k % 10 === 3 ? "rd" : "th"); };
    check(c.rec.checks, "the phone's prize list names the 1st to 25th Early Five correctly (21st, 22nd, 23rd, 11th...)", ps.every((nm, k) => nm === exp(k + 1) + " Early Five"), ps.slice(19, 24).join(" | "));
    // the organizer's own record and the report use the same names: read them from the game record written at the end
    R.reportNames = (await reportNames(c)).slice(0, 30);
    check(c.rec.checks, "the organizer's report / log names the 21st, 22nd and 23rd winners correctly", !R.reportNames.some((x: string) => /\b(21|22|23|31|32|33)th\b/.test(x)) && R.reportNames.length > 0, R.reportNames.filter((x: string) => /\b\d+(th)\b/.test(x)).slice(0, 6).join(" | "));
    await fairnessProbes(c, { forge: true });
    await retentionCheck(c);
    writeRec(c.rec, c.w);
  } },
  // ---------------------------------------------------------------- 9: mail and notification fan-out
  { title: "Mail and notification fan-out: organizer, Host, players, winners", run: async (n, people) => {
    const id = "G250-09"; const sent: { to: string; subject: string; idem: string; status: number; attempt: number; body: string }[] = []; const attempts = new Map<string, number>();
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init?: any) => {
      const u = String(url);
      if (u.startsWith("https://api.resend.com/emails")) {
        const b = JSON.parse(init.body); const idem = String(init.headers?.["idempotency-key"] ?? init.headers?.["Idempotency-Key"] ?? ""); const att = (attempts.get(idem) ?? 0) + 1; attempts.set(idem, att);
        const h = parseInt(sha(idem).slice(0, 4), 16) % 4; const to = String(b.to?.[0] ?? "");
        const status = h === 0 && att === 1 ? 429 : h === 1 && att <= 2 ? 500 : 200; // some mails are refused at first (busy / down), then go through on a retry with the SAME key
        sent.push({ to, subject: String(b.subject), idem, status, attempt: att, body: String(b.text ?? "") });
        return new Response(JSON.stringify(status === 200 ? { id: "m" + sent.length } : { name: status === 429 ? "rate_limit_exceeded" : "application_error", message: "x" }), { status });
      }
      return realFetch(url, init);
    }) as any;
    try {
      const c = await build(n, "Mail and notification fan-out", "mail: Organizer, Host, players (with e-mail), winners; announcements to 250 phones", people, { id, startInRounds: 300, cap: people }, (i) => ({ ...mix(people)(i), email: `player${i + 1}@corp.example` }), { host: true, envExtra: { RESEND_API_KEY: "re_test_key", MAIL_RETRY_MS: "0", MAIL_FROM: "Corporate Tambola <hello@corporatetambola.com>" } });
      const R = c.rec.extra as any; R.announce = [] as any[];
      const ann = async (name: string, h: Record<string, string>, text: string) => { const r = await c.w.call("POST", `/api/z/${id}/announce`, { text }, h); R.announce.push({ name, status: r.status, error: r.body?.error, atSimMin: +(c.w.t / MIN).toFixed(1) }); return r; };
      c.onTick = async (c) => {
        const ref = c.refPhone(); const len = ref?.rt.view().log.length ?? 0;
        if (len >= 5 && !R.a1) { R.a1 = true; await ann("Organizer", c.org.h, "Welcome everyone! Lunch is at 1 pm."); }
        if (R.a1 && !R.a1seen) { const seen = c.phones.filter((p) => p.rt.pid && p.rt.view().announcement?.text?.startsWith("Welcome")).length; if (seen > 150) { R.a1seen = true; R.a1seenCount = seen; R.a1seenAtSimMin = +(c.w.t / MIN).toFixed(1); } }
        if (len >= 20 && !R.a2) { R.a2 = true; R.a2from = c.w.t; await ann("Host", c.hostKey!.h, "Host here: prizes at the front desk."); }
        if (R.a2 && !R.a2seen) { const seen = c.phones.filter((p) => p.rt.pid && p.rt.view().announcement?.text?.startsWith("Host here")).length; if (seen > 150) { R.a2seen = true; R.a2seenCount = seen; R.a2lagSec = Math.round((c.w.t - R.a2from) / 1000); } }
        if (len >= 22 && !R.a3) { R.a3 = true; const r = await c.w.call("POST", `/api/z/${id}/announce`, { text: "x".repeat(200) }, c.org.h); R.tooLongStatus = r.status; const q = await c.w.call("POST", `/api/z/${id}/announce`, { text: "hi <script>alert(1)</script>" }, { "x-organizer": "stranger" }); R.strangerAnnounce = q.status; }
      };
      await runLoop(c, { maxMinutes: 150 });
      const out = await wrapUp(c);
      stdChecks(c, out, { minPrizes: 7 });
      // winners: each winner phone confirms name + number; the Organizer lists the prizes and ticks them as given
      const winnersPids = new Set(out.truth.settled.flatMap((s) => s.pids)); const wph = c.phones.filter((p) => p.rt.pid && winnersPids.has(p.rt.pid));
      R.winnerPhones = wph.length; let confirmed = 0; const confirmErr: string[] = [];
      for (const p of wph) { const r = await c.w.call("POST", `/api/z/${id}/confirm`, { pid: p.rt.pid, device: (p.rt as any).device(), name: p.name + " Kumar", phone: p.phone }, { "cf-connecting-ip": p.ip }); if (r.status === 200) confirmed++; else if (confirmErr.length < 4) confirmErr.push(r.status + " " + (r.body?.error ?? "")); }
      R.winnersConfirmed = confirmed; R.confirmErr = confirmErr;
      const pz = await c.w.call("GET", `/api/z/${id}/prizes`, undefined, c.org.h); R.prizesListed = (pz.body?.prizes ?? pz.body?.rows ?? pz.body?.winners ?? []).length; R.prizesKeys = Object.keys(pz.body ?? {});
      let given = 0; const rows: any[] = pz.body?.prizes ?? pz.body?.rows ?? pz.body?.winners ?? []; for (const r of rows.slice(0, 20)) { const g = await c.w.call("POST", `/api/z/${id}/prizegiven`, { round: r.round ?? 1, pattern: r.pattern, ordinal: r.ordinal, seat: r.seat, given: true }, c.org.h); if (g.status === 200) given++; } R.prizesMarkedGiven = given;
      // after the game: the report goes out at +3 minutes; the Worker's housekeeping runs
      c.w.t += 8 * MIN; for (let k = 0; k < 6; k++) { await c.w.call("POST", "/api/lifecycle/tick", {}, { "x-organizer": "plat" }); c.w.t += 2 * MIN; }
      // retry window for refused mails: ticks every 2 minutes for 40 minutes
      for (let k = 0; k < 20; k++) { c.w.t += 2 * MIN; await c.w.call("POST", "/api/lifecycle/tick", {}, { "x-organizer": "plat" }); }
      // the audit of what was mailed
      const byKey = new Map<string, typeof sent>(); for (const m of sent) byKey.set(m.idem, [...(byKey.get(m.idem) ?? []), m]);
      const finalOk = [...byKey.values()].filter((v) => v.some((x) => x.status === 200)); const neverOk = [...byKey.values()].filter((v) => !v.some((x) => x.status === 200));
      const delivered = finalOk.map((v) => v.find((x) => x.status === 200)!);
      const bySubject: Record<string, { to: string[]; n: number }> = {}; for (const m of delivered) { const k = m.subject.replace(/[A-Z0-9]{3,}-[A-Z0-9-]+/g, "<id>").replace(/\d+/g, "#").slice(0, 70); (bySubject[k] ??= { to: [], n: 0 }).n++; if (!bySubject[k]!.to.includes(m.to)) bySubject[k]!.to.push(m.to); }
      R.mail = { attemptsTotal: sent.length, distinctMails: byKey.size, deliveredOnce: finalOk.length, neverDelivered: neverOk.map((v) => v[0]!.subject.slice(0, 60) + " -> " + v[0]!.to), refused429: sent.filter((x) => x.status === 429).length, refused500: sent.filter((x) => x.status === 500).length, retriedToSuccess: finalOk.filter((v) => v.length > 1).length, bySubject: Object.entries(bySubject).map(([k, v]) => ({ subject: k, n: v.n, recipients: v.to.map((t) => t.replace(/^(.).*@/, "$1***@")) })) };
      const playerAddr = new Set(c.phones.map((p) => `player${p.i + 1}@corp.example`)); const phoneDigits = c.phones.map((p) => p.phone);
      R.mail.sentToPlayers = delivered.filter((m) => playerAddr.has(m.to)).length; R.mail.sentToOrganizer = delivered.filter((m) => m.to === "demo1@xyz.in").length; R.mail.sentToHost = delivered.filter((m) => m.to === "host@acme.com").length;
      R.mail.bodiesWithPlayerMobile = delivered.filter((m) => phoneDigits.some((d) => m.body.includes(d))).length; R.mail.bodiesWithPlayerEmail = delivered.filter((m) => [...playerAddr].some((a) => m.body.includes(a))).length;
      const ob = c.w.q("SELECT sent, COUNT(*) n FROM outbox GROUP BY sent"); R.mail.outboxByState = ob; const ev = c.w.q("SELECT outcome, COUNT(*) n FROM mail_event GROUP BY outcome"); R.mail.mailEvents = ev;
      check(c.rec.checks, "every mail the game sent was delivered exactly once after refusals (no mail lost, no duplicate)", neverOk.length === 0 && [...byKey.values()].every((v) => v.filter((x) => x.status === 200).length === 1), JSON.stringify(R.mail.neverDelivered));
      check(c.rec.checks, "the Organizer got the publish and report mails", delivered.some((m) => m.to === "demo1@xyz.in" && /report|published|live|ready/i.test(m.subject)), delivered.filter((m) => m.to === "demo1@xyz.in").map((m) => m.subject).join(" | "));
      check(c.rec.checks, "the Host got their link mail", delivered.some((m) => m.to === "host@acme.com"), delivered.filter((m) => m.to === "host@acme.com").map((m) => m.subject).join(" | ") || "no mail to the Host");
      check(c.rec.checks, "no mail carries a player's mobile number or e-mail address", R.mail.bodiesWithPlayerMobile === 0 && R.mail.bodiesWithPlayerEmail === 0, `${R.mail.bodiesWithPlayerMobile} / ${R.mail.bodiesWithPlayerEmail}`);
      check(c.rec.checks, "the Organizer's message reached 150+ phones", !!R.a1seen, `${R.a1seenCount ?? 0}`);
      check(c.rec.checks, "the Host's message reached 150+ phones", !!R.a2seen, `${R.a2seenCount ?? 0} lag ${R.a2lagSec}s`);
      check(c.rec.checks, "a 200-character message and a stranger's message are refused", R.tooLongStatus >= 400 && R.strangerAnnounce >= 400, `${R.tooLongStatus} ${R.strangerAnnounce}`);
      check(c.rec.checks, "every winner could confirm their name and number on their own phone", R.winnerPhones > 0 && confirmed === R.winnerPhones, `${confirmed}/${R.winnerPhones} ${confirmErr.join(";")}`);
      check(c.rec.checks, "the Organizer listed the prizes and ticked them as given", R.prizesListed > 0 && given > 0, `${R.prizesListed} listed ${given} ticked ${JSON.stringify(R.prizesKeys)}`);
      await fairnessProbes(c, { forge: true });
      await retentionCheck(c);
    writeRec(c.rec, c.w);
    } finally { globalThis.fetch = realFetch; }
  } },
  // ---------------------------------------------------------------- 10: the end, the report, 24-hour deletion, 365-day retention
  { title: "End of game, report to the Organizer, 24-hour player deletion, 365-day retention", run: async (n, people) => {
    const id = "G250-10";
    const c = await build(n, "End, report, deletion, retention", "organizer stops the game; report; +20h personal data deleted; +365d everything deleted", people, { id, startInRounds: 300, cap: people, afterPrizes: "keep" }, mix(people), { host: true });
    const R = c.rec.extra as any; const w = c.w; const L = c.rec.checks;
    c.onTick = async (c) => { const ref = c.refPhone(); if (ref && ref.rt.view().log.length >= 40 && !R.stopped) { R.stopped = true; const r = await press(c.w, id, ORG_SECRET, "stop"); R.stopStatus = r.status + " " + (r.body?.error ?? ""); R.stopAtSimMin = +(c.w.t / MIN).toFixed(1); } };
    await runLoop(c, { maxMinutes: 120, noPostEnd: false });
    // stop is a real "end": the phones stop at the called number; winners already claimed stay
    const out = await wrapUp(c);
    stdChecks(c, out, { minPrizes: 3 });
    check(L, "the Organizer's Stop was accepted and every phone stopped", R.stopStatus?.startsWith("200") && c.phones.filter((p) => p.rt.pid && !p.opts.blockedAll).every((p) => p.rt.view().stopped || p.rt.phase === "ended"), `${R.stopStatus}`);
    const people0 = out.people.length; const stats = (label: string) => {
      const q = (sql: string) => (w.one(sql, id) as any).n as number;
      return { label, atH: +((w.utc() - (R.endMs ?? 0)) / HOUR).toFixed(2), participants: q("SELECT COUNT(*) n FROM participant WHERE eid=?"), seats_with_ph: q("SELECT COUNT(*) n FROM seat WHERE eid=? AND ph IS NOT NULL AND ph!=''"), people_list: q("SELECT COUNT(*) n FROM person WHERE eid=?"), checkins: q("SELECT COUNT(*) n FROM kv WHERE k LIKE 'present/' || ? || '/%'"), claims: q("SELECT COUNT(*) n FROM claim WHERE eid=?"), prizeRows: q("SELECT COUNT(*) n FROM prize WHERE eid=?"), reportChunks: q("SELECT COUNT(*) n FROM kv WHERE k LIKE 'rptc/' || ? || '/%'"), auditPii: q("SELECT COUNT(*) n FROM audit_pii WHERE eid=?"), engagement: q("SELECT COUNT(*) n FROM engagement WHERE id=?"), gameRecord: q("SELECT COUNT(*) n FROM game_record WHERE eid=?"), winnerEvidence: q("SELECT COUNT(*) n FROM kv WHERE k LIKE 'wev/' || ? || '/%'") };
    };
    const tick = async (label: string) => { const r = await w.call("POST", "/api/lifecycle/tick", {}, { "x-organizer": "plat" }); (R.ticks ??= []).push({ label, status: r.status, ...r.body }); return r; };
    const lifeRow = () => w.one("SELECT * FROM life WHERE eid=?", id);
    const tickAt = async (label: string, at: number) => { const r = await w.call("POST", "/api/lifecycle/tick", {}, { "x-organizer": "plat" }, at); (R.ticks ??= []).push({ label, status: r.status, ...r.body }); return r; };
    // the end as the store sees it
    const sentBefore = (await import("../../apps/edge/src/pay")).sentReports.length;
    snapLimits(c); // the usage counters of the day go with the 365-day clean-up: read them first
    // the end as the store knows it: the scheduled end of the game (the phones do not tell the store the game is over unless they are told by a result) -> the report waits 3 minutes after it
    { const lr = lifeRow(); const eg = w.one("SELECT * FROM engagement WHERE id=?", id); const { endBoundMs } = await import("../../apps/edge/src/lifecycle"); R.endMs = lr?.end_ms ?? await endBoundMs(w.env as any, eg); R.endSrc = lr?.end_src ?? "schedule (computed)"; }
    R.simTimeAtFirstTickVsEnd = +((w.utc() - R.endMs) / MIN).toFixed(1);
    await tickAt("1 minute after the end", R.endMs + 60_000); R.reportAt1min = !!lifeRow()?.report_ms; R.reportAt2min = (await tickAt("2 minutes after the end", R.endMs + 2 * 60_000), !!lifeRow()?.report_ms);
    for (let k = 0; k < 8 && !lifeRow()?.report_ms; k++) { w.t += 2 * MIN; await tick("report window " + k); }
    const rep = lifeRow(); R.reportMs = rep?.report_ms; R.reportState = rep?.report_state; R.reportAfterEndMin = rep?.report_ms ? +((rep.report_ms - R.endMs) / MIN).toFixed(1) : null;
    const sent = (await import("../../apps/edge/src/pay")).sentReports.slice(sentBefore); R.reportMails = sent.map((m) => ({ to: m.to.replace(/^(.).*@/, "$1***@"), subject: m.subject.slice(0, 90), bytes: m.text.length, attachments: m.attachments.length }));
    check(L, "no report was made one minute after the end (it waits 3 minutes so late wins are in)", R.reportAt1min === false, `sim time at the first tick was ${R.simTimeAtFirstTickVsEnd} min after the scheduled end`);
    check(L, "the Organizer's report was e-mailed after the end", sent.some((m) => m.to === "demo1@xyz.in") && !!rep?.report_ms, JSON.stringify(R.reportMails));
    const st0 = stats("report ready"); R.stateTimeline = [st0];
    // the report link works while the data exists (the page is built from the sealed records) and carries the names
    const link = sent.find((m) => m.to === "demo1@xyz.in")?.text.match(/report\.html\?e=[^&\s]+&k=([0-9a-f]+)/); const key = link?.[1];
    const rg = key ? await w.call("GET", `/api/report/${id}?k=${key}`) : { status: 0, body: {} };
    const rp = key ? await w.call("GET", `/api/report/${id}?k=${key}&part=people&i=0`) : { status: 0, body: {} };
    R.reportApi = { status: rg.status, people: rp.body?.people?.length ?? 0, totalPeople: rg.body?.totalPeople, winners: rg.body?.base?.winners?.length ?? rg.body?.base?.prizes?.length };
    check(L, "the report link works and lists the people (names and numbers) while the data is kept", rg.status === 200 && (rp.body?.people?.length ?? 0) > 0, JSON.stringify(R.reportApi));
    const bad = await w.call("GET", `/api/report/${id}?k=${"0".repeat(40)}`); check(L, "a wrong report key is refused", bad.status === 403, `${bad.status}`);
    // +18 h: link still ok; +19.5 h: link closed; the data is still there until +20 h
    const hrs = (h: number) => { w.t = R.endMs - T0 + h * HOUR; };
    hrs(18); await tick("+18h"); R.stateTimeline.push(stats("+18h")); const l18 = key ? (await w.call("GET", `/api/report/${id}?k=${key}`)).status : 0;
    hrs(19.5); await tick("+19.5h"); R.stateTimeline.push(stats("+19.5h")); const l195 = key ? (await w.call("GET", `/api/report/${id}?k=${key}`)).status : 0;
    check(L, "the report link works at 18 hours and is closed at 19.5 hours", l18 === 200 && l195 === 404, `${l18} / ${l195}`);
    check(L, "at 19.5 hours the players' details are still held (deleted at 20 h)", (R.stateTimeline.at(-1) as any).participants === people0, JSON.stringify(R.stateTimeline.at(-1)));
    hrs(20.1); await tick("+20.1h"); R.stateTimeline.push(stats("+20.1h"));
    const s20 = R.stateTimeline.at(-1) as any;
    check(L, "20 hours after the end every player's name, number, seat details and check-in are deleted", s20.participants === 0 && s20.seats_with_ph === 0 && s20.checkins === 0 && s20.reportChunks === 0, JSON.stringify(s20));
    check(L, "the players' personal part of the audit log is shredded", s20.auditPii === 0, `${s20.auditPii}`);
    check(L, "the winners' record (seat, prize, round) is kept", s20.prizeRows > 0 || s20.gameRecord > 0, JSON.stringify(s20));
    // the 24-hour promise with a late job: the first tick only comes 3 hours late
    const rgGone = key ? (await w.call("GET", `/api/report/${id}?k=${key}`)).status : 0; R.reportAfterDelete = rgGone; check(L, "the report is gone after the deletion", rgGone === 404, `${rgGone}`);
    const claimsPublic = (await w.call("GET", `/api/z/${id}/results`)).body; R.resultsAfterDelete = (claimsPublic.results ?? []).length;
    const mails = (await import("../../apps/edge/src/pay")).sentReports; R.mailsAfterDelete = mails.slice(sentBefore).map((m) => m.subject.slice(0, 80));
    const delMail = w.q("SELECT subject FROM outbox WHERE subject LIKE '%delet%'").map((x: any) => x.subject); R.deletionMail = delMail;
    // a player's own data request after deletion
    const p0 = c.phones.find((p) => p.rt.pid)!; const dq = await w.call("POST", `/api/z/${id}/datareq`, { pid: p0.rt.pid, device: (p0.rt as any).device(), kind: "access" }, { "cf-connecting-ip": p0.ip }); R.dataRequestAfterDelete = dq.status + " " + String(dq.body?.error ?? dq.body?.message ?? "").slice(0, 120);
    // day 30, day 364 (still kept), then 365 days later at 00:00 IST: everything goes
    const { fullDeleteAt } = await import("../../apps/edge/src/lifecycle");
    w.t = R.endMs - T0 + 30 * DAY; await tick("+30d"); R.stateTimeline.push(stats("+30d"));
    w.t = fullDeleteAt(R.endMs) - T0 - 2 * HOUR; await w.call("POST", "/api/purge", {}, { "x-organizer": "plat" }); await tick("+365d minus 2h"); R.stateTimeline.push(stats("+365d -2h"));
    const kept = R.stateTimeline.at(-1) as any; check(L, "the game record and settings are still kept just before the 365th day ends", kept.engagement === 1, JSON.stringify(kept));
    w.t = fullDeleteAt(R.endMs) - T0 + 5 * MIN; await w.call("POST", "/api/purge", {}, { "x-organizer": "plat" }); await tick("+365d (00:00 IST)"); R.stateTimeline.push(stats("+365d"));
    const fin = R.stateTimeline.at(-1) as any; R.fullDeleteAtIST = new Date(fullDeleteAt(R.endMs) + 5.5 * HOUR).toISOString().replace("Z", " IST");
    check(L, "after the 365th day (00:00 IST) the engagement, its record and its winners are all deleted", fin.engagement === 0 && fin.gameRecord <= 1 && fin.prizeRows === 0 && fin.claims === 0, JSON.stringify(fin));
    const { bad: detail, kept: keptRows } = leftovers(w, id); const leftover = Object.keys(detail); R.keptOnPurpose = keptRows;
    R.leftoverRows = detail; R.leftoverKvKeys = w.q("SELECT k FROM kv WHERE k LIKE ?", "%" + id + "%").map((x: any) => x.k); R.leftoverPresenceRange = w.q("SELECT MIN(minute) a, MAX(minute) b, COUNT(*) n FROM presence WHERE eid=?", id);
    R.tablesStillHoldingTheGame = leftover; const allowed = new Set(["game_record", "entitlement", "audit_cert", "audit_stats"]); // kept on purpose: the settings record (no personal data), the payment record the law keeps, the append-only audit certificates
    check(L, "after the 365th day no table holds a row of the game, except the records kept on purpose (settings record, payment record, audit certificates)", leftover.length === 0, JSON.stringify(detail));
    await fairnessProbes(c, { forge: false });
    await retentionCheck(c);
    writeRec(c.rec, c.w);
  } },
];
void DAY; void HOUR; void T0; void ordinals; void DEFAULT_REWARDS; void press; void ORG_SECRET; void HOST_SECRET; void listParticipants; void check; void writeRec;
export type { Ctx };

/** The Host (or Organizer) presses Start `afterMs` after the scheduled time. */
async function goBot(c: Ctx, secret: string, afterMs: number) {
  const R = c.rec.extra as any;
  if (c.goPressed || c.w.utc() < roundTimeMs(c.scheduledRound) + afterMs) return;
  const r = await press(c.w, c.eid, secret, "go");
  c.goPressed = r.status === 200; R.goStatus = r.status; R.goError = r.body?.error; R.goAtSimMin = +(c.w.t / MIN).toFixed(1);
}
/** Start-button probes: too early, too short a lead, wrong signer. Run once after the game started (each must be refused). */
async function startProbes(c: Ctx) {
  const { w, rec } = c; const L = rec.fairness; const nowR = roundAt(w.utc());
  const a = await rawPress(w, c.eid, HOST_SECRET, { action: "go", atBeaconRound: nowR + 1 });
  check(L, "a Start signed with too little lead is refused", a.status >= 400, `${a.status} ${a.body?.error ?? ""}`);
  const b = await rawPress(w, c.eid, "99".repeat(32), { action: "go", atBeaconRound: nowR + 20 });
  check(L, "a Start signed by a stranger's key is refused", b.status >= 400, `${b.status}`);
  const d = await press(w, c.eid, HOST_SECRET, "go");
  check(L, "a second Start after the game began is refused (the start cannot be moved)", d.status >= 400, `${d.status} ${d.body?.error ?? ""}`);
}
/** THE grinding attack: the Host waits (here: stalls 4 minutes), looks at the numbers every already-published beacon round WOULD give for the next call, picks the one they want and signs a press that names that round (dated in the past). */
async function grindProbe(c: Ctx) {
  const R = c.rec.extra as any; if (R.grind || !R.stalled || R.stallEnded || c.w.t < R.stallFrom + 100_000) return;
  const { w } = c; const id = c.eid; const f = await w.published(id); if (!f) return;
  const st = resolveControl(cfgOf(f, hostGameOf(c.cfg, c.scheduledRound)), f.messages); const nexts = st.nextRounds; if (!nexts.length) return;
  const prev = nexts[nexts.length - 1]!, k = nexts.length, nowR = roundAt(w.utc()); const rnd = rndOf(w.seed); const eidR = roundEid(id, 1);
  const soFar = deriveCalls(eidR, nexts.map((r) => rnd(r)));
  const cand: { round: number; n: number }[] = []; for (let x = prev + 1; x <= nowR - 2; x++) cand.push({ round: x, n: pickNumber(eidR, k, rnd(x), soFar) });
  const distinct = new Set(cand.map((x) => x.n)).size; const pick = cand.reduce((a, b) => (b.n > a.n ? b : a), cand[0]!);
  const r = await rawPress(w, id, c.hostBot.secret, { action: "next", atBeaconRound: pick.round, signedAtRound: pick.round - 2 });
  R.grind = { roundsSincePreviousPress: nowR - prev, candidateRounds: cand.length, distinctNumbersOnOffer: distinct, pickedRound: pick.round, pickedNumber: pick.n, status: r.status, answer: r.body?.error ?? "accepted" };
  if (r.status === 200) { c.presses++; R.grind.accepted = true; }
}
/** Next-press probes, once, in the middle of the game. */
async function nextProbes(c: Ctx) {
  const R = c.rec.extra as any; const ref = c.refPhone();
  if (R.nextProbed || !ref || ref.rt.view().log.length < 10) return; R.nextProbed = true;
  const { w, rec } = c; const L = rec.fairness; const nowR = roundAt(w.utc());
  const a = await rawPress(w, c.eid, c.hostBot.secret, { action: "next", atBeaconRound: nowR + 1 });
  check(L, "a Next press that names a round only one round ahead (could be read from the beacon) is refused", a.status >= 400, `${a.status} ${a.body?.error ?? ""}`);
  const b = await rawPress(w, c.eid, c.hostBot.secret, { action: "next", atBeaconRound: nowR + 5 });
  check(L, "a Next press that names a round five ahead (a Host picking a lucky round) is refused", b.status >= 400, `${b.status} ${b.body?.error ?? ""}`);
  const d = await rawPress(w, c.eid, c.hostBot.secret, { action: "next", atBeaconRound: nowR - 3, signedAtRound: nowR - 5 });
  check(L, "a Next press that names a round already published is refused", d.status >= 400, `${d.status} ${d.body?.error ?? ""}`);
  const e = await rawPress(w, c.eid, "99".repeat(32), { action: "next", atBeaconRound: nowR + 2 });
  check(L, "a Next press signed by a stranger is refused", e.status >= 400, `${e.status}`);
}

/** The ordinal words the organizer's own log / report says for the winners of Early Five (read from the game log the system keeps). */
async function reportNames(c: Ctx): Promise<string[]> {
  const w = c.w; w.t += 6 * MIN; await w.call("POST", "/api/lifecycle/tick", {}, { "x-organizer": "plat" });
  const gl = await w.call("GET", `/api/z/${c.eid}/gamelog`, undefined, c.org.h);
  const txt = JSON.stringify(gl.body); return txt.match(/\b\d+(?:st|nd|rd|th) [A-Z][A-Za-z ]+/g) ?? [];
}
