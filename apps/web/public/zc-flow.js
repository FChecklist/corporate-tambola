/* Corporate Tambola, the NEW organizer flow (option only: open /zc.html?flow=new). Five steps and a Game dashboard.
   The current console (zc.js) is not touched: it stands aside when flow=new is in the address. Words follow docs 191 (language guide).
   Pure rules live in window.ZFLOW (tested); the page code below only draws them. */
(function () {
  "use strict";
  const COPY = {
    top: "No personal details needed. All game and participant information is deleted within 24 hours of the game.",
    soon: "Coming soon",
    dash: "Game dashboard",
    dashLocked: "Opens after you publish",
    next: "Next",
  };
  const STEPS = [
    { n: 1, id: "when", name: "Date and time" },
    { n: 2, id: "who", name: "Who is this game for" },
    { n: 3, id: "prizes", name: "Tickets and prizes" },
    { n: 4, id: "brand", name: "Brand & Breaks", optional: true },
    { n: 5, id: "publish", name: "Check and publish" },
  ];
  /** A step can be opened when every earlier required step is done. Brand & Breaks is optional, so it never blocks step 5. */
  function canOpen(n, done) {
    for (const s of STEPS) { if (s.n >= n) break; if (!s.optional && !done[s.n]) return false; }
    return true;
  }
  /** The next step to scroll to after a step is saved (the first step not yet done, after n). */
  function nextAfter(n, done) {
    for (const s of STEPS) if (s.n > n && !done[s.n]) return s.n;
    return 0;
  }
  /** The Game dashboard stays locked until the game is published. */
  const dashboardOpen = (info) => !!info && info.published === true;
  /** Words banned by the language guide in anything the organizer reads. */
  const BANNED = [/\binvit/i, /\bprivate\b/i, /\bwe\b/i, /\bRs\.?\s?\d/, /\bseats?\b/i, /\bplaces\b/i, /in the office/i, /\bcash\b/i];
  const badWords = (text) => BANNED.filter((r) => r.test(text)).map(String);
  const registry = {}; // step number -> function(el, ctx) that draws the step body (each step adds its own)

  const api = { COPY, STEPS, canOpen, nextAfter, dashboardOpen, badWords, registry };
  if (typeof window !== "undefined") window.ZFLOW = api;
  if (typeof module !== "undefined") module.exports = api;
  if (typeof document === "undefined") return;
  const q = new URLSearchParams(location.search);
  if (q.get("flow") !== "new") return;

  const el = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (k === "text") e.textContent = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
    for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
    return e;
  };
  const state = { done: {}, open: 1, info: null };
  const app = document.getElementById("app");
  function scrollTo(id) { const t = document.getElementById(id); if (t && t.scrollIntoView) t.scrollIntoView({ behavior: "smooth", block: "start" }); }

  function draw() {
    app.replaceChildren();
    app.append(el("p", { class: "zf-top", role: "note", text: COPY.top }));
    const bar = el("ol", { class: "zf-bar", "aria-label": "Steps" });
    for (const s of STEPS) {
      const ok = canOpen(s.n, state.done), cur = state.open === s.n;
      bar.append(el("li", {}, el("button", { type: "button", class: "zf-pill" + (cur ? " cur" : "") + (state.done[s.n] ? " done" : ""), "data-step": String(s.n), ...(ok ? {} : { disabled: "" }), ...(cur ? { "aria-current": "step" } : {}), onclick: () => { state.open = s.n; draw(); scrollTo("zf-sec" + s.n); } }, el("b", { text: String(s.n) }), " ", s.name, s.optional ? el("i", { text: " (optional)" }) : null)));
    }
    const open = dashboardOpen(state.info);
    bar.append(el("li", {}, el("button", { type: "button", class: "zf-pill zf-dash", id: "zf-dash", ...(open ? {} : { disabled: "", title: COPY.dashLocked }) }, COPY.dash, open ? null : el("i", { text: " · " + COPY.dashLocked }))));
    app.append(bar);
    for (const s of STEPS) {
      const sec = el("section", { class: "zf-sec" + (state.open === s.n ? " open" : ""), id: "zf-sec" + s.n, "aria-labelledby": "zf-h" + s.n });
      sec.append(el("h2", { id: "zf-h" + s.n, text: s.n + ". " + s.name }));
      if (state.open === s.n) {
        const body = el("div", { class: "zf-body" });
        if (registry[s.n]) registry[s.n](body, { state, done, redraw: draw }); else body.append(el("p", { class: "zf-soon", text: COPY.soon }));
        sec.append(body);
      }
      app.append(sec);
    }
  }
  /** Called by a step when it has saved: mark it done and move on to the next step, scrolling to it. */
  function done(n) {
    state.done[n] = true;
    const nx = nextAfter(n, state.done);
    if (nx) state.open = nx;
    draw();
    if (nx) scrollTo("zf-sec" + nx);
  }
  api.state = state; api.draw = draw; api.done = done; api.el = el;
  document.title = "Organizer console | Corporate Tambola";
  draw();
})();
