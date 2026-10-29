/* Corporate Tambola only: the parts of the new organizer / Host / Co-host console (?flow=new) that other games do not have.
   Loaded AFTER pack/zc-flow.js. It never edits the shared pack: it adds sections to the pack's dashboard and step 3 when they are drawn.
   Wired to the real engine where the engine has support (rehearsals 1.6.0, prizes, prize handed over, presence, game log, claims, erase).
   Owner rule D (29 Oct): UI layer only. Whatever the existing engine does not support is HIDDEN (no coming soon, no demo stub, no disabled look-alike). */
(() => {
  if (typeof window === "undefined" || !window.ZFLOW) return;
  const Z = window.ZFLOW, el = Z.el, st = Z.state, dash = Z.dash;

  /** The three claim messages, then what the board says when the claim is settled. */
  const claimText = (c, mode) => c.phase === "check" ? "Ticket " + c.ticket + " has claimed " + c.prize + ". The system is checking..."
    : c.phase === "ok" ? "Congratulations! The claim is correct." : c.phase === "gone" ? c.prize + " is gone. It has been won by Ticket " + c.ticket + "." + (mode === "manual" ? " Press the button to roll out the next number." : "") : "";
  /** The top-right label: who is signed in, and the organizer on a second line. */
  const whoLines = (role, email, org, by) => role === "host" ? ["Host: " + email, "Organizer: " + org] : role === "cohost" ? ["Co-host: " + email, "You were made Co-host by: " + (by || org), "Organizer: " + org] : ["Organizer: " + org];
  /** Ready check: link shared, payment, prizes chosen are needed; Hosts added and rehearsal done are optional. */
  const readyItems = (f) => [["Game link shared", !!f.shared, true], ["Payment", !!f.paid, true], ["Prizes chosen", !!f.prizes, true], ["Hosts added", !!f.hosts, false], ["Rehearsal done", !!f.rehearsed, false]];
  window.ZTAMBOLA = { claimText, whoLines, readyItems };

  /* ---- live state for the added sections ---- */
  const T = { mode: "auto", paused: false, lastRoll: 0, claim: null, prizes: [], reh: null, presence: null, glog: null, tick: 12, shared: false };
  const call = (m, p, b) => Z.call(m, p, b);
  const eid = () => st.eid;
  async function load() {
    if (!eid()) return;
    try { T.reh = await call("GET", `/api/z/${eid()}/rehearsals`); } catch { /* the cards stay */ }
    try { T.prizes = (await call("GET", `/api/z/${eid()}/prizes`)).prizes || []; } catch { /* the list stays */ }
    try { T.presence = await call("GET", `/api/z/${eid()}/presence`); } catch { T.presence = null; }
    try { T.glog = await call("GET", `/api/z/${eid()}/gamelog`); } catch { T.glog = null; }
    const open = (dash.claims || []).filter((c) => c && (c.state === "checking" || c.status === "checking")).pop();
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
    const org = (st.raw && st.raw.organizerEmail) || "your email", me = st.team && st.team.email ? st.team.email.trim() : org;
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
  /** Play the game: the organizer and Hosts get a ticket like anyone (the engine's own people/me). */
  function playBlock() {
    const note = el("span", { class: "zf-small", id: "zt-playnote", role: "status" });
    return el("p", { class: "zt-play", id: "zt-play" }, el("button", { type: "button", class: "zf-go", id: "zt-playnow", onclick: async () => {
      let w = null; try { w = window.open("", "_blank"); if (w) w.opener = null; } catch { /* pop-up blocked */ }
      try { const r = await call("POST", `/api/z/${eid()}/people/me`, {}), link = (r.person && r.person.link) || r.link; if (!link) throw new Error("Your ticket is not ready yet. Please try again in a moment."); if (w) w.location.href = link; else window.open(link, "_blank", "noopener"); }
      catch (e) { if (w) { try { w.close(); } catch { /* fine */ } } note.textContent = e.message; }
    } }, "Play the game"), " ", note);
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
      el("h2", { text: "People you invited, waiting for you" }));
    const rows = dash.waiting || [];
    if (!rows.length) box.append(small("Nobody is waiting right now.", { id: "zt-nowait" }));
    for (const w of rows) box.append(el("p", { "data-wid": String(w.id) }, "Ticket " + (w.ticket || w.seat || w.id) + " ", el("button", { type: "button", class: "zf-go", onclick: async () => { try { await call("POST", `/api/z/${eid()}/waiting/${encodeURIComponent(w.id)}`, { decision: "admit" }); } catch (e) { dash.note = e.message; } Z.draw(); } }, "Let in"), " ", el("button", { type: "button", class: "zf-add", onclick: async () => { try { await call("POST", `/api/z/${eid()}/waiting/${encodeURIComponent(w.id)}`, { decision: "later" }); } catch (e) { dash.note = e.message; } Z.draw(); } }, "Not now")));
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
    const done = !!(st.raw && st.raw.completed) || st.demoStatus === "completed";
    if (!done) return null;
    return el("p", {}, el("button", { type: "button", class: "zf-add zt-del green", id: "zt-delete", onclick: async () => { try { await call("POST", `/api/z/${eid()}/erase`, {}); dash.note = "Participant data deleted."; } catch (e) { dash.note = e.message; } Z.draw(); } }, "Delete all participant data"));
  }
  /* ---- injection: the pack redraws the whole page, so the sections are added after each draw ---- */
  function paint() {
    const app = document.getElementById("app"); if (!app) return;
    if (st.role && !document.getElementById("zt-who")) app.prepend(whoLabel());
    if ((st.role === "cohost" || st.view === "cohost") && T.mine === undefined) { T.mine = null; load(); }
    const d = document.getElementById("zf-dashboard");
    if (d && (st.role === "cohost" || st.view === "cohost")) { if (!document.getElementById("zt-cohostscreen")) { d.replaceChildren(coHostScreen()); } return; }
    if (d && !document.getElementById("zt-ready") && !document.getElementById("zt-readysec")) {
      const co = !!(st.view === "cohost" || st.role === "cohost"), pay = document.getElementById("zf-pay"), banner = document.getElementById("zf-banner"), wait = document.getElementById("zf-waitsec");
      if (!co) { const at = banner ? banner.nextSibling : d.children[1]; d.insertBefore(readyCheck(), at); }
      if (!co && pay) pay.after(rehearsals());
      const cb = claimBanner(); const anchor = document.getElementById("zf-retro") || document.getElementById("zf-dashnote");
      const extra = [cb, co ? coHostLimitLine() : coHostsBlock(), co ? null : playBlock(), prizesBlock(co), feedBlock(), deleteBlock()].filter(Boolean);
      if (anchor) { const r = document.getElementById("zf-retro"); (r ? r : anchor).before(...(r ? [cb].filter(Boolean) : extra)); if (r) r.after(...[co ? coHostLimitLine() : coHostsBlock(), co ? null : playBlock(), prizesBlock(co), feedBlock(), deleteBlock()].filter(Boolean)); } else d.append(...extra);
    }
    const ball = document.getElementById("zf-ball"), cl = dash.called || [];
    if (ball && !document.getElementById("zt-last5") && cl.length) ball.after(el("p", { class: "zf-small", id: "zt-last5", text: "Last 5: " + cl.slice(-5).reverse().join(", ") }));
    for (const n of document.querySelectorAll("#app .zf-soon, #zf-resume[disabled], #zf-copygame[disabled]")) n.remove(); // hidden until the engine supports them
  }
  let busy = false;
  new MutationObserver(() => { if (busy) return; busy = true; try { paint(); } finally { busy = false; } }).observe(document.getElementById("app"), { childList: true });
  setInterval(load, 8000);
  load(); paint();
})();
