/* Corporate Tambola only: the parts of the new organizer / Host / Co-host console (?flow=new) that other games do not have.
   Loaded AFTER pack/zc-flow.js. It never edits the shared pack: it adds sections to the pack's dashboard and step 3 when they are drawn.
   Wired to the real engine where the engine has support (rehearsals 1.6.0, prizes, prize handed over, presence, game log, claims, erase).
   Marked DEMO STUB (Phase B, see handover 194): Lucky Draw 1-3 timing, the 5 s server lock, claim auto-pause, the 24 h delete lock. */
(() => {
  if (typeof window === "undefined" || !window.ZFLOW) return;
  const Z = window.ZFLOW, el = Z.el, st = Z.state, dash = Z.dash;
  const STUB_NOTE = "Demo: shown here only. The engine support comes in Phase B.";

  /* ---- pure rules (tested) ---- */
  /** Lucky draws in the order they are drawn: lowest value first, highest last; equal or blank values keep the entered order. */
  const luckyOrder = (draws) => draws.map((d, i) => ({ ...d, i, v: Number(d.value) || 0 })).sort((a, b) => a.v - b.v || a.i - b.i).map((d, k) => ({ ...d, label: "Lucky Draw " + (k + 1) }));
  /** After how many numbers each lucky draw happens: 1 = end; 2 = middle + end; 3 = one third, two thirds, end. */
  const luckyAt = (count, total) => { const t = total || 90, n = Math.max(1, Math.min(3, count | 0)); return n === 1 ? [t] : n === 2 ? [Math.round(t / 2), t] : [Math.round(t / 3), Math.round((2 * t) / 3), t]; };
  /** The manual roll button: green when ready; grey for 5 seconds after a press; grey while a claim is open. */
  const rollState = (lastMs, now, claimOpen) => {
    if (claimOpen) return { ready: false, secs: 0, label: "Claim in progress" };
    const left = Math.max(0, Math.ceil((lastMs + 5000 - now) / 1000));
    return left > 0 && lastMs ? { ready: false, secs: left, label: "Wait " + left + " seconds" } : { ready: true, secs: 0, label: "Press to Roll Out the Next Number" };
  };
  /** The three claim messages, then what the board says when the claim is settled. */
  const claimText = (c, mode) => c.phase === "check" ? "Ticket " + c.ticket + " has claimed " + c.prize + ". The system is checking..."
    : c.phase === "ok" ? "Congratulations! The claim is correct." : c.phase === "gone" ? c.prize + " is gone. It has been won by Ticket " + c.ticket + "." + (mode === "manual" ? " Press the button to roll out the next number." : "") : "";
  /** AUTO mode pauses during an open claim and resumes by itself when it is settled. */
  const autoPaused = (mode, claim, manualPause) => !!manualPause || (mode === "auto" && !!claim && claim.phase === "check");
  /** The top-right label: who is signed in, and the organizer on a second line. */
  const whoLines = (role, email, org) => role === "host" ? ["Host: " + email, "Organizer: " + org] : role === "cohost" ? ["Co-host: " + email, "Organizer: " + org] : ["Organizer: " + org];
  /** "Delete all participant data" turns green 24 hours after the game ended. */
  const deleteReady = (endMs, now) => !!endMs && now - endMs >= 24 * 3600000;
  /** Ready check: link shared, payment, prizes chosen are needed; Hosts added and rehearsal done are optional. */
  const readyItems = (f) => [["Game link shared", !!f.shared, true], ["Payment", !!f.paid, true], ["Prizes chosen", !!f.prizes, true], ["Hosts added", !!f.hosts, false], ["Rehearsal done", !!f.rehearsed, false]];
  window.ZTAMBOLA = { luckyOrder, luckyAt, rollState, claimText, autoPaused, whoLines, deleteReady, readyItems };

  /* ---- live state for the added sections ---- */
  const T = { mode: "auto", paused: false, lastRoll: 0, claim: null, prizes: [], reh: null, presence: null, glog: null, tick: 12, lucky: [{ value: "", prize: "" }], endMs: 0, shared: false };
  const call = (m, p, b) => Z.call(m, p, b);
  const eid = () => st.eid;
  async function load() {
    if (!eid()) return;
    try { T.reh = await call("GET", `/api/z/${eid()}/rehearsals`); } catch { /* the cards stay */ }
    try { T.prizes = (await call("GET", `/api/z/${eid()}/prizes`)).prizes || []; } catch { /* the list stays */ }
    try { T.presence = await call("GET", `/api/z/${eid()}/presence`); } catch { T.presence = null; }
    try { T.glog = await call("GET", `/api/z/${eid()}/gamelog`); } catch { T.glog = null; }
    const open = (dash.claims || []).filter((c) => c && (c.state === "checking" || c.status === "checking")).pop();
    T.claim = open ? { phase: "check", ticket: open.seat || open.ticket, prize: open.prize || open.name || "a prize" } : T.claim && T.claim.phase !== "check" ? T.claim : null;
    paint();
  }

  /* ---- sections ---- */
  const h3 = (t) => el("h3", { text: t });
  const small = (t, a) => el("p", { class: "zf-small", ...(a || {}), text: t });
  function whoLabel() {
    const org = (st.raw && st.raw.organizerEmail) || "organizer@acme.com", me = st.team && st.team.email ? st.team.email.trim() : org;
    return el("div", { class: "zt-who", id: "zt-who" }, whoLines(st.role || "organizer", me, org).map((l) => el("div", { text: l })));
  }
  function readyCheck() {
    const info = st.info || {}, f = { shared: T.shared, paid: !!info.paid, prizes: true, hosts: false, rehearsed: !!(T.reh && T.reh.cards && T.reh.cards.some((c) => c.state === "done")) };
    const ul = el("ul", { class: "zf-list", id: "zt-ready" });
    for (const [label, ok, need] of readyItems(f)) ul.append(el("li", { "data-ok": ok ? "1" : "0", text: (ok ? "✓ " : "○ ") + label + (need ? "" : " (optional)") }));
    return el("section", { class: "zf-ready", id: "zt-readysec" }, h3("Ready check"), ul);
  }
  function rehearsals() {
    const paid = !!(st.info && st.info.paid), cards = T.reh && T.reh.cards ? T.reh.cards : [1, 2, 3].map((n) => ({ n, state: "locked" }));
    const box = el("section", { class: "zf-reh", id: "zt-reh" }, h3("Rehearsals"));
    if (!paid) box.append(small("Payment is pending. Your rehearsals open as soon as the payment is done.", { id: "zt-rehnote" }));
    for (const c of cards) {
      const locked = !paid || c.state === "locked", card = el("div", { class: "zt-card" + (locked ? " zt-grey" : ""), id: "zt-reh" + c.n }, el("b", { text: "REHEARSAL GAME " + c.n }), " ", el("span", { class: "zf-small", text: "Game ID " + eid() + "-R" + c.n }));
      if (locked) card.append(small(paid ? "Opens after the earlier rehearsal is closed." : "Opens after you publish and pay."));
      else if (c.state === "ready") card.append(el("button", { type: "button", class: "zf-go", "data-reh": "start", "data-n": String(c.n), onclick: async () => { try { const r = await call("POST", `/api/z/${eid()}/rehearsal`, { people: "published" }); if (r && r.openUrl) location.href = r.openUrl; } catch (e) { dash.note = e.message; } load(); } }, "Start this rehearsal"));
      else if (c.state === "running") card.append(el("a", { class: "zf-go", href: "/zc.html?flow=new&e=" + encodeURIComponent(c.id || "") }, "Open it"), " ", el("button", { type: "button", class: "zf-add", "data-reh": "close", onclick: async () => { try { await call("POST", `/api/z/${c.id}/rehearsalclose`, {}); } catch { /* shown on reload */ } load(); } }, "Close rehearsal"));
      else card.append(small("Done"));
      box.append(card);
    }
    return box;
  }
  function claimBanner() {
    if (!T.claim) return null;
    return el("div", { class: "zf-banner " + (T.claim.phase === "gone" ? "green" : "amber"), id: "zt-claim", role: "status" }, claimText(T.claim, T.mode));
  }
  let tmr = 0;
  function controls(co) {
    const now = Date.now(), claimOpen = !!(T.claim && T.claim.phase === "check"), paused = autoPaused(T.mode, T.claim, T.paused);
    const box = el("section", { class: "zt-ctl", id: "zt-ctl" });
    box.append(el("p", { class: "zf-small", id: "zt-mode", text: T.mode === "auto" ? "Automatic: a new number every 12 seconds" + (paused ? " (paused)" : " (next in " + T.tick + ")") : "Manual: you press the button" }));
    if (co) { box.append(small("You can watch the board. Only the organizer and Hosts can use the buttons.")); return box; }
    box.append(el("p", { class: "zf-small", text: STUB_NOTE }));
    if (T.mode === "manual") {
      const r = rollState(T.lastRoll, now, claimOpen);
      box.append(el("button", { type: "button", class: "zf-go zt-roll " + (r.ready ? "green" : "grey"), id: "zt-roll", ...(r.ready ? {} : { disabled: "" }), onclick: () => { T.lastRoll = Date.now(); const c = dash.called || (dash.called = []); let n; do n = 1 + Math.floor(Math.random() * 90); while (c.includes(n) && c.length < 90); c.push(n); Z.draw(); } }, r.ready ? r.label : r.label));
      if (T.claim && T.claim.phase === "gone") box.append(small("Press the button to roll out the next number."));
    }
    box.append(" ", el("button", { type: "button", class: "zf-add", id: "zt-pause", onclick: () => { T.paused = !T.paused; Z.draw(); } }, T.paused ? "Resume" : "Pause game"), " ",
      el("button", { type: "button", class: "zf-add", id: "zt-modeswitch", onclick: () => { T.mode = T.mode === "auto" ? "manual" : "auto"; Z.draw(); } }, T.mode === "auto" ? "Switch to manual" : "Switch to automatic"));
    return box;
  }
  function prizesBlock(co) {
    const P = T.prizes, won = P.length, box = el("section", { class: "zt-prizes", id: "zt-prizes" }, h3("Prizes: " + won + " won"));
    if (!won) box.append(small("No prize is won yet."));
    P.forEach((p, i) => {
      const li = el("div", { class: "zt-won", "data-i": String(i) }, el("b", { text: "Ticket " + (p.seat || "?") }), " won ", p.name ? "" : "", String(p.pattern || p.prize || "a prize"));
      if (!co) li.append(" ", el("label", {}, el("input", { type: "checkbox", ...(p.given ? { checked: "" } : {}), onchange: async (e) => { try { await call("POST", `/api/z/${eid()}/prizegiven`, { round: p.round, pattern: p.pattern, ordinal: p.ordinal, seat: p.seat, given: e.target.checked }); } catch (er) { dash.note = er.message; } load(); } }), " Prize handed over"));
      const det = [["Name", p.name], ["Employee ID", p.employeeId], ["Email ID", p.email], ["Mobile", p.phone], ["Referred by", p.referredBy]].filter((x) => x[1]);
      if (det.length) li.append(el("div", { class: "zf-small zt-det", text: det.map((x) => x[0] + ": " + x[1]).join(" · ") }));
      box.append(li);
    });
    return box;
  }
  function feedBlock() {
    const box = el("section", { class: "zt-feed", id: "zt-feed" }, h3("What is happening"));
    const pr = T.presence; box.append(el("p", { id: "zt-online", text: "Online now: " + (pr && pr.present != null ? pr.present : "–") }));
    const rows = T.glog && (T.glog.log || T.glog.rows || T.glog.events) || [], ul = el("ul", { class: "zf-list", id: "zt-feedlist" });
    if (!rows.length) box.append(small("Nothing yet."));
    for (const r of rows.slice(-20).reverse()) ul.append(el("li", { text: typeof r === "string" ? r : r.text || r.what || JSON.stringify(r) }));
    box.append(ul); return box;
  }
  function deleteBlock() {
    const ready = deleteReady(T.endMs, Date.now()), done = !!(st.raw && st.raw.completed) || st.demoStatus === "completed";
    if (!done) return null;
    return el("p", {}, el("button", { type: "button", class: "zf-add zt-del " + (ready ? "green" : "grey"), id: "zt-delete", ...(ready ? {} : { disabled: "" }), onclick: async () => { try { await call("POST", `/api/z/${eid()}/erase`, {}); dash.note = "Participant data deleted."; } catch (e) { dash.note = e.message; } Z.draw(); } }, "Delete all participant data"), " ", ready ? "" : el("span", { class: "zf-small", text: "This unlocks 24 hours after the game." }));
  }
  /* ---- Lucky Draw 1-3 and Unlucky in step 3 (DEMO STUB) ---- */
  function luckyBlock() {
    const box = el("section", { class: "zt-lucky", id: "zt-lucky" }, h3("LUCKY DRAW (Recommended)"), small("Choose 1, 2 or 3 lucky draws. The lowest value is drawn first and the highest last. The organizer, Hosts and Co-hosts are never drawn."), small(STUB_NOTE));
    const row = el("p", { class: "zf-btnrow", role: "group", "aria-label": "How many lucky draws" });
    for (const n of [1, 2, 3]) row.append(el("button", { type: "button", class: "zf-add" + (T.lucky.length === n ? " on" : ""), "data-lucky": String(n), "aria-pressed": String(T.lucky.length === n), onclick: () => { while (T.lucky.length < n) T.lucky.push({ value: "", prize: "" }); T.lucky.length = n; Z.draw(); } }, n === 1 ? "1 draw" : n + " draws"), " ");
    box.append(row);
    const ord = luckyOrder(T.lucky), at = luckyAt(T.lucky.length);
    ord.forEach((d, k) => box.append(el("p", {}, el("b", { text: d.label }), " " , el("input", { type: "text", "aria-label": d.label + " prize", placeholder: "Prize", value: d.prize || "", oninput: (e) => { T.lucky[d.i].prize = e.target.value; } }), " ₹ ", el("input", { type: "number", min: "0", "aria-label": d.label + " worth up to", value: d.value || "", onchange: (e) => { T.lucky[d.i].value = e.target.value; Z.draw(); } }), el("span", { class: "zf-small", text: "  after number " + at[k] }))));
    box.append(h3("UNLUCKY (Recommended)"), small("One participant who is not lucky gets a small gift. The organizer, Hosts and Co-hosts are never drawn."));
    return box;
  }

  /* ---- injection: the pack redraws the whole page, so the sections are added after each draw ---- */
  function paint() {
    const app = document.getElementById("app"); if (!app) return;
    if (st.role && !document.getElementById("zt-who")) app.prepend(whoLabel());
    const d = document.getElementById("zf-dashboard");
    if (d && !document.getElementById("zt-ready") && !document.getElementById("zt-readysec")) {
      const co = !!(st.view === "cohost" || st.role === "cohost"), pay = document.getElementById("zf-pay"), banner = document.getElementById("zf-banner"), wait = document.getElementById("zf-waitsec");
      if (!co) { const at = banner ? banner.nextSibling : d.children[1]; d.insertBefore(readyCheck(), at); }
      if (!co && pay) pay.after(rehearsals());
      const cb = claimBanner(); const anchor = document.getElementById("zf-retro") || document.getElementById("zf-dashnote");
      const extra = [cb, controls(co), prizesBlock(co), feedBlock(), deleteBlock()].filter(Boolean);
      if (anchor) { const r = document.getElementById("zf-retro"); (r ? r : anchor).before(...(r ? [cb].filter(Boolean) : extra)); if (r) r.after(...[controls(co), prizesBlock(co), feedBlock(), deleteBlock()].filter(Boolean)); } else d.append(...extra);
    }
    const s3 = document.getElementById("zf-sec3");
    if (s3 && s3.classList.contains("open") && !document.getElementById("zt-lucky")) { const b = s3.querySelector(".zf-body") || s3; b.append(luckyBlock()); }
  }
  let busy = false;
  new MutationObserver(() => { if (busy) return; busy = true; try { paint(); } finally { busy = false; } }).observe(document.getElementById("app"), { childList: true });
  setInterval(() => { if (document.getElementById("zf-dashboard")) { T.tick = T.tick > 1 ? T.tick - 1 : 12; if (T.mode === "manual" && T.lastRoll) Z.draw(); } }, 1000);
  setInterval(load, 8000);
  load(); paint();
})();
