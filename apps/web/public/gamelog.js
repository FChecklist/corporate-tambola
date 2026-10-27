/* Corporate Tambola game log: the vital details of one game, as a page to read, print or save as a PDF, and as a plain text file. For the Organizer and the Host only (the key comes from the console link
   after #k= and is checked with the server). Tickets by number only: no names, no mobile numbers, no e-mail addresses. The numbers called, with the time of each, are worked out here from the game's
   schedule, the Organizer's pause record and the public random-number feed, exactly as every phone does it. */
(function () {
  const ZG = window.ZG;
  const $app = document.getElementById("app");
  const q = new URLSearchParams(location.search);
  const EID = (q.get("e") || "").trim();
  const KEY = decodeURIComponent((location.hash.match(/[#&]k=([^&]*)/) || [])[1] || "");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const IST = (ms) => (ms == null ? "-" : new Date(ms).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) + " IST");
  const HMS = (ms) => (ms == null ? "-" : new Date(ms).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }));
  const dur = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? m + " minutes" : Math.floor(m / 60) + " h " + (m % 60) + " min"; };
  let LOG = null, NUMS = [], NUMBERS_NOTE = "";

  async function numbersOf(log) {
    const sc = log.schedule || {};
    if (!sc.startRound) return [];
    const cf = { v: 1, engagementId: EID, pubKey: sc.pubKey || "00".repeat(32), hostKeys: sc.hostKeys || [], leadRounds: sc.leadRounds || 13, maxPauseRounds: sc.maxPauseRounds || 600, messages: sc.messages || [], ...(sc.startOnly ? { startOnly: true } : {}) };
    const cfg = { breaks: sc.breaks || [], rounds: sc.rounds || 1, callMode: sc.callMode === "host" ? "host" : "auto", startMode: sc.manualStart ? "manual" : "auto" };
    const st = sc.pubKey ? ZG.resolveControl(ZG.cfgOf(cf, ZG.hostGameOf(cfg, sc.startRound)), cf.messages) : null;
    const store = new ZG.RoundStore({}), stride = sc.callSeconds / 3, out = [];
    const now = (await ZG.fetchRound("latest"))?.round ?? Infinity;
    for (let r = 1; r <= cfg.rounds; r++) {
      const sched = Array.from({ length: 90 }, (_, k) => ZG.callRoundR(st, sc.startRound + ZG.GRACE_ROUNDS, stride, cfg.breaks, r, k));
      const upto = sched.filter((x) => x !== null && Number.isFinite(x) && x <= now);
      let rest = upto.filter((x) => !store.rounds.has(x));
      while (rest.length) { const chunk = rest.slice(0, 40); await Promise.all(chunk.map((x, i) => store.fetchBackfill(x, i))); rest = rest.filter((x) => !store.rounds.has(x)); if (rest.length === upto.length) break; }
      const nums = ZG.logFrom(ZG.roundEid(EID, r), sched.filter((x) => x !== null && Number.isFinite(x)), store, upto.length);
      let called = log.numbersCalled == null ? nums.length : Math.min(nums.length, log.numbersCalled - 90 * (r - 1));
      for (let k = 0; k < Math.min(called, nums.length); k++) out.push({ round: r, k: k + 1, n: nums[k], atMs: ZG.roundTimeMs(upto[k]) });
    }
    return out;
  }

  function lines(log) {
    const L = [];
    const mode = (log.mode.start === "manual" ? "the host pressed Start" : "started by itself at the time") + "; " + (log.mode.call === "host" ? "a Host called every number" : "the game called the numbers") + "; " + (log.mode.afterPrizes === "keep" ? "kept calling until all 90 numbers" : "ended when every prize was won");
    L.push(["title", `Game log: ${log.name} (${log.id})`]);
    L.push(["note", log.saved ? "Saved when the game ended. It contains ticket numbers only: no names, mobile numbers or e-mail addresses." : "The game is still running: this log is as it stands now. It contains ticket numbers only: no names, mobile numbers or e-mail addresses."]);
    L.push(["h", "The game"]);
    L.push(["row", "Start time", IST(log.startsAtMs)]);
    L.push(["row", "First number called", IST(log.firstNumberMs)]);
    L.push(["row", "End time", log.endedAtMs ? IST(log.endedAtMs) : "The game has not ended yet"]);
    if (log.firstNumberMs && log.endedAtMs) L.push(["row", "Length", dur(log.endedAtMs - log.firstNumberMs)]);
    L.push(["row", "How it ended", log.endReason || "Not ended yet"]);
    L.push(["row", "Numbers called", log.numbersCalled == null ? "-" : `${log.numbersCalled} of 90`]);
    L.push(["row", "How it ran", mode]);
    L.push(["h", "People"]);
    L.push(["row", "People who joined", String(log.people.joined)]);
    L.push(["row", "Most people in the game at once", String(log.people.most) + " (nobody leaves the list)"]);
    L.push(["row", "Joined after the first number", String(log.people.late)]);
    if (log.people.present != null) L.push(["row", "Checked in as present", String(log.people.present)]);
    L.push(["h", "Prizes"]);
    if (!log.prizes.length) L.push(["note", "No prize was won."]);
    for (const p of log.prizes) L.push(["row", p.prize + (p.text ? " (" + p.text + ")" : ""), `Ticket number ${p.ticket}, after number call ${p.callNo}, at ${HMS(p.atMs)}`]);
    for (const l of (log.lucky || [])) L.push(["row", "Lucky draw: " + l.title, l.drawn ? `Drawn. Ticket number${l.tickets.length === 1 ? "" : "s"} ${l.tickets.join(", ")}` : `Not drawn yet (${l.winners} ticket${l.winners === 1 ? "" : "s"} picked at random)`]);
    L.push(["h", "Pauses"]);
    if (!log.pauses.length) L.push(["note", "The game was never paused."]);
    for (const z of log.pauses) L.push(["row", `Paused by ${z.by.replace(/^The /, "the ").replace(/^A /, "a ")}`, `${HMS(z.fromMs)} to ${z.toMs ? HMS(z.toMs) : "until resumed"}` + (z.toMs ? ` (${dur(z.toMs - z.fromMs)})` : "")]);
    L.push(["h", "Changes to the settings"]);
    if (!log.changes.length) L.push(["note", "Nothing was changed after the game was made."]);
    for (const c of log.changes) L.push(["row", `${c.when} · ${c.who}`, c.what]);
    L.push(["h", "Report e-mail"]);
    L.push(["row", "Status", log.report.state === "sent" ? "Sent to the organizer at " + IST(log.report.sentMs) : log.report.state ? "Being prepared" : "Not sent yet (it is sent a few minutes after the game ends)"]);
    L.push(["h", "Every number called, with its time"]);
    if (NUMBERS_NOTE) L.push(["note", NUMBERS_NOTE]);
    L.push(["nums", NUMS]);
    return L;
  }
  const html = (log) => `<h1>${esc("Game log: " + log.name)}</h1><div class="bar"><button type="button" id="printbtn">Print or save as PDF</button><button type="button" id="txtbtn" class="alt">Download as a text file</button></div>` +
    lines(log).slice(1).map(([t, a, b]) => t === "note" ? `<p class="note">${esc(a)}</p>` : t === "h" ? `<h2>${esc(a)}</h2>` : t === "row" ? `<table><tr><th style="width:36%">${esc(a)}</th><td>${esc(b)}</td></tr></table>` : t === "nums" ? `<div class="nums" id="numlist">${a.map((x) => `<div>${log.schedule && log.schedule.rounds > 1 ? "Game " + x.round + ", " : ""}${String(x.k).padStart(2, " ")}. <b>${x.n}</b> &nbsp; ${esc(HMS(x.atMs))}</div>`).join("")}</div>` : "").join("");
  const text = (log) => lines(log).map(([t, a, b]) => t === "title" ? a + "\n" + "=".repeat(a.length) : t === "note" ? a : t === "h" ? "\n" + a.toUpperCase() : t === "row" ? `${a}: ${b}` : t === "nums" ? a.map((x) => `${log.schedule && log.schedule.rounds > 1 ? "Game " + x.round + ", " : ""}${String(x.k).padStart(2, " ")}. ${String(x.n).padStart(2, " ")}   ${HMS(x.atMs)}`).join("\n") : "").join("\n") + "\n";

  function bind() {
    const p = document.getElementById("printbtn"), t = document.getElementById("txtbtn");
    if (p) p.onclick = () => window.print();
    if (t) t.onclick = () => { const b = new Blob([text(LOG)], { type: "text/plain;charset=utf-8" }), a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "game-log-" + EID + ".txt"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
  }
  async function main() {
    if (!EID || !KEY) { $app.innerHTML = `<p>Open the game log from your console: it needs your own link.</p>`; return; }
    try {
      const r = await fetch(`/api/z/${encodeURIComponent(EID)}/gamelog`, { headers: { "x-organizer": KEY }, cache: "no-store" });
      if (!r.ok) { $app.innerHTML = `<p>${r.status === 403 ? "This log is for the Organizer and the Hosts of the game. Please sign in from your console." : "The game log could not be opened just now. Please try again in a minute."}</p>`; return; }
      LOG = await r.json();
      $app.innerHTML = html(LOG); bind();
      NUMBERS_NOTE = "Worked out from the public random numbers, the same way every player's phone did.";
      try { NUMS = await numbersOf(LOG); } catch { NUMS = []; NUMBERS_NOTE = "The numbers could not be fetched just now. Please reload this page in a minute."; }
      if (!NUMS.length && LOG.numbersCalled === 0) NUMBERS_NOTE = "No number was called.";
      $app.innerHTML = html(LOG); bind();
      window.__gamelog = { log: LOG, nums: NUMS, text: () => text(LOG) }; // read by the tests
      if (q.get("txt") === "1") document.getElementById("txtbtn").click(); // "Download as a text file" from the console
    } catch { $app.innerHTML = `<p>The game log could not be opened. Please check your internet connection and reload.</p>`; }
  }
  main();
})();
