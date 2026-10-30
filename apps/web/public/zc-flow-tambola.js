/* Corporate Tambola only: the parts of the new organizer / Host / Co-host console (?flow=new) that other games do not have.
   Loaded AFTER pack/zc-flow.js. It never edits the shared pack: it adds sections to the pack's dashboard and step 3 when they are drawn.
   Wired to the real engine where the engine has support (rehearsals 1.6.0, prizes, prize handed over, presence, game log, claims, erase).
   Owner rule D (29 Oct): UI layer only. Whatever the existing engine does not support is HIDDEN (no coming soon, no demo stub, no disabled look-alike). */
(() => {
  if (typeof window === "undefined" || !window.ZFLOW || !window.ZFLOW.state) return; // the current console also loads this file: it does nothing unless the new console (?flow=new) started
  const Z = window.ZFLOW, el = Z.el, st = Z.state, dash = Z.dash;

  /** The three claim messages, then what the board says when the claim is settled. */
  const claimText = (c, mode) => c.phase === "check" ? "Ticket " + c.ticket + " has claimed " + c.prize + ". The system is checking..."
    : c.phase === "ok" ? "Congratulations! The claim is correct." : c.phase === "gone" ? c.prize + " is gone. It has been won by Ticket " + c.ticket + "." + (mode === "manual" ? " Press the button to roll out the next number." : "") : "";
  /** The top-right label: who is signed in, and the organizer on a second line. */
  const whoLines = (role, email, org, by) => role === "host" ? ["Host: " + email].concat(org ? ["Organizer: " + org] : []) : role === "cohost" ? ["Co-host: " + email, "You were made Co-host by: " + (by || org || "the organizer")].concat(org ? ["Organizer: " + org] : []) : ["Organizer: " + (org || "your email")];
  /** Ready check: link shared, payment, prizes chosen are needed; Hosts added and rehearsal done are optional. */
  const readyItems = (f) => [["Game link shared", !!f.shared, true], ["Payment", !!f.paid, true], ["Prizes chosen", !!f.prizes, true], ["Hosts added", !!f.hosts, false], ["Rehearsal done", !!f.rehearsed, false]];
  window.ZTAMBOLA = { claimText, whoLines, readyItems };

  /* ---- a Co-host opens the game with their own personal key link plus ?flow=new: whoami says who they are ---- */
  const ss = (() => { try { return window.sessionStorage; } catch { return null; } })();
  async function coHostEntry() {
    const m = location.hash.match(/^#(?:host|cohost)=(ct[hc]_[0-9a-f]{48})$/), k = new URLSearchParams(location.search).get("k"), key = m ? m[1] : k && /^ct[hca]_[0-9a-f]{48}$/.test(k) ? k : "";
    if (key && ss) { try { ss.setItem("ctz-org", key); } catch { /* the page still tries with the old key */ } }
    if (!(key || (ss && ss.getItem("ctz-org")))) return;
    try { const wh = await Z.call("GET", "/api/whoami"); if (wh && wh.kind === "cohost") { T.kind = "cohost"; st.role = "cohost"; st.team = { email: wh.email || "" }; paint(); load(); } } catch { /* not a Co-host: the organizer screens stay */ }
  }

  /* ---- live state for the added sections ---- */
  const T = { kind: "", mode: "auto", paused: false, lastRoll: 0, claim: null, prizes: [], reh: null, presence: null, glog: null, tick: 12, shared: false };
  const call = (m, p, b) => Z.call(m, p, b);
  const eid = () => st.eid;
  async function load() {
    if (!eid()) return;
    try { T.reh = await call("GET", `/api/z/${eid()}/rehearsals`); } catch { /* the cards stay */ }
    try { T.prizes = (await call("GET", `/api/z/${eid()}/prizes`)).prizes || []; } catch { /* the list stays */ }
    try { T.presence = await call("GET", `/api/z/${eid()}/presence`); } catch { T.presence = null; }
    try { T.glog = await call("GET", `/api/z/${eid()}/gamelog`); } catch { T.glog = null; }
    const open = (dash.claims || []).filter((c) => c && (c.state === "checking" || c.status === "checking")).pop();
    try { T.waiting = (await call("GET", `/api/z/${eid()}/waiting`)).waiting || []; } catch { /* the last list stays */ }
    try { T.team = await call("GET", "/api/org/team?e=" + encodeURIComponent(eid())); } catch { T.team = null; }
    try { T.coLimit = Number(((await call("GET", `/api/z/${eid()}/summary`)) || {}).coHostLimit) || 100; } catch { /* the last limit stays */ }
    if (st.role === "cohost" || st.view === "cohost") { try { T.mine = await call("GET", `/api/z/${eid()}/people?limit=1`); } catch { T.mine = null; } }
    T.claim = open ? { phase: "check", ticket: open.seat || open.ticket, prize: open.prize || open.name || "a prize" } : T.claim && T.claim.phase !== "check" ? T.claim : null;
    paint();
  }

  /* ---- sections ---- */
  const h3 = (t) => el("h3", { text: t });
  const small = (t, a) => el("p", { class: "zf-small", ...(a || {}), text: t });
  function whoLabel() {
    const org = (st.raw && st.raw.organizerEmail) || "", me = st.team && st.team.email ? st.team.email.trim() : org;
    return el("div", { class: "zt-who", id: "zt-who" }, whoLines(st.role || "organizer", me, org).map((l) => el("div", { text: l })));
  }
  const LIMITS = [10, 25, 50, 100, 250, 500, 1000];
  /** Your Co-hosts: who brought how many of the limit. The engine keeps ONE limit for the game (coHostLimit), the same for every Co-host. */
  function coHostsBlock() {
    const list = (T.team && T.team.cohosts) || [], lim = T.coLimit || 100, box = el("section", { class: "zt-cohosts", id: "zt-cohosts" }, h3("Your Co-hosts"));
    if (!list.length) { box.append(small("No Co-host added yet.")); return box; }
    const sel = el("select", { id: "zt-colimit", "aria-label": "Limit for each Co-host", onchange: async (e) => { try { await call("PATCH", `/api/z/${eid()}/settings`, { coHostLimit: Number(e.target.value) }); T.coLimit = Number(e.target.value); dash.note = "Saved."; } catch (er) { dash.note = er.message; } Z.draw(); } }, LIMITS.map((n) => el("option", { value: String(n), ...(n === lim ? { selected: "" } : {}) }, String(n))));
    const t = el("table", { class: "zf-table", id: "zt-cotable" }, el("thead", {}, el("tr", {}, ["Co-host", "Invited so far"].map((c) => el("th", { scope: "col", text: c })))));
    const tb = el("tbody"); for (const c of list) tb.append(el("tr", {}, el("td", { "data-label": "Co-host", text: c.email || c.label || "Co-host" }), el("td", { "data-label": "Invited so far", text: (Number(c.brought) || 0) + " of " + lim }))); t.append(tb);
    box.append(el("div", { class: "zf-tablewrap" }, t), el("label", { for: "zt-colimit", text: "Each Co-host can bring up to " }), sel, small("The limit is the same for every Co-host of this game. You can change it any time."));
    return box;
  }
  /** The Co-host's own read-only line. */
  function coHostLimitLine() {
    const m = T.mine || {}, lim = Number(m.limit) || T.coLimit || 100, used = Number(m.used) || 0, by = (st.raw && st.raw.organizerEmail) || "the organizer";
    return el("p", { class: "zf-small", id: "zt-colimitline", text: "You can invite up to " + lim + " people. Invited so far: " + used + ". " + Math.max(0, lim - used) + " left. This limit was set by " + by + "." });
  }
  /** The Co-host screen (spec 1.7.0 sec 10): only the invite link and the people they invited who wait. Nothing else. */
  function coHostScreen() {
    const m = T.mine || {}, link = m.commonLink || (location.origin + "/z.html?e=" + encodeURIComponent(eid())), lim = Number(m.limit) || T.coLimit || 100, used = Number(m.used) || 0;
    const msg = "Please join our online team game. Game link: " + link + " (Game ID " + eid() + ")";
    const box = el("section", { class: "zt-cohostscreen", id: "zt-cohostscreen" }, el("h2", { text: "Your link to invite people to the game" }),
      el("input", { type: "text", readonly: "", id: "zt-colink", value: link }),
      el("p", { class: "zf-btnrow" }, el("button", { type: "button", class: "zf-go", id: "zt-cocopy", onclick: async () => { try { await navigator.clipboard.writeText(link); dash.note = "Link copied."; } catch { dash.note = "Please copy it by hand."; } paint(); } }, "Copy link"), " ",
        el("button", { type: "button", class: "zf-add", id: "zt-cocopymsg", onclick: async () => { try { await navigator.clipboard.writeText(msg); dash.note = "Message copied."; } catch { dash.note = "Please copy it by hand."; } paint(); } }, "Copy a message to share")),
      small("Game ID " + eid() + ". Everyone who joins using this link is recorded as a participant you invited."), coHostLimitLine(),
      el("h2", { text: "People you invited, waiting for you" }), small(window.ZROLES ? window.ZROLES.approvalText("cohost") : "", { id: "zt-approves" }));
    const rows = T.waiting || [];
    if (!rows.length) box.append(small("Nobody is waiting right now.", { id: "zt-nowait" }));
    for (const w of rows) box.append(el("p", { "data-wid": String(w.id) }, "Ticket " + (w.ticket || w.seat || w.id) + " ", el("button", { type: "button", class: "zf-go", onclick: async () => { try { await call("POST", `/api/z/${eid()}/waiting/${encodeURIComponent(w.id)}`, { decision: "admit" }); } catch (e) { dash.note = e.message; } T.waiting = (T.waiting || []).filter((x) => x.id !== w.id); const o = document.getElementById("zt-cohostscreen"); if (o) o.remove(); paint(); } }, "Let in"), " ", el("button", { type: "button", class: "zf-add", onclick: async () => { try { await call("POST", `/api/z/${eid()}/waiting/${encodeURIComponent(w.id)}`, { decision: "later" }); } catch (e) { dash.note = e.message; } T.waiting = (T.waiting || []).filter((x) => x.id !== w.id); const o = document.getElementById("zt-cohostscreen"); if (o) o.remove(); paint(); } }, "Not now")));
    return box;
  }
  function deleteBlock() {
    const done = !!(st.raw && st.raw.completed) || st.demoStatus === "completed";
    if (!done) return null;
    return el("p", {}, el("button", { type: "button", class: "zf-add zt-del green", id: "zt-delete", onclick: async () => { try { await call("POST", `/api/z/${eid()}/erase`, {}); dash.note = "Participant data deleted."; } catch (e) { dash.note = e.message; } Z.draw(); } }, "Delete all participant data"));
  }

  /* ---- Step 1: how the game starts and who calls the numbers (the engine's own startMode / callMode, 1.5.0 wording) ---- */
  const RUN = { start: "auto", call: "auto", idKind: "emp", idTouched: false };
  const timeText = () => { if (!st.when) return "the time you set"; try { return new Intl.DateTimeFormat("en-GB", { timeZone: st.when.zone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(st.when.ms)); } catch { return "the time you set"; } };
  const runSummary = (r, when) => "Your game: " + (r.start === "manual" ? "starts at " + when + " when you press Start." : "starts by itself at " + when + ".") + " " + (r.call === "host" ? "You call the numbers." : "The game calls the numbers.");
  const savedRun = async () => { if (!eid()) return; try { await call("PATCH", `/api/z/${eid()}/settings`, { startMode: RUN.start, callMode: RUN.call, ...(RUN.idTouched ? { idKind: RUN.idKind } : {}) }); } catch { /* the choice is sent again on the next Save */ } };
  function runQuestions() {
    const box = el("div", { class: "zt-run", id: "zt-run" });
    const group = (title, name, key, opts) => { const g = el("div", { role: "radiogroup", "aria-label": title }, el("h3", { text: title })); for (const [v, label, hint] of opts) g.append(el("label", { class: "zf-opt" }, el("input", { type: "radio", name, value: v, ...(RUN[key] === v ? { checked: "" } : {}), onchange: () => { RUN[key] = v; savedRun(); const sm = document.getElementById("zt-runsum"); if (sm) sm.textContent = runSummary(RUN, timeText()); } }), " " + label + " ", el("small", { text: hint }))); return g; };
    box.append(group("How should the game start?", "zt-start", "start", [["auto", "Auto start", "The game starts by itself at the time I set."], ["manual", "Manual start", "The game starts when I press the Start button."]]),
      group("Who calls the numbers?", "zt-call", "call", [["auto", "The game calls the numbers", "A new number comes every 12 seconds, by itself."], ["host", "I call the numbers", "I press the button to roll out every number, one press at a time."]]),
      el("p", { class: "zf-small", id: "zt-runsum", text: runSummary(RUN, timeText()) }));
    return box;
  }
  document.addEventListener("click", (e) => { if (e.target && e.target.id === "zf-save1") { let n = 0; const t = setInterval(() => { if (eid() || ++n > 30) { clearInterval(t); if (eid()) savedRun(); } }, 100); } });
  // Step 2 saves callMode "auto" for every card: the organizer's answer from Step 1 is sent again right after it, so it is never lost
  document.addEventListener("click", (e) => { if (e.target && e.target.id === "zf-save2") { setTimeout(savedRun, 700); setTimeout(savedRun, 2500); } });
  window.ZTAMBOLA.runSummary = runSummary; window.ZTAMBOLA.RUN = RUN;

  /* ---- steps 2 to 5: Tambola-only wording and hiding, applied to what the shared pack drew (the pack file itself is not edited) ---- */
  const linkProblem = (v) => { const t = String(v || "").trim(); if (!t) return ""; try { const u = new URL(t); return u.protocol === "https:" && u.hostname.includes(".") ? "" : "bad"; } catch { return "bad"; } };
  const LINK_BAD = "The link must start with https:// and be public, so everyone can open it.";
  function patchSteps() {
    const sv1 = document.getElementById("zf-save1");
    if (sv1 && !document.getElementById("zt-run")) sv1.before(runQuestions());
    const s5 = document.getElementById("zf-sec5");
    if (s5 && s5.classList.contains("open") && !document.getElementById("zt-runread")) { const h = s5.querySelector("h3") || s5.querySelector("h2"); (h || s5).after(el("p", { id: "zt-runread", class: "zf-small", text: runSummary(RUN, timeText()) })); }
    const how2 = document.getElementById("zf-how");
    if (how2 && !document.getElementById("zt-idkind")) {
      const g = el("div", { class: "zt-idkind", id: "zt-idkind", role: "radiogroup", "aria-label": "Which ID?" }, el("h3", { text: "Which ID?" }), el("p", { class: "zf-small", text: "The ID your people use to join. The system reads it in one plain form: an employee ID as letters and numbers, an Email ID in lower case." }));
      for (const [v, label] of [["emp", "Employee ID"], ["email", "Email ID"]]) g.append(el("label", { class: "zf-opt" }, el("input", { type: "radio", name: "zt-idkind", value: v, ...(RUN.idKind === v ? { checked: "" } : {}), onchange: () => { RUN.idKind = v; RUN.idTouched = true; savedRun(); } }), " " + label));
      how2.after(g);
    }
    const size = document.getElementById("zf-size");
    if (size && !document.getElementById("zt-closest")) size.after(el("p", { class: "zf-small", id: "zt-closest", text: "Pick the closest. The price is shown with each size." }));
    for (const n of document.querySelectorAll("#zf-how-system, .zf-ab")) { const t = n.closest(".zf-opt") || n; t.remove(); } // list matching and A/B per-ticket prizes: the engine cannot do them yet
    const bn = document.getElementById("zf-n-bumper");
    if (bn && !document.getElementById("zt-bumper")) {
      const cur = Number(bn.value) || 1, box = el("div", { class: "zt-bumper", id: "zt-bumper" });
      const setN = (k) => { bn.value = String(k); bn.dispatchEvent(new window.Event("change")); }; // the pack's own select keeps the count; ticking House k means Houses 1 to k
      const row = (k) => el("label", { class: "zt-check" }, el("input", { type: "checkbox", "data-bumper-n": String(k), ...(k <= cur ? { checked: "" } : {}), onchange: (e) => setN(e.target.checked ? k : k - 1 || 1) }), " Super Bumper House " + k + (k <= 2 ? " (Recommended)" : ""));
      const first = el("div", {}, ...[1, 2, 3, 4, 5].map(row)), more = el("details", { class: "zt-more" }, el("summary", { text: "Show Houses 6 to 10" }), ...[6, 7, 8, 9, 10].map(row));
      if (cur > 5) more.setAttribute("open", "");
      box.append(first, more, el("p", { class: "zf-small", id: "zt-bumper-warn", text: "If fewer players complete both tickets than there are Super Bumper prizes, the rest of the prizes go unwon when the 90 numbers end." }));
      bn.closest("div") && bn.closest("div").append(box);
    }
    const tix2 = document.querySelector('[data-house="bumper"]');
    if (tix2 && !document.getElementById("zt-needs2")) tix2.before(el("p", { class: "zf-small", id: "zt-needs2", text: "Super Bumper needs 2 tickets. Everyone gets Ticket A and Ticket B." }));
    const s3 = document.getElementById("zf-sec3");
    if (s3 && s3.classList.contains("open") && !document.querySelector('[data-house="bumper"]') && !document.getElementById("zt-lucky1") && document.querySelector('[data-house="lucky"]')) {
      const lk = document.querySelector('[data-house="lucky"]'); lk.before(el("p", { class: "zf-small", id: "zt-lucky1", text: "Want every player to have a chance to win? Choose LUCKY DRAW. It is the prize everyone can win, even if nobody completes a house." }));
    }
    for (const sel of document.querySelectorAll('select[id^="zf-g-"]')) if (![...sel.options].some((o) => o.value === "Decide later") && [...sel.options].some((o) => /^other/i.test(o.value))) { const ot = [...sel.options].find((o) => /^other/i.test(o.value)); ot.textContent = "Other (write it)"; }
    const bl = [...document.querySelectorAll('input[id^="zf-bl"]')];
    for (const i of bl) { if (!i.nextElementSibling || i.nextElementSibling.className.indexOf("zt-check") < 0) { const c = el("p", { class: "zf-small zt-check", role: "status" }); i.after(c); setCheck(i, c); } }
    if (!bl.length && document.querySelector(".zf-break") === null) { /* no break on the page */ }
    const lead = [...document.querySelectorAll("#zf-sec4 .zf-lead")].pop();
    if (lead && !document.getElementById("zt-missing")) lead.after(el("p", { class: "zf-small", id: "zt-missing", text: "If a link is missing or not available, that message will not play." }));
    const fr = document.getElementById("zf-frame");
    if (fr) {
      const pl = fr.querySelector(".zf-pvlast");
      if (pl && !document.getElementById("zt-pvlast5")) pl.after(el("p", { id: "zt-pvlast5", class: "zf-small", text: "Last 5: 47, 12, 83, 5, 61" }));
      if (Z.who && Z.who.card === "family" && !document.getElementById("zt-pass")) fr.append(el("div", { class: "zt-pass", id: "zt-pass" }, el("b", { text: "Family Passes" }), el("p", { class: "zf-small", text: "You have 5 passes: 1 for you and 4 for your family and friends. They play on the phone or laptop they click the link from." })));
    }
  }
  function setCheck(input, c) { const bad = linkProblem(input.value); c.textContent = !input.value.trim() ? "" : bad ? LINK_BAD : "Looks good"; c.className = "zf-small zt-check " + (!input.value.trim() ? "" : bad ? "bad" : "ok"); }
  document.addEventListener("input", (e) => { const i = e.target; if (i && i.id && /^zf-bl\d+$/.test(i.id) && i.nextElementSibling) setCheck(i, i.nextElementSibling); });
  window.ZTAMBOLA.linkProblem = linkProblem;

  /* ---- injection: the pack redraws the whole page, so the sections are added after each draw ---- */
  function paint() {
    const app = document.getElementById("app"); if (!app) return;
    if (T.kind === "cohost") { if (!document.getElementById("zt-cohostscreen")) { const top = app.querySelector(".zf-top"); app.replaceChildren(...[top, whoLabel(), coHostScreen()].filter(Boolean)); } return; }
    patchSteps();
    if (st.role && !document.getElementById("zt-who")) app.prepend(whoLabel());
    if ((st.role === "cohost" || st.view === "cohost") && T.mine === undefined) { T.mine = null; load(); }
    const d = document.getElementById("zf-dashboard");
    if (d && (st.role === "cohost" || st.view === "cohost")) { if (!document.getElementById("zt-cohostscreen")) { d.replaceChildren(coHostScreen()); } return; }
    if (d && !document.getElementById("zt-cohosts") && !document.getElementById("zt-delete")) {
      // the shared pack now draws the ready check, rehearsals, claims, prizes, feed and the roll button (descriptor flags); only Corporate Tambola's own parts are added here
      const ex = [coHostsBlock(), deleteBlock()].filter(Boolean), at = document.getElementById("zf-waitsec");
      if (at) at.after(...ex); else d.append(...ex);
    }
    const wt = document.getElementById("zf-waitsec");
    if (wt && window.ZROLES && !document.getElementById("zt-approves")) { const h = wt.querySelector("h3"); if (h) h.after(el("p", { class: "zf-small", id: "zt-approves", text: window.ZROLES.approvalText(st.role || "organizer") })); }
    const ball = document.getElementById("zf-ball"), cl = dash.called || [];
    if (ball && !document.getElementById("zt-last5") && cl.length) ball.after(el("p", { class: "zf-small", id: "zt-last5", text: "Last 5: " + cl.slice(-5).reverse().join(", ") }));
    for (const n of document.querySelectorAll("#app .zf-soon, #zf-resume[disabled], #zf-copygame[disabled]")) n.remove(); // hidden until the engine supports them
  }
  let busy = false;
  new MutationObserver(() => { if (busy) return; busy = true; try { paint(); } finally { busy = false; } }).observe(document.getElementById("app"), { childList: true });
  setInterval(load, 8000);
  coHostEntry(); load(); paint();
})();
