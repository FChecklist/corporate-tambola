/* Corporate Tambola, organizer page for zero-server engagements: create, share, watch, pause/resume/stop, check claims, settle, history/reuse/erase.
   Works on the organizer's own machine; the game itself runs on the phones. The page holds the organizer secret only in this tab's session. */
(function () {
  const ZG = window.ZG;
  const $app = document.getElementById("app");
  const q = new URLSearchParams(location.search);
  const BASE = (q.get("api") || "").replace(/\/$/, "");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} } };
  let secret = ss.get("ctz-org") || "";
  let eid = q.get("e") || "";
  const NAMES = { early5: "Early Five", top: "Top line", mid: "Middle line", bot: "Bottom line", corners: "Four corners", star: "Star", full: "Full house" };
  const call = async (method, path, body) => {
    const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", "x-organizer": secret }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || "http " + r.status), { status: r.status });
    return j;
  };
  const S = { info: null, people: [], claims: [], control: null, results: [], store: null, log: [], note: "", history: null, busy: false };
  const fmtDay = (ms) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  async function latestRound() { const x = await ZG.fetchRound("latest"); return x ? x.round : null; }

  function loginView(msg) {
    return `<div class="zhead"><b>Corporate Tambola · Organizer</b></div><div class="zcard zform"><h2>Organizer key</h2>
      <label for="sec">Your organizer key</label><input id="sec" type="password" autocomplete="off" value="${esc(secret)}">
      ${msg ? `<div class="zbanner bad">${esc(msg)}</div>` : ""}<button class="zbtn" id="in">Continue</button></div>`;
  }
  function homeView() {
    const h = S.history;
    const last = h && h.engagements[0];
    const bar = last ? `<div class="lastbar"><span>LAST ENGAGEMENT WAS ON <b>${fmtDay(last.created_ms)}</b> · ${last.participants} participants</span><span><button data-reuse="${esc(last.id)}">REUSE THE DATA</button><button data-hist="1">HISTORY</button></span></div>` : "";
    const hist = S.showHist && h ? `<div class="zcard"><h2>History · kept ${h.retentionDays} days</h2><table>${h.engagements.map((e) => `<tr><td>${esc(e.id)}</td><td>${fmtDay(e.created_ms)}</td><td>${e.participants} people</td><td><button class="zbtn s alt" data-open="${esc(e.id)}">Open</button><button class="zbtn s alt" data-reuse="${esc(e.id)}">Reuse</button></td></tr>`).join("")}</table></div>` : "";
    return `<div class="zhead"><b>Corporate Tambola · Organizer</b></div>${bar}${hist}
      <div class="zcard zform"><h2>New engagement</h2>
      <label for="mins">Starts in (minutes)</label><input id="mins" type="number" min="1" max="1440" value="10">
      <label for="spd">Calling speed</label><select id="spd"><option value="6">Fast · 6 seconds</option><option value="9" selected>Normal · 9 seconds</option><option value="12">Relaxed · 12 seconds</option><option value="15">Slow · 15 seconds</option></select>
      <label for="cap">Most participants</label><input id="cap" type="number" min="1" max="100000" value="500">
      <button class="zbtn" id="mk">Create engagement</button><p class="zsmall">The first number is called one minute after the start time. Numbers come from public randomness that nobody, including us, can know in advance.</p></div>
      <div class="zcard"><h2>Your free AI assistant</h2>
        <p class="zsmall" style="margin-top:0">Included with every engagement. Give this message to ChatGPT, Claude or Gemini and it does the work for you: sets up the engagement, loads your list, schedules it and watches it. It cannot publish results, erase data or pause by itself, and it cannot change the rules.</p>
        ${S.aiMsg ? `<textarea class="zlink" id="aimsg" rows="7" readonly style="width:100%">${esc(S.aiMsg)}</textarea><button class="zbtn s alt" id="aicopy">Copy message</button><button class="zbtn s alt" id="airevoke">Stop this link</button>` : `<button class="zbtn s" id="aimake">Create my AI work link</button>`}</div>
      ${(S.sugs || []).length ? `<div class="zcard"><h2>Ideas to improve Corporate Tambola</h2><p class="zsmall" style="margin-top:0">Suggested by organizers' AI assistants. We review them all.</p>${S.sugs.map((x) => `<div class="zrow"><span>${esc(x.title)}${x.yours ? " · yours" : ""}</span><i>${x.votes} · ${esc(x.status.replace("_", " "))}</i></div>`).join("")}</div>` : ""}
      ${S.note ? `<div class="zbanner info">${esc(S.note)}</div>` : ""}`;
  }
  function engView() {
    const link = location.origin + (BASE ? "" : "") + "/z.html?e=" + encodeURIComponent(eid) + (BASE ? "&api=" + encodeURIComponent(BASE) : "");
    const bad = S.checked ? S.checked.bad.length : 0;
    const c = S.control;
    const paused = c && c.pausedNow;
    return `<div class="zhead"><b>Engagement ${esc(eid)}</b><button class="zsnd" id="back">All engagements</button></div>
      ${S.note ? `<div class="zbanner info">${esc(S.note)}</div>` : ""}
      <div class="zcard"><h2>Share with participants</h2><div class="zlink">${esc(link)}</div><button class="zbtn s alt" id="copy">Copy link</button></div>
      <div class="zgrid"><div class="zcard"><h2>Participants</h2><div class="zstat">${S.people.length}</div></div><div class="zcard"><h2>Numbers called</h2><div class="zstat">${S.log.length} / 90</div></div></div>
      ${(S.reqs || []).length ? `<div class="zcard"><h2>Your AI assistant is asking</h2>${S.reqs.map((r) => `<div class="zrow"><span>${esc(r.action)}${r.note ? " · " + esc(r.note) : ""}</span></div>`).join("")}<button class="zbtn s" id="reqok">Approve (${esc(S.reqs[0].action)})</button><button class="zbtn s alt" id="reqno">Dismiss</button></div>` : ""}
      <div class="zcard zform"><h2>Invite list</h2>
        <label for="roster">Paste one person per line: name, mobile number</label><textarea id="roster" rows="4" style="width:100%;box-sizing:border-box;font-size:15px;border:1px solid var(--line);border-radius:10px;padding:8px"></textarea>
        <button class="zbtn s" id="addroster">Add to list</button>
        <label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="closed" style="width:auto;min-height:0" ${S.closed ? "checked" : ""}> Invite only (people not on the list cannot join)</label></div>
      <div class="zcard"><h2>Controls</h2>
        <button class="zbtn s" data-ctl="pause" ${paused ? "disabled" : ""}>Pause</button><button class="zbtn s alt" data-ctl="resume" ${paused ? "" : "disabled"}>Resume</button><button class="zbtn s bad" data-ctl="stop">End engagement</button>
        <p class="zsmall">A pause reaches every phone about 30 to 40 seconds after you press it, because phones check in every few seconds. ${paused ? "<b>Paused now.</b>" : ""} ${S.ctlNote ? esc(S.ctlNote) : ""}</p></div>
      <div class="zcard"><h2>Rewards · from the public number log</h2>
        ${S.settledPreview.length ? S.settledPreview.map((s) => `<div class="zrow"><span>${NAMES[s.pattern]} · call ${s.idx + 1}</span><em>${s.pids.length} participant${s.pids.length === 1 ? "" : "s"}${s.names ? " · " + esc(s.names) : ""}</em></div>`).join("") : "<p class=zsmall>No pattern is complete yet.</p>"}
        <p class="zsmall">Claims received: ${S.claims.length}. ${bad ? `<b>${bad} not valid</b> (they do not match the public log and are ignored).` : "All claims so far match the public log."}</p>
        <button class="zbtn s" id="settle" ${S.settledPreview.length ? "" : "disabled"}>Publish results to participants</button>
        <button class="zbtn s alt" id="csv" ${S.settledPreview.length ? "" : "disabled"}>Download report</button></div>
      <div class="zcard"><h2>Participant data</h2><button class="zbtn s alt" id="erase">Erase all participant data for this engagement</button>
        <p class="zsmall">Participant data is kept for 365 days and then deleted automatically. You can erase it sooner at any time.</p></div>`;
  }
  function draw(v) { $app.innerHTML = v; bind(); }

  async function refreshHome() { try { S.sugs = (await call("GET", "/api/z/suggestions")).suggestions.slice(0, 6); } catch { S.sugs = []; } try { S.history = await call("GET", "/api/history"); } catch (e) { if (e.status === 403) { secret = ""; return draw(loginView("That organizer key was not accepted.")); } } draw(homeView()); }

  async function refreshEng() {
    try {
      S.info = await fetch(BASE + `/api/z/${eid}/info`).then((r) => r.json());
      const pr = await call("GET", `/api/z/${eid}/participants`); S.people = pr.participants; S.closed = pr.closed;
      S.claims = (await call("GET", `/api/z/${eid}/claims`)).claims;
      try { S.reqs = (await call("GET", `/api/z/${eid}/control/request`)).requests; } catch { S.reqs = []; }
      const cf = await fetch(BASE + `/api/z/${eid}/control`).then((r) => (r.ok ? r.json() : null));
      S.control = null; S.cf = cf;
      const now = await latestRound();
      let sched;
      if (cf) { const st = ZG.resolveControl(ZG.cfgOf(cf), cf.messages); S.st = st; S.control = { pausedNow: now !== null && st.intervals.some((i) => now >= i.start && now < i.end) }; sched = ZG.scheduleWithControl(st, S.info.startRound, S.info.callSeconds / 3, 90); }
      else sched = ZG.scheduleFor(S.info.startRound, S.info.callSeconds);
      if (!S.store) S.store = new ZG.RoundStore({});
      const upto = sched.filter((r) => r !== null && now !== null && r <= now);
      await Promise.all(upto.filter((r) => !S.store.rounds.has(r)).slice(0, 12).map((r, i) => (now - r <= 2 ? S.store.fetchLive(r, i) : S.store.fetchBackfill(r, i))));
      S.store.verifySome(3);
      S.log = ZG.logFrom(eid, sched.filter((r) => r !== null), S.store, upto.length);
      const pids = S.people.map((p) => p.pid);
      S.checked = ZG.checkClaims(eid, S.claims.map((c) => ({ pid: c.pid, pattern: c.pattern, idx: c.idx })), S.log);
      const nm = new Map(S.people.map((p) => [p.pid, p.name]));
      S.settledPreview = ZG.settleAll(eid, pids, S.log).map((s) => ({ ...s, names: s.pids.length <= 3 ? s.pids.map((p) => nm.get(p) || "Participant").join(", ") : "" }));
    } catch (e) { S.note = e.status === 404 ? "That engagement was not found." : "Could not refresh. Retrying…"; }
    if (eid) draw(engView());
  }

  function bind() {
    const $ = (id) => document.getElementById(id);
    if ($("in")) $("in").onclick = () => { secret = $("sec").value.trim(); ss.set("ctz-org", secret); refreshHome(); };
    if ($("mk")) $("mk").onclick = async () => {
      $("mk").disabled = true;
      try {
        const now = await latestRound();
        if (now === null) throw new Error("Could not read the public clock. Check your connection.");
        const id = "E" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
        await call("POST", "/api/z", { id, startRound: now + Math.round(Number($("mins").value) * 20) + 20, callSeconds: Number($("spd").value), cap: Number($("cap").value) });
        const k = await TBControl.ensureKey(id, { token: secret, base: BASE, prefix: "/api/z" });
        S.note = k.ok ? "" : "Created, but pause control is unavailable: " + (k.reason || "");
        eid = id; history.replaceState(null, "", "?e=" + id + (BASE ? "&api=" + encodeURIComponent(BASE) : "")); S.store = null; refreshEng();
      } catch (e) { S.note = e.message; draw(homeView()); }
    };
    document.querySelectorAll("[data-hist]").forEach((b) => (b.onclick = () => { S.showHist = !S.showHist; draw(homeView()); }));
    document.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => { eid = b.dataset.open; S.store = null; refreshEng(); }));
    document.querySelectorAll("[data-reuse]").forEach((b) => (b.onclick = async () => {
      // a new engagement that starts with the earlier roster already on it
      try {
        const now = await latestRound(); const id = "E" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (x) => "abcdefghjkmnpqrstuvwxyz23456789"[x % 31]).join("");
        const old = S.history.engagements.find((e) => e.id === b.dataset.reuse);
        await call("POST", "/api/z", { id, startRound: now + 20 * 20, callSeconds: old.call_seconds, cap: Math.max(old.participants + 50, 500) });
        const r = await call("POST", `/api/z/${id}/reuse`, { from: b.dataset.reuse });
        await TBControl.ensureKey(id, { token: secret, base: BASE, prefix: "/api/z" });
        S.note = `Created with ${r.copied} participants from the earlier engagement. It starts in 20 minutes; participants use the new link.`; eid = id; S.store = null; refreshEng();
      } catch (e) { S.note = e.message; draw(homeView()); }
    }));
    if ($("back")) $("back").onclick = () => { eid = ""; history.replaceState(null, "", location.pathname + (BASE ? "?api=" + encodeURIComponent(BASE) : "")); S.note = ""; refreshHome(); };
    if ($("copy")) $("copy").onclick = () => navigator.clipboard && navigator.clipboard.writeText(document.querySelector(".zlink").textContent);
    document.querySelectorAll("[data-ctl]").forEach((b) => (b.onclick = async () => {
      const action = b.dataset.ctl;
      if (action === "stop" && !confirm("End this engagement for everyone? This cannot be undone.")) return;
      try { const r = await TBControl.publish(eid, { token: secret, base: BASE, prefix: "/api/z" }, action, action === "pause" ? { pauseForRounds: 600 } : {}); S.ctlNote = r.status === 200 ? action[0].toUpperCase() + action.slice(1) + " sent. Phones follow within about 40 seconds." : (r.data && r.data.error) || "Not accepted."; } catch (e) { S.ctlNote = e.message; }
      refreshEng();
    }));
    if ($("settle")) $("settle").onclick = async () => { try { await call("POST", `/api/z/${eid}/settle`, { results: S.settledPreview.map(({ pattern, idx, pids }) => ({ pattern, idx, pids })) }); S.note = "Results published to participants."; } catch (e) { S.note = e.message; } refreshEng(); };
    if ($("csv")) $("csv").onclick = () => {
      const nm = new Map(S.people.map((p) => [p.pid, p.name || ""]));
      const rows = [["Reward", "Call number", "Participant"]];
      for (const s of S.settledPreview) for (const p of s.pids) rows.push([NAMES[s.pattern], s.idx + 1, nm.get(p) || p]);
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(",")).join("\n")], { type: "text/csv" })); a.download = eid + "-rewards.csv"; a.click();
    };
    if ($("aimake")) $("aimake").onclick = async () => {
      try { const r = await call("POST", "/api/org/ai", {}); const origin = BASE || location.origin; S.aiMsg = "You are my Corporate Tambola assistant. Read the instructions at " + origin + "/api/z/ai-manifest, then do what I ask using that API. Send this key in the x-organizer header on every call: " + r.aiKey + ". Keep the key private. Tell me before you do anything that cannot be undone."; } catch (e) { S.note = e.message; }
      draw(homeView());
    };
    if ($("aicopy")) $("aicopy").onclick = () => navigator.clipboard && navigator.clipboard.writeText(S.aiMsg);
    if ($("airevoke")) $("airevoke").onclick = async () => { try { await call("POST", "/api/org/ai/revoke", {}); S.aiMsg = ""; S.note = "Your AI work link has been stopped."; } catch (e) { S.note = e.message; } draw(homeView()); };
    if ($("reqok")) $("reqok").onclick = async () => {
      const r = S.reqs[0];
      try { const x = await TBControl.publish(eid, { token: secret, base: BASE, prefix: "/api/z" }, r.action, r.action === "pause" ? { pauseForRounds: 600 } : {}); S.ctlNote = x.status === 200 ? r.action + " sent." : (x.data && x.data.error) || "Not accepted."; await call("POST", `/api/z/${eid}/control/request/clear`, {}); } catch (e) { S.ctlNote = e.message; }
      refreshEng();
    };
    if ($("reqno")) $("reqno").onclick = async () => { try { await call("POST", `/api/z/${eid}/control/request/clear`, {}); } catch {} refreshEng(); };
    if ($("addroster")) $("addroster").onclick = async () => {
      const people = $("roster").value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const m = l.match(/^(.*?)[,;\t ]+([+0-9][0-9 +()-]{8,})$/); return m ? { name: m[1].trim(), phone: m[2] } : { name: "", phone: l }; });
      let added = 0, invalid = 0;
      try { for (let i = 0; i < people.length; i += 100) { const r = await call("POST", `/api/z/${eid}/roster`, { people: people.slice(i, i + 100) }); added += r.added; invalid += r.invalid; } S.note = added + " added" + (invalid ? ", " + invalid + " not valid (check the numbers)" : "") + "."; } catch (e) { S.note = e.message; }
      refreshEng();
    };
    if ($("closed")) $("closed").onchange = async () => { try { await call("PATCH", `/api/z/${eid}/settings`, { closed: $("closed").checked }); S.note = $("closed").checked ? "Only people on the list can join." : "Anyone with the link can join."; } catch (e) { S.note = e.message; } refreshEng(); };
    if ($("erase")) $("erase").onclick = async () => { if (!confirm("Erase all participant data for this engagement? This cannot be undone.")) return; try { const r = await call("POST", `/api/z/${eid}/erase`, {}); S.note = r.erased + " participants erased."; } catch (e) { S.note = e.message; } refreshEng(); };
  }

  if (!secret) draw(loginView("")); else if (eid) refreshEng(); else refreshHome();
  setInterval(() => { if (eid && secret && !document.hidden) refreshEng(); }, 5000);
  window.__zc = S;
})();
