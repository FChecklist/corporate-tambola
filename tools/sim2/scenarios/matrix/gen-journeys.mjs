// Family "journeys": the whole life of a 10-player game for every role, generated from the product of the dimensions below (1,200 scenarios, every name distinct).
//   audience (5)  x  what people must give (verify: mobile / id / either / both, 4)  x  play mode (manual / auto, 2)  x  approval outcome (6)  x  lifecycle event (5)  = 1,200
// Roles in every scenario: Organizer, Host, Co-host, listed participants, a stranger, and (where invitations exist) a level-1 guest, the guest's invitee, and that invitee's own invitee (level 2, who cannot invite).
// ORACLE (nothing here is copied from what the code did): docs/handover-2026-10-26/join_design.json (matrix rows 1-9, 14, 17, 18, wrong-input table) and docs/ROLES_AND_CONSOLE_SPEC_3.md (who may see / decide / remove).
// Expected result for a stranger (a person who is on no list): waiting room when the game is list-only or employees-only, a ticket at once when it is open (join_design.json rows 1, 3, 5, 7).
// Expected result for a listed person: a ticket at once, in every verify mode, when they give what the mode asks (rows 1-6).
export default async function gen({ R, L }) {
  const { A, mobile, personName, startAt } = L; const dev = A.deviceOf;
  const AUD = {
    emp: { label: "employees-only", closed: true, eo: true },
    list: { label: "list-only", closed: true },
    inv: { label: "list+invitations", closed: true, invites: 2 },
    any: { label: "anyone", closed: false },
    mix: { label: "ID-for-employees+mobile-for-others", closed: false },
  };
  const VERIFY = ["mobile", "id", "either", "both"], MODE = ["manual", "auto"];
  const OUTCOME = ["auto-admit", "approve", "decline", "ignored", "approve-after-cap-full", "approve-after-removal"];
  const EVENT = ["none", "late-join", "cancel", "cancel-reopen", "end-window"];
  const fromOf = (link) => Number(/[?&]from=(\d+)/.exec(link ?? "")?.[1]);
  const joinRaw = (eid, body, ip) => A.call("POST", `/api/z/${eid}/join`, { device: dev(body.phone ?? body.empId ?? body.token ?? "x"), ...body }, {}, { ip });
  const wid = (r) => r.body.wid;
  const out = [];
  const combos = [];
  for (const a of Object.keys(AUD)) for (const v of VERIFY) for (const m of MODE) for (const o of OUTCOME) for (const e of EVENT) combos.push({ a, v, m, o, e });

  for (const c of combos) {
    const aud = AUD[c.a]; const timeMoving = c.e === "late-join" || c.e === "end-window";
    out.push({ name: `journey|${c.a}|${c.v}|${c.m}|${c.o}|${c.e}`, time: timeMoving, timeoutMs: 120_000, run: async (t) => {
      const cap = 10;
      // ---- Organizer builds, publishes, pays ----
      const org = await t.newOrg(); const g = await t.game(org, { cap, who: aud.closed ? "list" : "anyone", days: 6 });
      if (!t.expect("Organizer creates the game", g.r, "ok")) return;
      const patch = { ...(c.v !== "mobile" ? { verify: c.v } : {}), ...(aud.eo ? { employeesOnly: true } : {}), ...(c.m === "manual" ? { callMode: "host" } : {}), ...(aud.invites ? { guestInvites: { on: true, per: aud.invites, cats: ["family", "colleagues"] } } : {}) };
      if (Object.keys(patch).length) t.expect("Organizer sets the rules", await org.settings(g.id, patch), "ok");
      await t.publishPay(org, g.id);
      const info = (await org.info(g.id)).body; t.eq("play mode as chosen", info.callMode ?? (c.m === "manual" ? "host" : "auto"), c.m === "manual" ? "host" : "auto");
      // ---- Host and Co-host ----
      const host = await t.host(org), co = await t.cohost(org, g.id);
      t.expect("Host reads the summary", await host.api("GET", `/api/z/${g.id}/summary`), "ok"); t.expect("Co-host may not read the summary", await co.api("GET", `/api/z/${g.id}/summary`), "deny");
      t.expect("Co-host may not publish or cancel", await co.api("POST", `/api/z/${g.id}/cancel`, { confirmations: 3 }), "deny");
      const orgLink = (await org.people(g.id)).body.commonLink, hostLink = (await host.api("GET", `/api/z/${g.id}/people`)).body.commonLink, coLink = (await co.api("GET", `/api/z/${g.id}/people`)).body.commonLink;
      t.check("Organizer, Host and Co-host each have a common link", !!orgLink && !!hostLink && !!coLink, `${orgLink} ${hostLink} ${coLink}`);
      // ---- the lists: Organizer, Host and Co-host each add their own people ----
      const person = (tag) => ({ name: personName(t.R), phone: mobile(t.R), empId: `E${t.R.int(1e6)}${tag}` });
      const mine = { org: person("a"), host: person("b"), co: person("c") }; const filler = Array.from({ length: cap - 3 }, (_, i) => person("f" + i));
      t.eq("Organizer adds", (await org.api("POST", `/api/z/${g.id}/people`, { people: [mine.org] })).body.added, 1);
      t.eq("Host adds", (await host.api("POST", `/api/z/${g.id}/people`, { people: [mine.host] })).body.added, 1);
      t.eq("Co-host adds", (await co.api("POST", `/api/z/${g.id}/people`, { people: [mine.co] })).body.added, 1);
      const giveListed = (p) => c.v === "mobile" ? { phone: p.phone } : c.v === "id" || c.v === "either" ? { empId: p.empId } : { phone: p.phone, empId: p.empId };
      const listedIds = []; // pids of the listed people who arrived
      for (const [who, p] of Object.entries(mine)) { const r = await joinRaw(g.id, { ...giveListed(p), name: p.name }, t.ip()); t.expect(`listed ${who} person gets a ticket at once`, r, "ok"); if (r.ok) listedIds.push(r.body.pid); }
      t.eq("a listed person's ticket is the same on a second look (same phone)", (await joinRaw(g.id, { ...giveListed(mine.org), name: mine.org.name }, t.ip())).body.pid, listedIds[0]);
      // ---- the stranger and the approval outcome ----
      const arrive = c.o.endsWith("cap-full") ? "org" : ["org", "host", "co"][t.R.int(3)]; // the link the stranger comes through = the person who decides
      const via = { org: orgLink, host: hostLink, co: coLink }[arrive]; const decider = { org: org, host: { decide: (e, w, d) => host.api("POST", `/api/z/${e}/waiting/${w}`, { decision: d }) }, co: { decide: (e, w, d) => co.api("POST", `/api/z/${e}/waiting/${w}`, { decision: d }) } }[arrive];
      const stranger = { name: personName(t.R), phone: mobile(t.R), empId: `X${t.R.int(1e6)}` };
      if (c.o === "approve-after-cap-full") { // fill the game: 3 listed already, 7 more listed people arrive
        t.eq("Organizer adds the rest of the list", (await org.api("POST", `/api/z/${g.id}/people`, { people: filler })).body.added, filler.length);
        for (const p of filler) { const r = await joinRaw(g.id, { ...giveListed(p), name: p.name }, t.ip()); if (!r.ok) { t.expect("a filler person gets a ticket", r, "ok"); break; } }
        t.eq("the game is full", (await org.api("GET", `/api/z/${g.id}/participants`)).body.total, cap);
      }
      const giveStranger = aud.eo ? (c.v === "mobile" ? { phone: stranger.phone } : c.v === "both" ? { phone: stranger.phone, empId: stranger.empId } : { empId: stranger.empId }) : { phone: stranger.phone };
      const expectWait = aud.closed || aud.eo; // join_design.json rows 1, 3, 5, 7
      const full = c.o === "approve-after-cap-full";
      const sr = await joinRaw(g.id, { ...giveStranger, name: stranger.name, from: fromOf(via) }, t.ip());
      let sWid = null, sPid = null;
      if (full && !expectWait) { t.expect("a stranger at a full open game is told it is full, calmly", sr, [409]); t.check("with a plain sentence", !!sr.body.error && sr.body.error.length < 200, sr.body.error); }
      else if (expectWait) { t.eq("a stranger waits (403 waiting)", [sr.status, sr.body.code], [403, "waiting"]); sWid = wid(sr); t.check("the request has an id and a calm sentence", !!sWid && /request|invit|organizer|yes|wait/i.test(sr.body.error ?? ""), JSON.stringify(sr.body).slice(0, 160)); }
      else { t.expect("a stranger in an open game gets a ticket at once", sr, "ok"); sPid = sr.body.pid; }
      const total = async () => (await org.api("GET", `/api/z/${g.id}/participants`)).body.total;
      const seatsNow = (full ? cap : 3) + (sPid ? 1 : 0);
      t.eq("a waiting stranger uses no place", await total(), seatsNow);
      if (sWid) {
        t.check("the Organizer sees the request", ((await org.waiting(g.id)).body.waiting ?? []).some((x) => x.id === sWid));
        t.check("the Host sees the request", ((await host.api("GET", `/api/z/${g.id}/waiting`)).body.waiting ?? []).some((x) => x.id === sWid));
        const coSees = ((await co.api("GET", `/api/z/${g.id}/waiting`)).body.waiting ?? []).some((x) => x.id === sWid); t.eq("the Co-host sees it only if it came through their own link", coSees, arrive === "co");
        if (arrive !== "co") t.expect("a Co-host cannot decide a request that is not theirs", await co.api("POST", `/api/z/${g.id}/waiting/${sWid}`, { decision: "admit" }), [404]);
        t.eq("the stranger is told they are waiting", (await A.call("GET", `/api/z/${g.id}/me?wid=${sWid}`)).body.state, "waiting");
        const again = await joinRaw(g.id, { ...giveStranger, name: stranger.name, from: fromOf(via) }, t.ip()); t.eq("asking again is still one request", [again.status, (await org.waiting(g.id)).body.waiting.filter((x) => x.id === sWid).length], [403, 1]);
      } else t.expect("deciding a request that does not exist is a calm 404", await org.decide(g.id, "000000000000", "admit"), [404]);
      if (sWid) {
        if (c.o === "approve" || c.o === "approve-after-removal") {
          const d = await decider.decide(g.id, sWid, "admit"); t.expect(`${arrive} admits`, d, "ok"); t.eq("admitted", d.body.admitted, true);
          t.eq("the stranger is told they are in", (await A.call("GET", `/api/z/${g.id}/me?wid=${sWid}`)).body.state, "admitted");
          const re = await joinRaw(g.id, { ...giveStranger, name: stranger.name, from: fromOf(via) }, t.ip()); t.expect("the admitted stranger gets the ticket", re, "ok"); sPid = re.body.pid;
          t.check("who approved is recorded", ((await org.people(g.id)).body.people ?? []).some((p) => p.approvedBy), "no approvedBy");
          t.eq("a second decision on the same request changes nothing", (await decider.decide(g.id, sWid, "decline")).body.already, "admitted");
          if (c.o === "approve-after-removal") {
            const row = ((await org.people(g.id)).body.people ?? []).find((p) => p.approvedBy); t.check("the admitted person is on the list", !!row);
            if (row) { t.expect("Organizer removes them", await org.api("POST", `/api/z/${g.id}/people/${row.id}/remove`, {}), "ok");
              const back = await joinRaw(g.id, { ...giveStranger, name: stranger.name }, t.ip()); t.eq("the removed person cannot come back", back.body.code, "removed");
              t.eq("approving the old request again does not bring them back", (await decider.decide(g.id, sWid, "admit")).body.already ?? "none", "admitted"); } }
        } else if (c.o === "decline") {
          const d = await decider.decide(g.id, sWid, "decline"); t.expect(`${arrive} declines`, d, "ok"); t.eq("declined", d.body.declined, true);
          t.eq("the stranger is told", (await A.call("GET", `/api/z/${g.id}/me?wid=${sWid}`)).body.state, "declined");
          const re = await joinRaw(g.id, { ...giveStranger, name: stranger.name, from: fromOf(via) }, t.ip()); t.eq("a declined person who tries again is refused", [re.status, re.body.code], [403, "declined"]);
          t.eq("an admit after a decline changes nothing (first decision stands)", (await decider.decide(g.id, sWid, "admit")).body.already, "declined"); t.eq("no place used", await total(), 3);
        } else if (c.o === "approve-after-cap-full") {
          const d = await decider.decide(g.id, sWid, "admit"); t.expect("admit at a full game is refused calmly", d, [409]); t.eq("code over-cap", d.body.code, "over-cap");
          t.eq("the request stays waiting", (await A.call("GET", `/api/z/${g.id}/me?wid=${sWid}`)).body.state, "waiting"); t.eq("still full, not over", await total(), cap);
        } else if (c.o === "ignored") {
          t.eq("an undecided request stays waiting and uses no place", [(await A.call("GET", `/api/z/${g.id}/me?wid=${sWid}`)).body.state, await total()], ["waiting", 3]);
        }
      }
      // ---- invitations: level-1 guest, their invitee, and that invitee's own invitee (cannot invite) ----
      if (aud.invites) {
        const g1 = { name: personName(t.R), phone: mobile(t.R), empId: `G${t.R.int(1e6)}` }; t.eq("Organizer lists the level-1 guest", (await org.api("POST", `/api/z/${g.id}/people`, { people: [g1] })).body.added ?? 0, full ? 0 : 1);
        if (!full) {
          const r1 = await joinRaw(g.id, { ...giveListed(g1), name: g1.name }, t.ip()); t.expect("level-1 guest gets a ticket", r1, "ok"); const G1 = new A.Guest("", g.id, g1.phone, g1.name, dev(g1.phone ?? g1.empId)); G1.pid = r1.body.pid; G1.device = dev(g1.phone ?? g1.empId);
          if (r1.ok) { const device = r1.body.device ?? dev(g1.phone ?? g1.empId); G1.device = dev(c.v === "mobile" || c.v === "both" ? g1.phone : g1.empId);
            const inv = { name: personName(t.R), phone: mobile(t.R) }; const a1 = await G1.addPeople([inv]); t.expect("level-1 guest invites a person", a1, "ok"); t.eq("added 1", a1.body.added, 1);
            if (a1.ok) { const token = A.tokenOfLink(a1.body.people[0].link); const j2 = await A.joinByToken(g.id, token, inv.phone, inv.name, t.ip()); t.expect("the invited person gets a ticket from the personal link, whatever the mode", j2, "ok");
              if (j2.ok) { const G2 = new A.Guest("", g.id, inv.phone, inv.name, dev(inv.phone)); G2.pid = j2.body.pid; const a2 = await G2.addPeople([{ name: personName(t.R), phone: mobile(t.R) }]); t.expect("level 2 cannot invite anyone", a2, "deny"); } } } }
      } else if (aud.eo) { const g1 = person("g"); await org.api("POST", `/api/z/${g.id}/people`, { people: [g1] }); const r1 = await joinRaw(g.id, { ...giveListed(g1), name: g1.name }, t.ip()); if (r1.ok) { const G1 = new A.Guest("", g.id, g1.phone, g1.name, dev(c.v === "mobile" || c.v === "both" ? g1.phone : g1.empId)); G1.pid = r1.body.pid; t.expect("employees-only: a guest cannot invite", await G1.addPeople([{ name: "Zed", phone: mobile(t.R) }]), "refuse"); } }
      // ---- lifecycle event ----
      const lateP = person("L");
      if (c.e === "late-join") {
        const st = g.startMs; await L.clock.set(st + 5 * 60_000);
        if (!full) { await org.api("POST", `/api/z/${g.id}/people`, { people: [lateP] }); const r = await joinRaw(g.id, { ...giveListed(lateP), name: lateP.name }, t.ip()); t.expect("a listed person who arrives after the first number still gets a ticket", r, "ok"); }
        t.check("the game page still answers", (await A.call("GET", `/api/z/${g.id}/info`)).status === 200);
      } else if (c.e === "cancel" || c.e === "cancel-reopen") {
        t.expect("Organizer cancels", await org.cancel(g.id), "ok");
        const r = await joinRaw(g.id, { ...giveListed(mine.org), name: mine.org.name }, t.ip()); t.check("a cancelled game takes nobody new (calm refusal)", r.status >= 400 && r.status < 500 && !!r.body.error, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
        t.expect("a cancelled game's personal link page is a calm 404", { status: (await fetch(`${L.SIM}/j/nosuchlink99`)).status, body: {} }, [404]);
        if (c.e === "cancel-reopen") { const rr = await org.api("POST", `/api/z/${g.id}/reopen`, { startRound: await A.startRoundIn(3 * L.DAY) }); t.expect("Organizer moves the game to a new date", rr, "ok");
          if (rr.ok) { const j = await joinRaw(g.id, { ...giveListed(mine.org), name: mine.org.name }, t.ip()); t.expect("after the move a listed person gets in again", j, "ok"); } }
      } else if (c.e === "end-window") {
        await L.clock.set(g.startMs + 4 * L.HOUR); await A.call("POST", "/__sim/tick", {});
        const w = sWid ? (await A.call("GET", `/api/z/${g.id}/me?wid=${sWid}`)).body.state : null; if (sWid && (c.o === "ignored" || c.o === "approve-after-cap-full")) t.eq("an undecided request lapses when the game is over", w, "lapsed");
        const late = await joinRaw(g.id, { ...giveListed(person("z")), name: "Late Comer" }, t.ip()); t.check("after the game nobody new gets in (a calm refusal)", late.status >= 400 && late.status < 500, `HTTP ${late.status}`);
        t.check("results page answers", (await A.call("GET", `/api/z/${g.id}/results`)).status === 200);
      }
      // ---- invariants of every journey ----
      const dupP = await A.sql("SELECT COUNT(*) c FROM (SELECT phone_hash FROM participant WHERE eid=? GROUP BY phone_hash HAVING COUNT(*)>1)", [g.id]); const dupD = await A.sql("SELECT COUNT(*) c FROM (SELECT dev FROM seat WHERE eid=? AND dev IS NOT NULL AND dev<>'' GROUP BY dev HAVING COUNT(*)>1)", [g.id]);
      t.eq("no number and no phone holds two tickets", [dupP[0].c, dupD[0].c], [0, 0]); t.check("never more people than the game size", (await total()) <= cap, `${await total()} of ${cap}`);
      const leak = await A.sql("SELECT COUNT(*) c FROM person WHERE eid=? AND status='joined' AND NOT EXISTS (SELECT 1 FROM seat s WHERE s.eid=person.eid AND s.ph=person.ph)", [g.id]); t.eq("everybody marked joined has a seat", leak[0].c, 0);
    } });
  }
  return out;
}
