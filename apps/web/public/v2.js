/* Corporate Tambola V2 tools (13 Nov 2026): one small panel on the organizer / Host screen, so nothing of the existing screens had to change.
   Receipts and payment history, winner certificates, data download, game keys and Host keys, claim review, Host hand-over, and support. Every call uses the signed-in key and the game open on the screen.
   Words go through CTLang.t, so the panel follows the person's own language. Nothing typed here is ever put into the page as HTML. */
(function () {
  "use strict";
  var W = window, D = document;
  if (W.__ctv2) return; W.__ctv2 = 1;
  var q = new URLSearchParams(location.search), BASE = (q.get("api") || "").replace(/\/$/, "");
  function T(s) { return W.CTLang ? W.CTLang.t(s) : s; }
  function key() { try { return (W.CTK ? W.CTK.get("ctz-org") : sessionStorage.getItem("ctz-org")) || ""; } catch (e) { return ""; } }
  function eid() { return new URLSearchParams(location.search).get("e") || ""; }
  function el(tag, props, kids) {
    var n = D.createElement(tag);
    Object.keys(props || {}).forEach(function (k) { if (k === "style") n.style.cssText = props[k]; else if (k === "text") n.textContent = props[k]; else if (k.slice(0, 2) === "on") n[k] = props[k]; else n.setAttribute(k, props[k]); });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? D.createTextNode(c) : c); });
    return n;
  }
  function api(method, path, body, raw) {
    var h = { "x-organizer": key() }; if (body !== undefined) h["content-type"] = "application/json";
    return fetch(BASE + path, { method: method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }).then(function (r) {
      if (raw && r.ok) return r;
      return r.text().then(function (t) { var j = null; try { j = JSON.parse(t); } catch (e) { /* not JSON */ } if (!r.ok) { var err = new Error((j && j.error) || "Something went wrong. Please try again."); err.status = r.status; throw err; } return j; });
    });
  }
  function save(resp, name) { return resp.blob().then(function (b) { var a = el("a", { href: URL.createObjectURL(b), download: name }); D.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }); }
  var box, body, tabs, current = "receipts";
  var BTN = "min-height:40px;padding:6px 14px;border-radius:8px;border:1px solid #0b3d91;background:#0b3d91;color:#fff;font-size:.95rem;cursor:pointer;margin:4px 6px 4px 0";
  var BTN2 = "min-height:40px;padding:6px 14px;border-radius:8px;border:1px solid #c9cdd6;background:#fff;color:#1a2233;font-size:.95rem;cursor:pointer;margin:4px 6px 4px 0";
  function btn(text, fn, ghost) { return el("button", { type: "button", style: ghost ? BTN2 : BTN, onclick: fn, text: T(text) }); }
  function msg(text, bad) { return el("p", { style: "margin:8px 0;color:" + (bad ? "#9b1c1c" : "#1a2233"), role: bad ? "alert" : "status", text: text }); }
  function put(nodes) { body.textContent = ""; nodes.forEach(function (n) { body.appendChild(n); }); }
  function fail(e) { put([msg(e.message, true)]); }
  function when(ms) { return ms ? new Date(ms + 19800000).toISOString().slice(0, 16).replace("T", " ") + " IST" : ""; }
  function ask(label, dflt) { var v = W.prompt(T(label), dflt || ""); return v === null ? null : v.trim(); }

  var views = {
    receipts: function () {
      var id = eid(), nodes = [el("p", { style: "margin:4px 0;font-weight:600", text: T("Paid to: IT SERVICES BY RAJAT AGARWAL via Razorpay") })];
      var show = function (r) {
        var rows = r.receipts || []; if (!rows.length) nodes.push(msg(r.note || T("No payment has been made yet.")));
        rows.forEach(function (x) {
          var line = [x.invoiceNumber || T("(invoice follows)"), (x.currency === "USD" ? "US$ " : "Rs ") + x.amount, x.status, when(x.paidMs || x.createdMs), x.game ? "(" + (x.gameName || x.game) + ")" : ""].filter(Boolean).join("  ·  ");
          var li = el("div", { style: "padding:6px 0;border-bottom:1px solid #e3e6ee" }, [el("div", { text: line })]);
          if (x.invoiceUrl) li.appendChild(el("a", { href: x.invoiceUrl, target: "_blank", rel: "noopener", style: "margin-right:12px", text: T("Invoice") }));
          if (x.invoicePdfUrl) li.appendChild(el("a", { href: x.invoicePdfUrl, target: "_blank", rel: "noopener", text: "PDF" }));
          (x.creditNotes || []).forEach(function (n) { li.appendChild(el("div", { style: "font-size:.85rem", text: T("Credit note") + " " + n })); });
          nodes.push(li);
        });
        if (id && r.secretsShown) nodes.push(btn("Mail me these receipts", function () { api("POST", "/api/z/" + encodeURIComponent(id) + "/v2/receipts/send", {}).then(function () { put([msg(T("Sent to your e-mail."))]); }, fail); }));
        put(nodes);
      };
      var go = function (path) { api("GET", path).then(show, fail); };
      if (id) { nodes.push(btn("All my games", function () { nodes.length = 1; go("/api/org/v2/receipts"); }, true)); go("/api/z/" + encodeURIComponent(id) + "/v2/receipts"); }
      else go("/api/org/v2/receipts");
    },
    certs: function () {
      var id = eid(); if (!id) return put([msg(T("Open a game first."), true)]);
      var base = "/api/z/" + encodeURIComponent(id) + "/v2/certs";
      api("GET", base).then(function (r) {
        var nodes = [msg(r.note), btn("Make certificates for the winners", function () { api("POST", base + "/issue", {}).then(function () { views.certs(); }, fail); })];
        if ((r.notYetMade || 0) > 0) nodes.push(msg(String(r.notYetMade) + " " + T("winners still need a certificate.")));
        (r.certificates || []).forEach(function (c) {
          nodes.push(el("div", { style: "padding:6px 0;border-bottom:1px solid #e3e6ee" }, [el("div", { text: T("Ticket") + " " + c.ticket + " · " + c.prize }), btn("Download", function () { api("GET", base + "/" + c.id + ".html?download=1", undefined, true).then(function (resp) { return save(resp, "certificate-" + id + "-ticket-" + c.ticket + ".html"); }, fail); }, true), el("a", { href: c.verifyUrl, target: "_blank", rel: "noopener", text: T("Verification link") })]));
        });
        put(nodes);
      }, fail);
    },
    data: function () {
      var id = eid(); if (!id) return put([msg(T("Open a game first."), true)]);
      var part = el("select", { style: "min-height:40px;margin:4px 6px 4px 0" }, ["all", "results", "winners", "tickets", "payments"].map(function (p) { return el("option", { value: p, text: p }); }));
      var fmt = el("select", { style: "min-height:40px;margin:4px 6px 4px 0" }, ["json", "csv"].map(function (p) { return el("option", { value: p, text: p }); }));
      put([msg(T("Download this game's results, winners, tickets and payments. Players' names are included only while the game still holds them (they are deleted within 24 hours after the game).")), part, fmt,
        btn("Download", function () { var p = part.value, f = fmt.value; if (f === "csv" && p === "all") return put([msg(T("A spreadsheet holds one part at a time: choose results, winners, tickets or payments."), true), part, fmt]); api("GET", "/api/z/" + encodeURIComponent(id) + "/v2/export?part=" + p + "&format=" + f, undefined, true).then(function (resp) { return save(resp, "tambola-" + id + "-" + p + "." + f); }, fail); })]);
    },
    keys: function () {
      var id = eid(); if (!id) return put([msg(T("Open a game first."), true)]);
      var base = "/api/z/" + encodeURIComponent(id) + "/v2";
      api("GET", base + "/keys").then(function (r) {
        var nodes = [msg(r.rule)];
        nodes.push(btn("Make a game key", function () { var l = ask("A name for this key (for example ChatGPT)"); if (l === null) return; var ai = W.confirm(T("Is this key for an AI? OK = yes, Cancel = no")); api("POST", base + "/keys", { label: l, ai: ai }).then(function (k) { put([msg(T("Copy this key now. It is shown once."), false), el("code", { style: "display:block;word-break:break-all;padding:8px;background:#f3f5fa", text: k.key }), msg(k.rule), btn("Back", function () { views.keys(); }, true)]); }, fail); }));
        nodes.push(btn("Make a Host key (no personal details)", function () { var l = ask("A name for this Host (for example Priya, Hall A)"); if (l === null) return; api("POST", base + "/host", { label: l }).then(function (k) { put([msg(T("Copy this Host key or link now. It is shown once.")), el("code", { style: "display:block;word-break:break-all;padding:8px;background:#f3f5fa", text: k.link }), msg(k.rule), btn("Back", function () { views.keys(); }, true)]); }, fail); }, true));
        (r.keys || []).forEach(function (k) { nodes.push(el("div", { style: "padding:6px 0;border-bottom:1px solid #e3e6ee" }, [el("span", { text: (k.label || k.id) + " · " + k.kind + " · " + when(k.createdMs) + (k.retired ? " · " + T("retired") : "") + " " }), k.retired ? null : btn("Retire", function () { api("POST", base + "/keys/revoke", { id: k.id }).then(function () { views.keys(); }, fail); }, true)])); });
        put(nodes);
      }, fail);
    },
    claims: function () {
      var id = eid(); if (!id) return put([msg(T("Open a game first."), true)]);
      var base = "/api/z/" + encodeURIComponent(id) + "/v2/claimreview";
      api("GET", base).then(function (r) {
        var nodes = [msg(T("A Host can approve or reject a claim with a short reason the player reads. The software still decides the winners; a rejected claim is held back from the prize hand-over."))];
        nodes.push(btn(r.on ? "Switch claim review off" : "Switch claim review on", function () { api("POST", base + "/mode", { on: !r.on }).then(function () { views.claims(); }, fail); }, true));
        (r.claims || []).forEach(function (c) {
          var st = c.review ? (c.review.decision === "reject" ? T("rejected") + ": " + c.review.reason : T("approved")) : T("not reviewed");
          var row = el("div", { style: "padding:6px 0;border-bottom:1px solid #e3e6ee" }, [el("div", { text: T("Ticket") + " " + c.ticket + " · " + c.pattern + " · " + st })]);
          if (r.on) { row.appendChild(btn("Approve", function () { api("POST", base, { ticket: c.ticket, pattern: c.pattern, round: c.round, decision: "approve" }).then(function () { views.claims(); }, fail); }, true)); row.appendChild(btn("Reject", function () { var why = ask("A short reason the player will read"); if (why === null) return; api("POST", base, { ticket: c.ticket, pattern: c.pattern, round: c.round, decision: "reject", reason: why }).then(function () { views.claims(); }, fail); }, true)); }
          nodes.push(row);
        });
        put(nodes);
      }, fail);
    },
    host: function () {
      var id = eid(); if (!id) return put([msg(T("Open a game first."), true)]);
      var base = "/api/z/" + encodeURIComponent(id) + "/v2/host";
      api("GET", base + "/requests").then(function (r) {
        var nodes = [msg(T("A Host can step down (their key stops working and the organizer is told) or ask for a hand-over. During a live game a hand-over happens only when the organizer approves."))];
        nodes.push(btn("I want to step down", function () { if (!W.confirm(T("Step down? Your key will stop working."))) return; api("POST", base + "/stepdown", {}).then(function (x) { put([msg(x.message)]); }, fail); }, true));
        nodes.push(btn("Ask for a hand-over", function () { var n = ask("A short note for the organizer"); if (n === null) return; api("POST", base + "/handover", { note: n }).then(function (x) { put([msg(x.message)]); }, fail); }, true));
        (r.notices || []).forEach(function (n) { nodes.push(msg(when(n.atMs) + " · " + n.text)); });
        (r.requests || []).forEach(function (x) {
          var row = el("div", { style: "padding:6px 0;border-bottom:1px solid #e3e6ee" }, [el("div", { text: (x.host || T("A Host")) + " · " + x.state + (x.note ? " · " + x.note : "") })]);
          if (x.state === "pending") { row.appendChild(btn("Approve and make a new Host key", function () { var l = ask("A name for the new Host"); if (l === null) return; api("POST", base + "/requests/" + x.id, { approve: true, label: l }).then(function (k) { put([msg(T("Copy the new Host link now. It is shown once.")), el("code", { style: "display:block;word-break:break-all;padding:8px;background:#f3f5fa", text: k.link })]); }, fail); }, true)); row.appendChild(btn("Decline", function () { api("POST", base + "/requests/" + x.id, { approve: false }).then(function () { views.host(); }, fail); }, true)); }
          nodes.push(row);
        });
        put(nodes);
      }, function () { put([msg(T("Only the organizer and the Hosts of a game see this."), true)]); });
    },
    support: function () {
      var id = eid();
      api("GET", "/api/v2/support").then(function (r) {
        var nodes = [msg(T("Tell us what you need. Please do not type players' names or mobile numbers.")), btn("New ticket", function () {
          var s = ask("A short subject"); if (s === null) return; var b = ask("What do you need?"); if (b === null) return;
          api("POST", "/api/v2/support", { subject: s, body: b, game: id || undefined }).then(function () { views.support(); }, fail);
        })];
        (r.tickets || []).forEach(function (t) { nodes.push(el("div", { style: "padding:6px 0;border-bottom:1px solid #e3e6ee;cursor:pointer", onclick: function () { api("GET", "/api/v2/support/" + t.id).then(function (d) { put([el("strong", { text: d.subject })].concat(d.messages.map(function (m) { return el("p", { style: "margin:6px 0", text: m.who + " · " + when(m.atMs) + " — " + m.body }); })).concat([btn("Reply", function () { var x = ask("Your message"); if (x === null) return; api("POST", "/api/v2/support/" + t.id, { body: x }).then(function () { views.support(); }, fail); }), btn("Back", function () { views.support(); }, true)])); }, fail); }, text: "#" + t.id + " · " + t.subject + " · " + t.status })); });
        put(nodes);
      }, fail);
    }
  };
  var LABELS = { receipts: "Receipts and payments", certs: "Certificates", data: "Download data", keys: "Game keys", claims: "Claim review", host: "Host hand-over", support: "Support" };
  function show(name) { current = name; Array.prototype.forEach.call(tabs.children, function (b) { b.setAttribute("aria-pressed", b.dataset.t === name ? "true" : "false"); b.style.fontWeight = b.dataset.t === name ? "700" : "400"; }); put([msg(T("Loading…"))]); views[name](); }
  function open() {
    if (box) { box.hidden = false; return show(current); }
    box = el("div", { role: "dialog", "aria-modal": "true", "aria-label": T("More tools"), style: "position:fixed;inset:0;z-index:60;background:rgba(10,20,40,.45);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto" });
    var card = el("div", { style: "background:#fff;color:#1a2233;max-width:720px;width:100%;border-radius:12px;padding:16px;box-shadow:0 12px 40px rgba(0,0,0,.3)" });
    tabs = el("div", { style: "display:flex;flex-wrap:wrap;margin-bottom:8px" }, Object.keys(LABELS).map(function (k) { var b = btn(LABELS[k], function () { show(k); }, true); b.dataset.t = k; return b; }));
    body = el("div", { style: "min-height:120px" });
    card.appendChild(el("div", { style: "display:flex;justify-content:space-between;align-items:center" }, [el("h2", { style: "margin:0;font-size:1.15rem", text: T("More tools") }), btn("Close", function () { box.hidden = true; }, true)]));
    card.appendChild(tabs); card.appendChild(body); box.appendChild(card); D.body.appendChild(box); show(current);
  }
  function start() {
    if (!key() || D.getElementById("ctv2btn")) return;
    var b = el("button", { id: "ctv2btn", type: "button", style: "position:fixed;left:10px;bottom:10px;z-index:44;min-height:44px;padding:6px 14px;border-radius:22px;border:1px solid #0b3d91;background:#fff;color:#0b3d91;font-size:.9rem;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2)", onclick: open, text: T("More tools") });
    D.body.appendChild(b);
  }
  // the key arrives after sign-in: look again for a while, then every few seconds (cheap: it only looks at the stored key)
  var n = 0; start(); var iv = setInterval(function () { start(); if (D.getElementById("ctv2btn") || ++n > 600) clearInterval(iv); }, 1000);
  W.CTV2 = { open: open };
})();
