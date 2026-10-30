// G6 Links and pages. Not implemented here (reason): UC-G6-02 (personal link tokens), UC-G6-06/07/09 (need a game played to the end), UC-G6-08 (needs a server clock the test can move).
import { createHash } from "node:crypto";
import { createGame, joinPlayer, mkChecks, addPeople, addRole, acceptRole, openConsole, fakePhone, text, closeAll, newContext, sleep } from "../core.mjs";

const LONG = { startInSec: 900 };
const mk = (api, runId, c, o = {}) => createGame(api, runId, c.id, { ...LONG, ...o });
export const IMPL = {
  /** The common link: the invitation sentence, then the join works. */
  async "UC-G6-01"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env; const g = await mk(api, runId, c);
    const ctx = await newContext(browser, base, meter); const page = await ctx.newPage(); await page.goto(`${base}/z.html?e=${g.tag.id}`, { waitUntil: "load" }); await sleep(2500);
    let p; try {
      const t = (await page.locator("body").innerText()).replace(/\s+/g, " ");
      ck("the invitation names the Corporate Tambola (Housie) and says what to type", /You are invited to join the Corporate Tambola \(Housie\) organized by/.test(t) && /To join, type your mobile number\./.test(t), t.slice(0, 260));
      p = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: false }); ck("the join works", p.joined);
    } finally { await closeAll([{ ctx }, p]); }
    return { checks, game: g.tag.id };
  },
  /** A family link shows the family wording to a person who must wait. */
  async "UC-G6-03"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env;
    const g = await mk(api, runId, c, { settings: { whoCanJoin: "list", invites: { on: true, per: 4, cats: ["family"] } } });
    const hp = fakePhone(); await addPeople(api, g, [{ name: "Host Family", phone: hp }]);
    const host = await joinPlayer(browser, base, meter, g.tag.id, hp, { checkin: false }); const m = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: false, query: "&from=1&c=family" });
    try { ck("the family host joined", host.joined); ck("the family link shows the family wording", /family host approves your entry/.test(await text(m)), (await text(m)).slice(0, 220)); } finally { await closeAll([host, m]); }
    return { checks, game: g.tag.id };
  },
  /** A Co-host link never shows the family words. */
  async "UC-G6-04"(c, env) {
    const { ck, checks } = mkChecks(); const { api, browser, base, meter, runId } = env;
    const g = await mk(api, runId, c, { settings: { whoCanJoin: "list" } });
    const k = await addRole(api, g, "cohost", "Ravi"); await acceptRole(api, k);
    const from = 1_000_000_000 + parseInt(createHash("sha256").update("key|" + k).digest("hex").slice(0, 7), 16);
    const p = await joinPlayer(browser, base, meter, g.tag.id, fakePhone(), { checkin: false, query: `&from=${from}` });
    try { const t = await text(p); ck("the person waits", !p.joined && /Please wait/i.test(t), t.slice(0, 180)); ck("no family wording on a Co-host link", !/family/i.test(t), t.slice(0, 220)); } finally { await closeAll([p]); }
    return { checks, game: g.tag.id };
  },
  /** The Host link opens the Host console, not the player page. */
  async "UC-G6-05"(c, env) {
    const { ck, checks } = mkChecks(); const { api, runId } = env; const g = await mk(api, runId, c);
    const hk = await addRole(api, g, "host", "Priya"); await acceptRole(api, hk);
    const con = await openConsole(env, g, hk, { flow: "old", extra: `&k=${encodeURIComponent(hk)}` });
    try { const t = await con.text(); ck("a console, not the join page", !/Join the game/.test(t) && t.includes(g.tag.id), t.slice(0, 200)); ck("no script error", con.errs.length === 0, con.errs.join(";")); } finally { await closeAll([con]); }
    return { checks, game: g.tag.id };
  },
  /** Brochure, guide, manual: they answer, the PDFs are real, the six-item menu is on the guide. */
  async "UC-G6-10"(c, env) {
    const { ck, checks } = mkChecks(); const { base, meter } = env;
    for (const [path, min] of [["/brochure.pdf", 100_000], ["/organizer-manual.pdf", 200_000]]) { if (meter) meter.count(1, "GET " + path); const r = await fetch(base + path); const b = new Uint8Array(await r.arrayBuffer()); ck(`${path} is a real PDF of a sensible size`, r.ok && String.fromCharCode(...b.slice(0, 4)) === "%PDF" && b.length >= min, `${r.status} ${b.length} bytes`); }
    if (meter) meter.count(1, "GET /organizer-guide.html"); const gr = await fetch(base + "/organizer-guide.html"); const html = await gr.text();
    ck("the guide answers with the six-item menu", gr.ok && ["How it works", "Free demo game", "Guide", "Brochure", "Refer &amp; earn", "Log in"].every((x) => html.includes(x)));
    ck("the guide names the Use the previous screens link", /Use the previous screens/.test(html));
    return { checks };
  },
};
