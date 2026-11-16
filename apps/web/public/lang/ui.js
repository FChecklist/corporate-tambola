/* Language mechanism (V2 item 1). A language is ONE FILE that calls CTLang.add(code, name, { msg: {...claim notices...}, ui: { "English phrase": "translation" } }).
   Each person chooses the language for their own screen only: the choice lives in this browser (localStorage "ctz-lang") and is never sent anywhere, so it cannot change what anyone else sees. English is the default
   and, while it is chosen, nothing here runs. A phrase that has no translation stays in English. A phrase may carry {1} {2} for numbers or names that change: "Ticket {1}": "टिकट {1}". */
(function () {
  "use strict";
  if (window.CTLang) return;
  var langs = {}, compiled = {}, current = "en", obs = null, busy = false;
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, CODE: 1, PRE: 1, NOSCRIPT: 1 };
  function stored() { try { return localStorage.getItem("ctz-lang") || "en"; } catch (e) { return "en"; } }
  function esc(s) { return s.replace(/[.*+?^$()|[\]\\]/g, "\\$&"); }
  function compile(code) {
    var ui = (langs[code] && langs[code].ui) || {}, exact = {}, pats = [];
    Object.keys(ui).forEach(function (k) {
      if (/\{\d\}/.test(k)) { var re = new RegExp("^" + esc(k).replace(/\{\d\}/g, "(.+?)") + "$"); pats.push([re, ui[k]]); } else exact[k] = ui[k];
    });
    compiled[code] = { exact: exact, pats: pats };
  }
  function tr(text, code) {
    var c = compiled[code]; if (!c) return null;
    var t = String(text).replace(/\s+/g, " ").trim(); if (!t) return null;
    if (Object.prototype.hasOwnProperty.call(c.exact, t)) return c.exact[t];
    for (var i = 0; i < c.pats.length; i++) { var m = c.pats[i][0].exec(t); if (m) return c.pats[i][1].replace(/\{(\d)\}/g, function (_, n) { return m[+n] === undefined ? "" : m[+n]; }); }
    return null;
  }
  function walk(root, code) {
    if (!root) return;
    if (root.nodeType === 3) {
      var p = root.parentNode; if (p && SKIP[p.nodeName]) return;
      var r = tr(root.nodeValue || "", code);
      if (r !== null && root.nodeValue !== r) { var lead = (root.nodeValue.match(/^\s*/) || [""])[0], tail = (root.nodeValue.match(/\s*$/) || [""])[0]; root.nodeValue = lead + r + tail; }
      return;
    }
    if (root.nodeType !== 1 || root.nodeName === "SCRIPT" || root.nodeName === "STYLE") return;
    ["placeholder", "title", "aria-label", "alt"].forEach(function (a) { if (root.hasAttribute && root.hasAttribute(a)) { var v = root.getAttribute(a), r2 = tr(v, code); if (r2 !== null && v !== r2) root.setAttribute(a, r2); } }); // a box's hint is words for the person; what they typed (its value) is never touched
    if (SKIP[root.nodeName]) return;
    for (var n = root.firstChild; n; n = n.nextSibling) walk(n, code);
  }
  function run(roots) { if (current === "en" || !compiled[current]) return; busy = true; try { roots.forEach(function (r) { walk(r, current); }); } finally { busy = false; } }
  function watch() {
    if (obs || current === "en" || typeof MutationObserver === "undefined") return;
    var pending = [], timer = 0;
    obs = new MutationObserver(function (list) {
      if (busy) return;
      list.forEach(function (m) { if (m.type === "characterData") pending.push(m.target); else m.addedNodes.forEach(function (n) { pending.push(n); }); });
      if (!timer) timer = setTimeout(function () { timer = 0; var xs = pending; pending = []; run(xs); }, 120);
    });
    obs.observe(document.body || document.documentElement, { childList: true, subtree: true, characterData: true });
  }
  function unwatch() { if (obs) { obs.disconnect(); obs = null; } }
  function set(code) {
    code = langs[code] || code === "en" ? code : "en";
    var was = current; current = code;
    try { document.documentElement.lang = code; } catch (e) { /* no document yet */ }
    if (code === "en") { unwatch(); if (was !== "en") { try { location.reload(); } catch (e) { /* the page keeps its words until the next open */ } } return; }
    if (document.body) { run([document.body]); watch(); }
  }
  function add(code, name, pack) {
    langs[code] = { name: name, ui: (pack && pack.ui) || {}, msg: (pack && pack.msg) || {} }; compile(code);
    var ZG = window.ZG;
    if (ZG) { if (ZG.LANGS) ZG.LANGS[code] = name; if (ZG.TABLES) ZG.TABLES[code] = Object.assign({}, ZG.TABLES[code] || {}, langs[code].msg); }
    if (stored() === code) {
      current = code; if (ZG && ZG.setLang) ZG.setLang(code);
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { set(code); }); else set(code);
    }
  }
  // follow the dropdown the pages already have: it calls ZG.setLang(code)
  if (window.ZG && window.ZG.setLang && !window.ZG.__ctl) {
    var orig = window.ZG.setLang;
    window.ZG.setLang = function (c) { var r = orig.apply(this, arguments); set(r); return r; };
    window.ZG.__ctl = 1;
  }
  window.CTLang = {
    add: add, current: function () { return current; },
    t: function (en) { var r = current === "en" ? null : tr(en, current); return r === null ? en : r; },
    apply: function (root) { run([root || document.body]); },
    languages: function () { return Object.keys(langs).map(function (c) { return [c, langs[c].name]; }); }
  };
})();
