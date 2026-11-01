/* Corporate Tambola: "Continue with Google" (docs/ROLES_AND_CONSOLE_SPEC_4.md, section C). One small helper shared by the home page, the sign-in page and (later) the Host's first screen.
   The button shows ONLY when the server has a Google client id (GET /api/auth/config -> {google: "<id>"|null}). Google's own button (Google Identity Services) gives us a signed token;
   we post it to /api/auth/google, which checks it and answers exactly like the e-mail-code sign-in does ({token}); then we continue exactly as that does. We ask for nothing but the e-mail.
   Nothing is loaded from Google unless a client id is configured. If Google refuses to load here (an in-app browser, an ad blocker), we say so calmly and the e-mail code stays the other way. */
(function () {
  const TB = window.TB || (window.TB = {});
  const WEBVIEW = /; wv\)|FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|LinkedInApp|Snapchat|Twitter|GSA\//i; // browsers inside other apps, which Google refuses to sign in on
  const LINE = "Open this page in your browser, or use an e-mail code.";
  let cfg;
  async function config() {
    if (cfg !== undefined) return cfg;
    try {
      const r = await fetch("/api/auth/config", { headers: { accept: "application/json" } });
      const j = r.ok ? await r.json() : null;
      cfg = j && typeof j.google === "string" && /^[\w.-]{10,200}$/.test(j.google) ? j.google : null;
    } catch { cfg = null; }
    return cfg;
  }
  function loadGsi(ms) {
    return new Promise((ok, no) => {
      if (window.google && window.google.accounts && window.google.accounts.id) return ok();
      const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true;
      const t = setTimeout(() => no(new Error("slow")), ms || 8000);
      s.onload = () => { clearTimeout(t); window.google && window.google.accounts && window.google.accounts.id ? ok() : no(new Error("missing")); };
      s.onerror = () => { clearTimeout(t); no(new Error("blocked")); };
      document.head.appendChild(s);
    });
  }
  const note = (el, text) => { el.innerHTML = ""; const p = document.createElement("p"); p.className = "zsmall ggnote"; p.setAttribute("role", "status"); p.textContent = text; el.appendChild(p); el.hidden = false; };
  /**
   * Puts the Google button into `el` when Google sign-in is switched on; leaves `el` empty and hidden when it is not.
   * opt: { intent: "signup"|"signin"|"host", hostKey?, onDone(result), onError(message) }. Resolves true when the button (or the calm line) was shown.
   */
  async function mount(el, opt) {
    if (!el) return false;
    el.hidden = true; el.innerHTML = "";
    if (TB.microsoft) return TB.microsoft.mount(el, opt); // "Continue with Microsoft" (owner approved 2026-11-01); Google stays off
    return false; // owner, 2026-10-23: there is ONE way in, the e-mail (a 6-digit code or one tap). The Google button stays off; the server route is kept but not offered.
    const id = await config();
    if (!id) return false;
    el.hidden = false;
    if (WEBVIEW.test((navigator && navigator.userAgent) || "")) { note(el, LINE); return true; }
    try { await loadGsi(); } catch { note(el, LINE); return true; }
    try {
      window.google.accounts.id.initialize({
        client_id: id, ux_mode: "popup", auto_select: false, cancel_on_tap_outside: true,
        callback: async (resp) => {
          const credential = resp && resp.credential;
          if (!credential) return;
          const consent = opt.consent ? opt.consent() : undefined; // signing up (or a Host accepting the role) needs the Terms box ticked first
          if (opt.consent && !consent) { opt.onError && opt.onError("Please tick the box to continue."); return; }
          try {
            const r = await fetch("/api/auth/google", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ credential, intent: opt.intent || "signin", ...(opt.hostKey ? { hostKey: opt.hostKey } : {}), ...(consent ? { consent } : {}) }) });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j.error || "Google sign-in did not work. Please try again, or use an e-mail code.");
            opt.onDone && opt.onDone(j);
          } catch (e) { opt.onError && opt.onError(e && e.message ? e.message : "Google sign-in did not work. Please try again, or use an e-mail code."); }
        },
      });
      const box = document.createElement("div"); el.appendChild(box);
      window.google.accounts.id.renderButton(box, { type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "rectangular", logo_alignment: "left", width: Math.max(200, Math.min(320, (el.clientWidth || 300))) });
    } catch { note(el, LINE); }
    return true;
  }
  /* "Continue with Microsoft": the authorization-code flow with PKCE in a small sign-in window (a single-page app: there is no client secret anywhere). The button shows ONLY when the server
     has a Microsoft client id (GET /api/auth/config -> {microsoft: "<id>"|null}). Microsoft's page opens only after the button is pressed; nothing is loaded from Microsoft before that.
     The window comes back to /ms-callback.html, which hands the one-time code to this page; this page swaps it for an ID token (login.microsoftonline.com) and posts the token to
     /api/auth/microsoft, which checks it and answers exactly like the e-mail-code sign-in does ({token}). Only the e-mail is asked for and kept. */
  const MS_HOST = "https://login.microsoftonline.com/common/oauth2/v2.0/";
  let mcfg;
  async function msConfig() {
    if (mcfg !== undefined) return mcfg;
    try {
      const r = await fetch("/api/auth/config", { headers: { accept: "application/json" } });
      const j = r.ok ? await r.json() : null;
      mcfg = j && typeof j.microsoft === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(j.microsoft) ? j.microsoft : null;
    } catch { mcfg = null; }
    return mcfg;
  }
  const rand = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); };
  const b64url = (bytes) => btoa(String.fromCharCode.apply(null, Array.from(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  async function msSignIn(id) {
    const verifier = rand(48), state = rand(18), nonce = rand(18), redirect = location.origin + "/ms-callback.html";
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    const q = new URLSearchParams({ client_id: id, response_type: "code", redirect_uri: redirect, response_mode: "query", scope: "openid email profile", state, nonce, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account" });
    const w = window.open(MS_HOST + "authorize?" + q.toString(), "ctms", "popup,width=520,height=680");
    if (!w) throw new Error("Your browser blocked the sign-in window. Please allow it, or use an e-mail code.");
    const code = await new Promise((ok, no) => {
      const done = (fn, v) => { window.removeEventListener("message", on); clearInterval(tick); fn(v); };
      const on = (e) => { const d = e.data; if (e.origin !== location.origin || e.source !== w || !d || d.type !== "ms-code") return; if (d.state !== state || !d.code) return done(no, new Error("Microsoft sign-in did not work. Please try again, or use an e-mail code.")); done(ok, d.code); };
      const tick = setInterval(() => { if (w.closed) done(no, new Error("")); }, 600);
      window.addEventListener("message", on);
    });
    const r = await fetch(MS_HOST + "token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: id, grant_type: "authorization_code", code, redirect_uri: redirect, code_verifier: verifier }).toString() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || typeof j.id_token !== "string") throw new Error("Microsoft sign-in did not work. Please try again, or use an e-mail code.");
    return { credential: j.id_token, nonce };
  }
  async function msMount(el, opt) {
    const id = await msConfig();
    if (!id) return false;
    el.hidden = false;
    if (WEBVIEW.test((navigator && navigator.userAgent) || "")) { note(el, LINE); return true; }
    el.innerHTML = "";
    const b = document.createElement("button"); b.type = "button"; b.className = "zbtn zms"; b.textContent = "Continue with Microsoft";
    b.onclick = async () => {
      const consent = opt.consent ? opt.consent() : undefined; // signing up (or a Host accepting the role) needs the Terms box ticked first
      if (opt.consent && !consent) { opt.onError && opt.onError("Please tick the box to continue."); return; }
      b.disabled = true;
      try {
        const t = await msSignIn(id);
        const r = await fetch("/api/auth/microsoft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...t, intent: opt.intent || "signin", ...(opt.hostKey ? { hostKey: opt.hostKey } : {}), ...(consent ? { consent } : {}) }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "Microsoft sign-in did not work. Please try again, or use an e-mail code.");
        opt.onDone && opt.onDone(j);
      } catch (e) { if (e && e.message) opt.onError && opt.onError(e.message); } finally { b.disabled = false; }
    };
    el.appendChild(b);
    return true;
  }
  TB.microsoft = { config: msConfig, mount: msMount };
  /** What the e-mail-code sign-in does after a good code: keep the key for this tab and go on to the console (or the page that sent the person here). */
  function finish(r) {
    try { CTK.set("ctz-org", r.token); } catch {}
    let nx = "/zc.html"; try { const n = sessionStorage.getItem("ctz-next"); if (n && /^\/(zc|pay)(\.html)?(\?(e=[A-Za-z0-9_-]{4,40}|demo=1|quick=1(&cap=\d{1,5})?))?$/.test(n)) nx = n; sessionStorage.removeItem("ctz-next"); } catch {}
    location.href = nx;
  }
  TB.google = { config, mount, finish, LINE };
})();
