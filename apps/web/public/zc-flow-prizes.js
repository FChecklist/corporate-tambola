/* Corporate Tambola only (?flow=new): Step 3 "Prizes for your team" (note 370, frozen 30 Oct 2026) and the host's prize sheet at the end of the game.
   Loaded after pack/zc-flow.js, zc-flow-tambola.js and prize-planner.js. It replaces the pack's Step 3 renderer (the shared pack file is not edited); a game made before the prize planner
   (the server answers "prizes-old-game") keeps the pack's own Step 3. Players never see amounts or gift names: they are stored in the organizer-only prize plan; the reward lines
   keep their text empty so players see prize NAMES only. */
(() => {
  if (typeof window === "undefined" || !window.ZFLOW || !window.ZPRIZE) return;
  const Z = window.ZFLOW, P = window.ZPRIZE, el = Z.el, st = Z.state;
  const ORIG3 = Z.registry[3];
  const CUR = [["INR", "₹"], ["USD", "$"], ["EUR", "€"], ["GBP", "£"], ["AED", "AED"], ["SGD", "S$"], ["AUD", "A$"]];
  const sym = (c) => (CUR.find((x) => x[0] === c) || CUR[0])[1];
  const S = { tickets: 1, mode: "auto", count: 0, currency: "INR", budget: "", gifts: {}, manual: [], old: false, note: "" };
  const FOOT = "A note on prizes. The amounts shown here are only a guide. Please change them, or the prizes themselves, in whatever way suits you best. Whether a prize is cash, a voucher or a gift is entirely your choice, and you give it in your own way and time. Corporate Tambola only helps you plan and keep a record. We have no part in the prizes themselves.";
  const BLANK = "Enter your budget, or choose Manual to set your prizes yourself.";
  window.ZPRIZES_UI = { FOOT, BLANK };

  /** Every prize a Manual list can hold for this ticket count, as {id, label}. */
  const catalogue = (tickets) => {
    const out = [], add = (ticket, pattern, n, of) => { for (let o = 1; o <= n; o++) out.push({ id: ticket + ":" + pattern + ":" + o, label: P.label(pattern, o, of, ticket) }); };
    const per = (ticket) => { add(ticket, "top", 1, 1); add(ticket, "mid", 1, 1); add(ticket, "bot", 1, 1); add(ticket, "corners", 1, 1); add(ticket, "full", 4, 4); };
    if (tickets === 1) { per(0); add(0, "early5", 2, 2); } else { per(1); add(1, "early5", 2, 2); per(2); add(0, "full2", 4, 4); }
    return out;
  };
  const labelOf = (id, tickets) => (catalogue(tickets).find((c) => c.id === id) || { label: id }).label;
  const num = (v) => Math.floor(Number(String(v).replace(/[^\d.]/g, "")) || 0);
  const planNow = () => P.plan(S.tickets, S.count || P.DEFAULT_COUNT[S.tickets], num(S.budget));
  const rowsNow = () => (S.mode === "auto" ? planNow().prizes.map((p) => ({ id: p.id, label: p.label, amount: p.amount, gift: S.gifts[p.id] || "" })) : S.manual.map((r) => ({ id: r.id, label: labelOf(r.id, S.tickets), amount: num(r.amount), gift: r.gift || "" })));

  /** The reward lines the engine reads: one per prize, per-ticket scope for a two-ticket game, text empty so players see names only. */
  const rewardsOf = (rows, tickets) => rows.map((r) => {
    const [t, pattern, o] = r.id.split(":"), ordinal = Number(o), ticket = Number(t);
    if (pattern === "full2") return { pattern: "full", scope: "two_ticket", ordinal, text: "" };
    return { pattern, scope: tickets === 2 && ticket ? (ticket === 2 ? "ticket_2" : "ticket_1") : "ticket", ordinal, text: "" };
  });
  /** Orders the engine needs: the 2nd of a prize needs the 1st in the same group. */
  const orderProblem = (rows) => {
    const have = new Set(rows.map((r) => r.id));
    for (const r of rows) { const [t, p, o] = r.id.split(":"); if (Number(o) > 1 && !have.has(t + ":" + p + ":" + (Number(o) - 1))) return "Add the " + P.label(p, Number(o) - 1, 2, Number(t)) + " before the " + P.label(p, Number(o), 2, Number(t)) + "."; }
    return "";
  };
  const save = async (ctx, msg) => {
    const rows = rowsNow(), c = S.currency;
    if (S.mode === "auto" && !(num(S.budget) > 0)) { msg.textContent = BLANK; return; }
    if (S.mode === "manual") { const bad = P.validateManual(rows.map((r) => ({ id: r.id, amount: r.amount, gift: r.gift }))).concat(orderProblem(rows)); if (bad.length) { msg.textContent = bad[0]; return; } }
    if (!st.eid) { msg.textContent = "Please save step 1 first."; return; }
    msg.textContent = "Saving…";
    const budget = S.mode === "auto" ? num(S.budget) : rows.reduce((s, r) => s + r.amount, 0);
    try {
      await Z.call("PATCH", `/api/z/${st.eid}/settings`, { tickets: S.tickets, rewards: rewardsOf(rows, S.tickets), prizePlan: { mode: S.mode, currency: c, budget, count: rows.length, prizes: rows.map((r) => ({ id: r.id, amount: r.amount, ...(r.gift ? { gift: r.gift } : {}) })) } });
      Z.prizes.tix = S.tickets; // the Step 5 preview and read-back show the right tickets and prize names
      { const sel = Z.prizes.sel || (Z.prizes.sel = {}), count = {}; let sb = 0;
        for (const r of rows) { const [, pattern, o] = r.id.split(":"); if (pattern === "full2") sb = Math.max(sb, Number(o)); else count[pattern] = Math.max(count[pattern] || 0, Number(o)); }
        for (const h of Object.keys(sel)) sel[h].on = false;
        for (const [h, n] of Object.entries(count)) { sel[h] = sel[h] || { on: false, n: 1, gift: "", other: "", worth: "" }; sel[h].on = true; sel[h].n = n; }
        if (Z.prizes.bumper) { Z.prizes.bumper.on = sb > 0; if (sb > 0) Z.prizes.bumper.n = sb; } }
      ctx.done(3);
    } catch (e) {
      if (e && (e.code === "prizes-old-game" || /made before the new prize planner/.test(String(e.message)))) { S.old = true; ctx.redraw(); return; }
      msg.textContent = e && e.message ? e.message : "The prizes could not be saved.";
    }
  };

  Z.registry[3] = (box, ctx) => {
    if (S.old && ORIG3) return ORIG3(box, ctx);
    if (!S.count) S.count = P.DEFAULT_COUNT[S.tickets];
    const msg = el("p", { class: "zf-msg", role: "status", id: "zp-msg", text: S.note });
    box.append(el("h2", { class: "zp-h", text: "Prizes for your team" }));
    // how many tickets each participant holds
    const tx = el("div", { class: "zf-chips", role: "radiogroup", "aria-label": "Tickets per participant" });
    for (const n of [1, 2]) tx.append(el("button", { type: "button", role: "radio", class: "zf-chip" + (S.tickets === n ? " on" : ""), "aria-checked": String(S.tickets === n), "data-tix": String(n), onclick: () => { S.tickets = n; S.count = P.DEFAULT_COUNT[n]; S.manual = []; ctx.redraw(); } }, n + (n === 1 ? " ticket" : " tickets") + " for each participant"));
    box.append(tx);
    // the two cards
    const cards = el("div", { class: "zf-cards", role: "radiogroup", "aria-label": "How to plan the prizes" });
    const card = (id, title, tags, line) => el("button", { type: "button", role: "radio", class: "zf-card" + (S.mode === id ? " on" : ""), "aria-checked": String(S.mode === id), "data-pmode": id,
      onclick: () => { if (S.mode === id) return; if (id === "manual") { S.manual = rowsNow().map((r) => ({ id: r.id, amount: r.amount, gift: r.gift })); S.mode = "manual"; } else { if (S.manual.length && !window.confirm("Your own prize list will be replaced by a plan made from your budget. Continue?")) return; S.mode = "auto"; } ctx.redraw(); } }, el("b", { text: title }), tags ? el("small", { text: " " + tags }) : null, el("span", { text: line }));
    cards.append(card("auto", "Auto: plan the prizes from budget", "(Popular) (Recommended)", "The software splits your budget across the prizes for you."), card("manual", "Manual: I'll set each prize myself", "", "You choose each prize and its amount."));
    box.append(cards);
    const cs = el("select", { id: "zp-cur", "aria-label": "Currency", onchange: (e) => { S.currency = e.target.value; ctx.redraw(); } }, CUR.map((c) => el("option", { value: c[0], ...(S.currency === c[0] ? { selected: "" } : {}) }, c[1] + " " + c[0])));
    if (S.mode === "auto") {
      box.append(el("label", { for: "zp-budget", text: "My total budget for this game's prizes is" }), cs, " ", el("input", { type: "text", inputmode: "numeric", id: "zp-budget", value: S.budget, "aria-required": "true", oninput: (e) => { S.budget = e.target.value; } , onchange: () => ctx.redraw() }));
      box.append(el("p", { class: "zf-small", text: "The software will split your budget across the prizes below. You give each prize as cash, a gift or a voucher, whichever you prefer." }));
      const chips = el("div", { class: "zf-chips", role: "radiogroup", "aria-label": "How many prizes" });
      for (const n of P.COUNTS[S.tickets]) chips.append(el("button", { type: "button", role: "radio", class: "zf-chip" + (S.count === n ? " on" : ""), "aria-checked": String(S.count === n), "data-count": String(n), onclick: () => { S.count = n; ctx.redraw(); } }, n + " prizes"));
      box.append(el("p", { class: "zf-small", text: "How many prizes?" }), chips);
    } else box.append(el("label", { for: "zp-cur", text: "Currency" }), cs);
    // the table
    const rows = rowsNow(), table = el("table", { class: "zf-table zp-table", id: "zp-table" }), tb = el("tbody");
    table.append(el("thead", {}, el("tr", {}, ["Prize", "Amount", "Name the gift (optional, only you see this)"].map((h) => el("th", { scope: "col", text: h }))), ), tb);
    rows.forEach((r, i) => {
      const gift = el("input", { type: "text", maxlength: "60", "aria-label": "Gift name for " + r.label, value: r.gift, oninput: (e) => { if (S.mode === "auto") S.gifts[r.id] = e.target.value; else S.manual[i].gift = e.target.value; } });
      let amt;
      if (S.mode === "auto") amt = el("span", { "data-amount": r.id, text: sym(S.currency) + " " + r.amount.toLocaleString("en-IN") });
      else {
        const used = new Set(S.manual.map((m) => m.id)), pick = el("select", { "aria-label": "Prize " + (i + 1), onchange: (e) => { S.manual[i].id = e.target.value; ctx.redraw(); } }, catalogue(S.tickets).filter((c) => c.id === r.id || !used.has(c.id)).map((c) => el("option", { value: c.id, ...(c.id === r.id ? { selected: "" } : {}) }, c.label)));
        amt = el("span", {}, sym(S.currency) + " ", el("input", { type: "text", inputmode: "numeric", class: "zp-amt", "aria-label": "Amount for " + r.label, "aria-required": "true", value: r.amount || "", oninput: (e) => { S.manual[i].amount = e.target.value; } }));
        tb.append(el("tr", { "data-prize": r.id }, el("td", {}, pick), el("td", {}, amt), el("td", {}, gift, " ", el("button", { type: "button", class: "zf-link", "aria-label": "Remove " + r.label, onclick: () => { S.manual.splice(i, 1); ctx.redraw(); } }, "Remove"))));
        return;
      }
      tb.append(el("tr", { "data-prize": r.id }, el("td", { text: r.label }), el("td", {}, amt), el("td", {}, gift)));
    });
    box.append(el("div", { class: "zf-tablewrap" }, table));
    if (S.mode === "manual") box.append(el("button", { type: "button", class: "zf-add", id: "zp-add", onclick: () => { const used = new Set(S.manual.map((m) => m.id)), next = catalogue(S.tickets).find((c) => !used.has(c.id)); if (!next || S.manual.length >= P.MAX_MANUAL) return; S.manual.push({ id: next.id, amount: "", gift: "" }); ctx.redraw(); } }, "Add a prize"));
    if (S.mode === "auto") { const h = P.hint(planNow()); if (h) box.append(el("p", { class: "zf-small zp-hint", id: "zp-hint", text: h })); }
    box.append(msg, el("button", { type: "button", class: "zf-go", id: "zp-save", onclick: () => save(ctx, msg) }, "Save and continue"));
    box.append(el("p", { class: "zf-small zp-foot", id: "zp-foot", text: FOOT }));
  };

  /* ---- the prize sheet for the host, at the end of the game: prize, winner IDs, each winner's share, organizer notes. The only place amounts appear besides this console. ---- */
  const keyOfId = (id) => { const [t, p] = id.split(":"); return Number(t) > 0 ? p + "@" + t : p; };
  async function sheet() {
    if (!st.eid) return null;
    let sum = null, won = [];
    try { sum = await Z.call("GET", `/api/z/${st.eid}/summary`); } catch { /* no plan */ }
    try { won = (await Z.call("GET", `/api/z/${st.eid}/prizes`)).prizes || []; } catch { /* no winners yet */ }
    const plan = sum && sum.prizePlan; if (!plan) return null;
    const c = plan.currency, rows = plan.prizes.map((p) => {
      const [t, pattern, o] = p.id.split(":"), key = (pattern === "full2" ? "full2" : keyOfId(p.id)), w = won.filter((x) => x.pattern === key && Number(x.ordinal) === Number(o));
      const ids = [...new Set(w.map((x) => x.seat))], s = P.shareOut(p.amount, ids.length);
      return { label: P.label(pattern, Number(o), 2, Number(t)), winners: ids, amount: p.amount, share: s.share, kept: s.leftover, gift: p.gift || "" };
    });
    return { currency: c, rows };
  }
  function sheetNode(d) {
    const t = el("table", { class: "zf-table", id: "zp-sheet-table" }, el("thead", {}, el("tr", {}, ["Prize", "Winner ticket numbers", "Each winner's share", "Organizer notes"].map((h) => el("th", { scope: "col", text: h })))));
    const tb = el("tbody");
    for (const r of d.rows) tb.append(el("tr", {}, el("td", { text: r.label }), el("td", { text: r.winners.length ? r.winners.join(", ") : "Not won (stays with you)" }), el("td", { text: r.winners.length ? sym(d.currency) + " " + r.share.toLocaleString("en-IN") + (r.winners.length > 1 ? " each (shared by " + r.winners.length + ")" : "") : "–" }), el("td", { text: r.gift })));
    t.append(tb);
    return el("section", { class: "zf-sheet", id: "zp-sheet" }, el("h3", { text: "Prize sheet" }), el("p", { class: "zf-small", text: "For you only. Corporate Tambola shows and records the prizes; it never pays anybody. You give the prizes in your own way and time." }), el("div", { class: "zf-tablewrap" }, t), el("button", { type: "button", class: "zf-add", id: "zp-print", onclick: () => window.print() }, "Print the prize sheet"));
  }
  let busy = false;
  new MutationObserver(() => {
    if (busy) return; const d = document.getElementById("zf-dashboard"), done = document.getElementById("zf-completed");
    if (!d || !done || document.getElementById("zp-sheet")) return;
    busy = true; sheet().then((x) => { if (x && !document.getElementById("zp-sheet")) done.after(sheetNode(x)); }).finally(() => { busy = false; });
  }).observe(document.getElementById("app"), { childList: true });
})();
