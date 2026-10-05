// The page the sign-in e-mail's buttons open. Opening it (a GET, which mail scanners do too) changes nothing: it only shows a button. Pressing the button POSTs the single-use token,
// which starts the session (the same kind of key the 6-digit code gives) and goes to the AI-link page or the console.
(() => {
  const app = document.getElementById("app");
  const q = new URLSearchParams(location.search), t = q.get("t") || "", go = q.get("go") === "ai" ? "/ai-link.html" : "/zc.html";
  try { history.replaceState(null, "", location.pathname); } catch {} // the token leaves the address bar at once
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const draw = (msg) => {
    app.innerHTML = `<div class="zhead"><b>Corporate Tambola</b></div><div class="zcard zform"><h2>Continue to Corporate Tambola</h2>
      <p class="zsmall" style="margin-top:0">${go === "/ai-link.html" ? "You will see your AI work link next." : "Your console opens next."} This button works once and for 10 minutes only.</p>
      ${msg ? `<div class="zbanner bad" role="alert">${esc(msg)}</div>` : ""}
      ${t ? `<button class="zbtn" id="go">Continue to Corporate Tambola</button>` : `<div class="zbanner bad">This sign-in link is incomplete. Please ask for a new one from the sign-in page.</div>`}
      <p class="zsmall"><a href="/#login">Back to the sign-in page</a></p></div>`;
    const b = document.getElementById("go");
    if (b) b.onclick = async () => {
      b.disabled = true;
      try {
        const r = await fetch("/api/auth/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: t }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "Something went wrong. Please try again.");
        try { sessionStorage.setItem("ctz-org", j.token); } catch {}
        location.replace(go);
      } catch (e) { draw(e.message); }
    };
  };
  draw("");
})();
