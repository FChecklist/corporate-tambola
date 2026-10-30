// G3 Roles. Host and Co-host keys are created through the organizer's API (what the console's "add a Host / Co-host" button does) and opened on real console pages.
// Not implemented here (reason): UC-G3-03 (the Co-host limit has no setting reachable without the console flow), UC-G3-08 (needs a consent record dated before the version change: layer A / unit tests), UC-G3-10 (remove-person route to be confirmed).
import { demoEmail } from "../tags.mjs";
import { createGame, mkChecks, addRole, acceptRole, openConsole, closeAll } from "../core.mjs";
import { IMPL as G2 } from "./g2.mjs";

const LONG = { startInSec: 900 };
const mk = (api, runId, c, o = {}) => createGame(api, runId, c.id, { ...LONG, ...o });
export const IMPL = {
  /** The Host opens the Host link, accepts the role, and sees the game. */
  async "UC-G3-01"(c, env) {
    const { ck, checks } = mkChecks(); const { api, runId } = env; const g = await mk(api, runId, c);
    const hk = await addRole(api, g, "host", "Priya"); const acc = await acceptRole(api, hk); ck("the Host accepts the role (API, the box is ticked by the client)", acc.ok, acc.status);
    const who = await api("GET", "/api/whoami", undefined, hk); ck("whoami says host", who.body.kind === "host", JSON.stringify(who.body).slice(0, 100));
    const con = await openConsole(env, g, hk, { flow: "old", extra: `&k=${encodeURIComponent(hk)}` });
    try { const t = await con.text(); ck("the Host console opens with the game and no script error", con.errs.length === 0 && t.includes(g.tag.id), t.slice(0, 160) + " " + con.errs.join(";")); ck("it is not the player page", !/Join the game/.test(t)); } finally { await closeAll([con]); }
    return { checks, game: g.tag.id };
  },
  /** The Co-host accepts and sees only the small game header: no settings, no payment. */
  async "UC-G3-02"(c, env) {
    const { ck, checks } = mkChecks(); const { api, runId } = env; const g = await mk(api, runId, c);
    const k = await addRole(api, g, "cohost", "Ravi"); await acceptRole(api, k);
    const who = await api("GET", "/api/whoami", undefined, k); ck("whoami says cohost", who.body.kind === "cohost");
    const view = await api("GET", `/api/z/${g.tag.id}/cohost`, undefined, k); ck("the small game header answers and the role is accepted", view.ok && view.body.roleAccepted === true, JSON.stringify(view.body).slice(0, 140));
    ck("a Co-host cannot read the organizer's settings or pay (API)", (await api("GET", `/api/z/${g.tag.id}/summary`, undefined, k)).status >= 400 && (await api("POST", "/api/checkout", { e: g.tag.id }, k)).status >= 400);
    const con = await openConsole(env, g, k, { flow: "old", extra: `&k=${encodeURIComponent(k)}` });
    try { const t = await con.text(); ck("the Co-host console shows the game header and no organizer sections", /Here is the game/i.test(t) && !/Payment|Prizes you chose/i.test(t), t.slice(0, 200)); } finally { await closeAll([con]); }
    return { checks, game: g.tag.id };
  },
  /** Who approves: the organizer's sentence says only the truthful part. */
  async "UC-G3-04"(c, env) {
    const { ck, checks } = mkChecks(); const { api, runId } = env; const g = await mk(api, runId, c, { settings: { whoCanJoin: "list" } });
    const hk = await addRole(api, g, "host", "Priya"); await acceptRole(api, hk);
    const o = await openConsole(env, g, g.key, { flow: "new" });
    try {
      const t = await o.text(); ck("the organizer reads 'wait for you or a Host'", /People who join with the game link wait for you or a Host\./.test(t), t.slice(0, 160));
      ck("no Co-host or family approval is promised", !/Co-host can also|family host approves/i.test(t));
    } finally { await closeAll([o]); }
    return { checks, game: g.tag.id };
  },
  /** Host vs organizer: the Host cannot erase participant data, the organizer can. */
  async "UC-G3-05"(c, env) {
    const { ck, checks } = mkChecks(); const { api, runId } = env; const g = await mk(api, runId, c);
    const hk = await addRole(api, g, "host", "Priya"); await acceptRole(api, hk);
    const e = await api("POST", `/api/z/${g.tag.id}/erase`, {}, hk); ck("a Host is refused when erasing participant data (API)", e.status === 403 || e.status === 401, e.status);
    const e2 = await api("POST", `/api/z/${g.tag.id}/erase`, {}, g.key); ck("the organizer may erase (API)", e2.ok, e2.status + " " + JSON.stringify(e2.body).slice(0, 80));
    return { checks, game: g.tag.id };
  },
  /** At most 5 Hosts: the sixth is refused in plain words. */
  async "UC-G3-06"(c, env) {
    const { ck, checks } = mkChecks(); const { api, runId } = env; const g = await mk(api, runId, c);
    let ok = 0, last = null;
    for (let i = 1; i <= 6; i++) { const r = await api("POST", "/api/org/host", { label: "H" + i, email: demoEmail(), e: g.tag.id }, g.key); if (r.ok) ok++; else last = r; }
    ck("five Hosts were added", ok === 5, ok); ck("the sixth is refused with a plain sentence", !!last && last.status >= 400 && typeof last.body.error === "string" && /Host/i.test(last.body.error), JSON.stringify(last && last.body).slice(0, 160));
    return { checks, game: g.tag.id };
  },
  /** A Co-host who has not accepted the role gets the tick sentence and nothing else works. */
  async "UC-G3-07"(c, env) {
    const { ck, checks } = mkChecks(); const { api, runId } = env; const g = await mk(api, runId, c);
    const k = await addRole(api, g, "cohost", "Ravi");
    const r = await api("GET", `/api/z/${g.tag.id}/people`, undefined, k); ck("the Co-host is asked for the tick (code consent-required)", r.status === 400 && r.body.code === "consent-required", r.status + " " + JSON.stringify(r.body).slice(0, 100));
    const v = await api("GET", `/api/z/${g.tag.id}/cohost`, undefined, k); ck("the small header says the role is not accepted yet", v.body.roleAccepted === false, JSON.stringify(v.body).slice(0, 120));
    const a = await acceptRole(api, k); ck("after the tick everything opens", a.ok && (await api("GET", `/api/z/${g.tag.id}/people`, undefined, k)).ok);
    return { checks, game: g.tag.id };
  },
  /** Two Co-hosts: each sees only the requests of their own link (same flow as UC-G2-04, its own game). */
  async "UC-G3-09"(c, env) { return G2["UC-G2-04"](c, env); },
};
