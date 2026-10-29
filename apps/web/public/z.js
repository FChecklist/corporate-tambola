/* Corporate Tambola, phone page for zero-server engagements. All game logic lives in zgame.js (window.ZG); this file only draws it. */
(function () {
  const ZG = window.ZG;
  const $app = document.getElementById("app");
  // A tap is never lost to a redraw: while a finger or mouse button is down the screen is not redrawn (it is redrawn right after the release), nor while text is selected.
  const HOLD = (() => { let down = 0, pend = []; const set = () => { down = Date.now(); }, clr = () => { if (!down) return; down = 0; if (pend.length) { const fs = pend; pend = []; setTimeout(() => fs.forEach((f) => f()), 40); } };
    ["pointerdown", "touchstart", "mousedown"].forEach((e) => document.addEventListener(e, set, true)); ["pointerup", "pointercancel", "touchend", "touchcancel", "mouseup"].forEach((e) => document.addEventListener(e, clr, true));
    return { held: (f) => { if (down && Date.now() - down < 2500) { if (!pend.includes(f)) pend.push(f); return true; } try { const s = window.getSelection && window.getSelection(); if (s && !s.isCollapsed && s.anchorNode && document.contains(s.anchorNode)) return true; } catch {} return false; } }; })();
  /** keeps the scroll position of inner scrolling boxes, and the focused field with its caret, across a redraw of `root` */
  const KEEP = (root, redraw) => { const sc = Array.from(root.querySelectorAll("[id],.zhcard,.zinvsheet,.bpscroll")).filter((e) => e.scrollTop > 0).map((e) => [e.id, e.className, e.scrollTop]); const af = document.activeElement, fid = af && af.id && root.contains(af) ? af.id : "", ss = fid && af.selectionStart != null ? [af.selectionStart, af.selectionEnd] : null;
    redraw(); for (const [id, cn, top] of sc) { const e = id ? document.getElementById(id) : root.getElementsByClassName(cn)[0]; if (e) e.scrollTop = top; }
    if (fid) { const e = document.getElementById(fid); if (e && e !== document.activeElement) { try { e.focus({ preventScroll: true }); if (ss && e.setSelectionRange) e.setSelectionRange(ss[0], ss[1]); } catch {} } } };
  const q = new URLSearchParams(location.search);
  const LAST = "ct-last-eid";
  const DEMO = window.__CT_DEMO || null; // the free demo (demo.html) runs this same page with a preloaded script and nothing stored on our side
  let EID = DEMO ? DEMO.eid : (q.get("e") || location.hash.replace(/^#/, "") || "").trim();
  if (!DEMO) try { if (EID) localStorage.setItem(LAST, EID); else EID = localStorage.getItem(LAST) || ""; } catch {} // the installed app opens without the link: use the last game
  const BASE = (q.get("api") || "").replace(/\/$/, "");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = DEMO ? DEMO.store : { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  const RAW = /^http \d+$|^offline$/; // what a failed call says when the server gave no words: never put in front of a person
  const LIMIT = (method, path) => (method === "POST" ? (/\/(claims|bogey)$/.test(path) ? 8000 : 20000) : /\/(info|checkin)(\?|$)/.test(path) ? 20000 : 0); // a call that hangs is given up (a claim after 8 s, the others after 20 s), so nothing waits for ever; the big public lists are left alone
  const callApi = async (method, path, body) => {
    let r;
    try { const short = method === "POST" && /\/claims$/.test(path) && ZG.compactClaim ? ZG.compactClaim(body) : null; /* one claim travels as a short text; the server takes both forms */ r = await fetch(BASE + path, short ? { method, headers: { "content-type": "text/plain" }, body: short } : { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch { throw new Error("offline"); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const err = Object.assign(new Error(j.error || "http " + r.status), { status: r.status, code: j.code, body: j }); if (window.CTG) CTG.wrap(err, { what: method + " " + path.split("?")[0].replace(/\/[A-Za-z0-9_-]{6,}(?=\/|$)/g, "/...") }); throw err; }
    return j;
  };
  const rawApi = DEMO ? DEMO.api : (method, path, body) => {
    const work = callApi(method, path, body), lim = LIMIT(method, path); if (!lim) return work;
    let tm; return Promise.race([work, new Promise((_, no) => { tm = setTimeout(() => no(new Error("offline")), lim); })]).finally(() => clearTimeout(tm)); // given up after the limit: the caller treats it like a lost connection and tries again (a claim sent twice is stored once)
  };
  // ---------- what the game's public settings say besides the plan: the brand strip, a cancelled game; and a personal invite link's token ----------
  const TOKEN = (q.get("t") || "").trim().slice(0, 80); // a personal link: sent as `token` when joining, so no mobile number is needed
  const INFO = { brand: null, cancelled: null, dns: false, demo: false }; // demo = a DEMO GAME (free, up to 10 people): every screen says so, and the ticket carries a DEMO GAME watermark until the organizer makes it a real game // dns = "this game did not start": nobody paid, the time and 20 hours passed, the guest data was erased
  const cleanBrand = (b) => {
    if (!b || typeof b !== "object") return null;
    const name = String(b.name == null ? "" : b.name).replace(/\s+/g, " ").trim().slice(0, 60);
    let color = String(b.color || ""); if (/^#[0-9a-f]{3}$/i.test(color)) color = "#" + color.slice(1).split("").map((c) => c + c).join("");
    if (!/^#[0-9a-f]{6}$/i.test(color)) color = "#0B3D91";
    const logo = typeof b.logo === "string" && b.logo.length < 90000 && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(b.logo) ? b.logo : ""; // only a small picture that travels inside the settings: never an outside address
    if (!name && !logo) return null;
    const lin = (h) => { const c = parseInt(h, 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * lin(color.slice(1, 3)) + 0.7152 * lin(color.slice(3, 5)) + 0.0722 * lin(color.slice(5, 7));
    return { name, color, logo, fg: (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.05) ? "#ffffff" : "#111111" }; // whichever of white and near-black reads better on the colour
  };
  const noteInfo = (r, fromJoin) => {
    if (!r || typeof r !== "object") return;
    if ("brand" in r && !(fromJoin && INFO.brand)) { INFO.brand = cleanBrand(r.brand); if (!DEMO && EID && INFO.brand && INFO.brand.logo !== undefined) { try { store.set("ctz:" + EID + ":brand", JSON.stringify(INFO.brand)); } catch { /* storage full or blocked: the strip just is not kept */ } } } // a join answer carries the brand without its logo: never let it replace the full one read from info
    if (r.didNotStart === true) INFO.dns = true; else if ("startRound" in r && !fromJoin) INFO.dns = false;
    if ("verify" in r) { INFO.verify = r.verify === "id" || r.verify === "either" || r.verify === "both" ? r.verify : "mobile"; INFO.empOnly = r.employeesOnly === true; }
    if ("rehearsal" in r) INFO.rehearsal = r.rehearsal && typeof r.rehearsal === "object" ? r.rehearsal : null; // a rehearsal: its pages carry the REHEARSAL block and, once it is over, the calm "over" page
    if ("startMs" in r && Number.isFinite(Number(r.startMs))) { INFO.startMs = Number(r.startMs); INFO.manualStart = r.startMode === "manual"; } // TA22: the join page says "already running" before the person joins
    if ("checkin" in r) INFO.checkin = r.checkin === true; // a game made after the check-in rule: the ticket opens only after the person marks themselves present
    if ("tickets" in r) INFO.demo = r.demo === true; // the public settings say whether it is a demo game; after a paid conversion the next read clears it
    if ("cancelled" in r || "startRound" in r) INFO.cancelled = r.cancelled ? { message: String(r.message || "").slice(0, 200) } : null;
  };
  if (!DEMO && EID) { try { const kept = JSON.parse(store.get("ctz:" + EID + ":brand") || "null"); if (kept && typeof kept === "object") INFO.brand = cleanBrand(kept); } catch { /* nothing kept yet */ } } // the installed app shows the organizer's logo and name even before (or without) the network
  window.addEventListener("online", () => { if (window.__ctzOff) location.reload(); else if (EID && rt.phase === "boot") bootUp(); }); // back online while the page could not reach the game: open it again by itself
  let lastJoin = null; // what the server said when a join was refused: the page decides what to show from it
  const api = async (method, path, body) => {
    const isJoin = method === "POST" && /\/join$/.test(path);
    const sent = isJoin && body && typeof body === "object" ? Object.assign({}, body, TOKEN && !body.token ? { token: TOKEN } : {}, J.consent ? { consent: J.consent } : {}) : body; // the join carries the ticked K4 boxes; the server refuses it without them
    try {
      const r = await rawApi(method, path, sent);
      if (isJoin) { lastJoin = null; noteInfo(r, true); } else if (method === "GET" && /\/info$/.test(path)) noteInfo(r);
      return r;
    } catch (e) { if (isJoin) lastJoin = { status: e && e.status, code: (e && e.code) || (e && e.body && e.body.code) || "", body: (e && e.body) || {}, message: String((e && e.message) || "") }; throw e; }
  };
  const INVITE_FROM = Number(q.get("from")) || 0, INVITE_CAT = q.get("c") || "";
  const NAMES = { early5: "Early Five", top: "Top line", mid: "Middle line", bot: "Bottom line", corners: "Four corners", star: "Star", full: "Full house" };
  // the newer houses come from the one shared table (ZG.PRIZE_HOUSES); the seven original names above keep their spelling
  ZG.PRIZE_HOUSES.forEach((h) => { if (!NAMES[h.id]) NAMES[h.id] = h.label; });
  const HOW = Object.fromEntries(ZG.PRIZE_HOUSES.map((h) => [h.id, h.how]));
  const howLine = (key) => (HOW[key] ? `<small class="zsmall zhow" style="margin:0">${esc(HOW[key])}</small>` : "");
  const getPublic = DEMO ? DEMO.getPublic : async (url) => { let r; try { r = await fetch(url, { cache: "no-store" }); } catch { throw new Error("offline"); } if (!r.ok) throw Object.assign(new Error("http " + r.status), { status: r.status }); return r.json(); };
  const rt = new ZG.PhoneRuntime(EID, DEMO ? { api, getPublic, beacon: DEMO.beacon, verify: DEMO.verify, mono: DEMO.mono, store } : { api, getPublic, beacon: {}, mono: () => performance.now(), store });
  if (DEMO) rt.beatOn = false; // the free demo has no server to ask
  // The claim signal is asked at this phone's own slot (ticket number, see beat.ts): ~120 ms before the moment the clock is checked again, then the ask goes out exactly on time. A hidden page asks nothing (beatOn).
  if (!DEMO) { rt.externalBeat = true; const arm = () => { const ms = rt.msToNextBeat(), early = Math.max(0, ms - 120); setTimeout(() => { const left = rt.msToNextBeat(); setTimeout(() => { try { rt.beatNow(); } catch { /* next slot */ } arm(); }, left > ZG.BEAT.beatPeriodMs(rt.cap) - 250 ? 0 : left); }, ms < 120 ? 0 : early); }; arm(); }
  let lastLen = 0, firstPaint = true, sound = store.get("ctz-sound") === "on", timer = null; /* TA21: the numbers are NOT read aloud until the player switches sound on (an open office must stay quiet) */
  if (window.TBAudio) TBAudio.enabled = sound;
  const clock = (s) => { s = Math.max(0, Math.round(s)); return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":"); }; // 00:12:34
  const GRACE_SECS = ZG.GRACE_ROUNDS * 3;
  const fmt = (s) => (s >= 90 ? Math.round(s / 60) + " min" : s + "s");

  // ---------- the company strip at the top of the ticket page (colour and name set by the organizer; the small picture travels inside the settings) ----------
  const brandStrip = (sndBtn) => {
    const b = INFO.brand; if (!b) return `<div class="zbar"><div class="zbrand zdef" data-bg="#0B3D91" data-fg="#ffffff"><b>CORPORATE TAMBOLA</b></div>${sndBtn || ""}</div>`; // no company brand set: the ticket carries our own name in writing
    return `<div class="zbar"><div class="zbrand" data-bg="${esc(b.color)}" data-fg="${esc(b.fg)}">${b.logo ? `<img class="zblogo" alt="" src="${esc(b.logo)}">` : ""}${b.name ? `<b>${esc(b.name)}</b>` : ""}</div>${sndBtn || ""}</div><div class="zpow">Powered by Corporate Tambola</div>`;
  };
  const paintBrand = () => document.querySelectorAll(".zbrand").forEach((el) => { if (!el.classList.contains("zdef")) el.style.background = el.dataset.bg; el.style.color = el.dataset.fg; }); // set from the script, so a strict style policy never blocks the colour

  // ---------- mobile numbers from anywhere: the person picks the country (India is the start) and types the number as they know it. Nothing here is a check of the number itself: we only turn what was typed into +<country code><number> so the same person is the same person in every game. ----------
  const CT_ROWS = "AF|Afghanistan|93;AL|Albania|355;DZ|Algeria|213;AS|American Samoa|1;AD|Andorra|376;AO|Angola|244;AI|Anguilla|1;AG|Antigua and Barbuda|1;AR|Argentina|54;AM|Armenia|374;AW|Aruba|297;AU|Australia|61;AT|Austria|43;AZ|Azerbaijan|994;BS|Bahamas|1;BH|Bahrain|973;BD|Bangladesh|880;BB|Barbados|1;BY|Belarus|375;BE|Belgium|32;BZ|Belize|501;BJ|Benin|229;BM|Bermuda|1;BT|Bhutan|975;BO|Bolivia|591;BA|Bosnia and Herzegovina|387;BW|Botswana|267;BR|Brazil|55;VG|British Virgin Islands|1;BN|Brunei|673;BG|Bulgaria|359;BF|Burkina Faso|226;BI|Burundi|257;KH|Cambodia|855;CM|Cameroon|237;CA|Canada|1;CV|Cape Verde|238;KY|Cayman Islands|1;CF|Central African Republic|236;TD|Chad|235;CL|Chile|56;CN|China|86;CO|Colombia|57;KM|Comoros|269;CG|Congo|242;CD|Congo (Democratic Republic)|243;CK|Cook Islands|682;CR|Costa Rica|506;CI|Cote d'Ivoire|225;HR|Croatia|385;CU|Cuba|53;CW|Curacao|599;CY|Cyprus|357;CZ|Czechia|420;DK|Denmark|45;DJ|Djibouti|253;DM|Dominica|1;DO|Dominican Republic|1;EC|Ecuador|593;EG|Egypt|20;SV|El Salvador|503;GQ|Equatorial Guinea|240;ER|Eritrea|291;EE|Estonia|372;SZ|Eswatini|268;ET|Ethiopia|251;FK|Falkland Islands|500;FO|Faroe Islands|298;FJ|Fiji|679;FI|Finland|358;FR|France|33;GF|French Guiana|594;PF|French Polynesia|689;GA|Gabon|241;GM|Gambia|220;GE|Georgia|995;DE|Germany|49;GH|Ghana|233;GI|Gibraltar|350;GR|Greece|30;GL|Greenland|299;GD|Grenada|1;GP|Guadeloupe|590;GU|Guam|1;GT|Guatemala|502;GG|Guernsey|44;GN|Guinea|224;GW|Guinea-Bissau|245;GY|Guyana|592;HT|Haiti|509;HN|Honduras|504;HK|Hong Kong|852;HU|Hungary|36;IS|Iceland|354;IN|India|91;ID|Indonesia|62;IR|Iran|98;IQ|Iraq|964;IE|Ireland|353;IM|Isle of Man|44;IL|Israel|972;IT|Italy|39;JM|Jamaica|1;JP|Japan|81;JE|Jersey|44;JO|Jordan|962;KZ|Kazakhstan|7;KE|Kenya|254;KI|Kiribati|686;XK|Kosovo|383;KW|Kuwait|965;KG|Kyrgyzstan|996;LA|Laos|856;LV|Latvia|371;LB|Lebanon|961;LS|Lesotho|266;LR|Liberia|231;LY|Libya|218;LI|Liechtenstein|423;LT|Lithuania|370;LU|Luxembourg|352;MO|Macau|853;MG|Madagascar|261;MW|Malawi|265;MY|Malaysia|60;MV|Maldives|960;ML|Mali|223;MT|Malta|356;MH|Marshall Islands|692;MQ|Martinique|596;MR|Mauritania|222;MU|Mauritius|230;YT|Mayotte|262;MX|Mexico|52;FM|Micronesia|691;MD|Moldova|373;MC|Monaco|377;MN|Mongolia|976;ME|Montenegro|382;MS|Montserrat|1;MA|Morocco|212;MZ|Mozambique|258;MM|Myanmar|95;NA|Namibia|264;NR|Nauru|674;NP|Nepal|977;NL|Netherlands|31;NC|New Caledonia|687;NZ|New Zealand|64;NI|Nicaragua|505;NE|Niger|227;NG|Nigeria|234;KP|North Korea|850;MK|North Macedonia|389;MP|Northern Mariana Islands|1;NO|Norway|47;OM|Oman|968;PK|Pakistan|92;PW|Palau|680;PS|Palestine|970;PA|Panama|507;PG|Papua New Guinea|675;PY|Paraguay|595;PE|Peru|51;PH|Philippines|63;PL|Poland|48;PT|Portugal|351;PR|Puerto Rico|1;QA|Qatar|974;RE|Reunion|262;RO|Romania|40;RU|Russia|7;RW|Rwanda|250;KN|Saint Kitts and Nevis|1;LC|Saint Lucia|1;VC|Saint Vincent and the Grenadines|1;WS|Samoa|685;SM|San Marino|378;ST|Sao Tome and Principe|239;SA|Saudi Arabia|966;SN|Senegal|221;RS|Serbia|381;SC|Seychelles|248;SL|Sierra Leone|232;SG|Singapore|65;SX|Sint Maarten|1;SK|Slovakia|421;SI|Slovenia|386;SB|Solomon Islands|677;SO|Somalia|252;ZA|South Africa|27;KR|South Korea|82;SS|South Sudan|211;ES|Spain|34;LK|Sri Lanka|94;SD|Sudan|249;SR|Suriname|597;SE|Sweden|46;CH|Switzerland|41;SY|Syria|963;TW|Taiwan|886;TJ|Tajikistan|992;TZ|Tanzania|255;TH|Thailand|66;TL|Timor-Leste|670;TG|Togo|228;TO|Tonga|676;TT|Trinidad and Tobago|1;TN|Tunisia|216;TR|Turkey|90;TM|Turkmenistan|993;TC|Turks and Caicos Islands|1;TV|Tuvalu|688;UG|Uganda|256;UA|Ukraine|380;AE|United Arab Emirates|971;GB|United Kingdom|44;US|United States|1;UY|Uruguay|598;VI|US Virgin Islands|1;UZ|Uzbekistan|998;VU|Vanuatu|678;VA|Vatican City|39;VE|Venezuela|58;VN|Vietnam|84;YE|Yemen|967;ZM|Zambia|260;ZW|Zimbabwe|263";
  const CT_COUNTRIES = CT_ROWS.split(";").map((r) => { const p = r.split("|"); return { iso: p[0], name: p[1], dial: p[2] }; });
  const CT_INDIA = CT_COUNTRIES.find((c) => c.iso === "IN");
  const CT_BY_ISO = (iso) => CT_COUNTRIES.find((c) => c.iso === iso) || CT_INDIA;
  const CT_MAIN = { 1: "US", 7: "RU", 44: "GB", 39: "IT", 262: "RE" }; // a code that several places share: the biggest one is chosen when only the code is known
  const CT_BY_DIAL = (dial) => CT_COUNTRIES.find((x) => x.iso === CT_MAIN[dial]) || CT_COUNTRIES.find((x) => x.dial === dial);
  /** What a person pastes is cleaned first: direction marks and other invisible characters go, typographic dashes become "-", digits typed in other scripts (Arabic-Indic, Devanagari, full-width) become 0-9, "(+44) 7911..." loses its opening bracket and "+44 (0)7911..." loses its "(0)" (that 0 is the dial-inside-the-country zero, not part of the international number). */
  const CT_CLEAN = (typed) => {
    const digit = (base) => (x) => String.fromCharCode(x.charCodeAt(0) - base + 48);
    let t = String(typed == null ? "" : typed)
      .replace(/[​-‏‪-‮⁦-⁩﻿]/g, "")
      .replace(/[   ]/g, " ")
      .replace(/[‐-―−]/g, "-")
      .replace(/＋/g, "+")
      .replace(/[０-９]/g, digit(0xFF10)).replace(/[٠-٩]/g, digit(0x0660)).replace(/[۰-۹]/g, digit(0x06F0)).replace(/[०-९]/g, digit(0x0966))
      .trim();
    t = t.replace(/^\(\s*(\+|00)/, "$1");
    if (/^(\+|00)/.test(t)) t = t.replace(/\(\s*0\s*\)/g, "");
    return t;
  };
  const CT_ZERO_STAYS = { CI: 1 }; // a country whose numbers really begin with 0 (the others drop the 0 people dial inside their own country)
  /** What the number box and the country list say, as one number. Country codes never start with 0 and none is the start of another, so a pasted +<code> is read exactly. India is held to the shape of an Indian mobile number; every other country is only held to the length the phone networks allow (8 to 15 digits in all), because the numbers of different countries are 8, 9, 10, 11 or 12 digits long and a real number must never be turned away for its length. */
  const CTPhone = {
    countries: CT_COUNTRIES,
    byIso: CT_BY_ISO,
    parse(iso, typed) {
      const t = CT_CLEAN(typed);
      if (!t) return { ok: false, empty: true, why: "" };
      if (/[^\d\s+\-()./]/.test(t)) return { ok: false, why: "A mobile number has digits only. Spaces, + and - are fine." };
      let c = CT_BY_ISO(iso), d = t.replace(/\D/g, "");
      if (t[0] === "+" || t.slice(0, 2) === "00") { // a whole number with its country code: it says which country it is
        const n = d.replace(/^00/, ""), len = [1, 2, 3].find((k) => CT_COUNTRIES.some((x) => x.dial === n.slice(0, k)));
        if (!len) return { ok: false, why: "We do not know that country code. Choose the country from the list and type the rest of the number." };
        const dial = n.slice(0, len);
        if (c.dial !== dial) c = CT_BY_DIAL(dial);
        d = n.slice(len);
      } else if (c.dial === "91") {
        if (d.length === 12 && d.slice(0, 2) === "91") d = d.slice(2); // 91 98765 43210 typed without the plus
        else if (d.length === 11 && d[0] === "0") d = d.slice(1);
      } else if (c.dial === "1" && d.length === 11 && d[0] === "1") d = d.slice(1); // 1 555 123 4567 typed the way people dial inside the United States and Canada
      else if (d[0] === "0" && !CT_ZERO_STAYS[c.iso]) d = d.slice(1); // the 0 people dial inside their country is not part of the international number
      if (c.dial === "91") {
        if (d.length !== 10) return { ok: false, why: d.length < 10 ? "An Indian mobile number has 10 digits. Please check it." : "An Indian mobile number has 10 digits. Please remove the extra digits." };
        if (!/^[6-9]/.test(d)) return { ok: false, why: "An Indian mobile number starts with 6, 7, 8 or 9." };
      } else {
        const all = c.dial.length + d.length;
        if (all < 8) return { ok: false, why: "That looks too short for a mobile number in " + c.name + ". Please check it." };
        if (all > 15) return { ok: false, why: "That looks too long for a mobile number in " + c.name + ". Please check it." };
      }
      return { ok: true, iso: c.iso, cc: c.dial, national: d, e164: "+" + c.dial + d };
    },
    /** "+91 98765 43210" as shown back to the person */
    show(p) { return p && p.ok ? "+" + p.cc + " " + (p.cc === "91" ? p.national.slice(0, 5) + " " + p.national.slice(5) : p.national) : ""; },
  };
  window.CTPhone = CTPhone;
  const ccOptions = (sel) => [CT_INDIA].concat(CT_COUNTRIES.filter((c) => c.iso !== "IN").sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))).map((c) => `<option value="${c.iso}"${c.iso === sel ? " selected" : ""}>${esc(c.name)} (+${c.dial})</option>`).join("");
  const CC_KEY = "ctz-cc";

  // ---------- joining: a personal link needs no number; a number may be asked for; a request may have to wait to be let in; a person may have been removed ----------
  const J = { k4: {}, consent: null, mode: "", phone: "", cc: (() => { try { return CT_BY_ISO(store.get(CC_KEY)).iso; } catch { return "IN"; } })(), e164: "", emp: "", name: "", wid: "", who: "", timer: null, retry: 0, busyTries: 0, polling: false, note: "" };
  const shownPhone = () => { const p = CTPhone.parse(J.cc, J.phone); return p.ok ? CTPhone.show(p) : String(J.phone || "").trim(); };
  const inviteOf = () => (INVITE_FROM ? { from: INVITE_FROM, cat: INVITE_CAT } : undefined);
  // What the organizer asked people to give to get in: a mobile number (default), an employee ID, or both. Employees only: no way in without the ID.
  // Every box says whether it must be filled: a small red * and "mandatory", or "(optional)" in brackets. "alt": one of the two is needed.
  const joinNeeds = () => {
    const vm = INFO.verify || "mobile", eo = !!INFO.empOnly;
    if (vm === "id") return eo ? { phone: "opt", emp: "req" } : { phone: "alt", emp: "alt" };
    if (vm === "either") return { phone: "alt", emp: "alt" };
    if (vm === "both") return eo ? { phone: "req", emp: "req" } : { phone: "req", emp: "opt" };
    return { phone: "req", emp: "none" };
  };
  const markOf = (need, other) => (need === "req" ? `<span class="zreq"><b aria-hidden="true">*</b> mandatory</span>` : need === "alt" ? `<span class="zreq"><b aria-hidden="true">*</b> mandatory without ${other}</span>` : `<span class="zopt">(optional)</span>`);
  const joinWho = () => {
    const vm = INFO.verify || "mobile", eo = !!INFO.empOnly, nd = joinNeeds(), pv = esc(J.phone || ""), ev = esc(J.emp || "");
    const phone = (label, hint) => `<label for="ph">${label} ${markOf(nd.phone, "an employee ID")}</label><div class="zphone"><select id="cc" aria-label="Country of your mobile number" autocomplete="off">${ccOptions(J.cc)}</select><input id="ph" type="tel" inputmode="tel" enterkeyhint="go" autocomplete="tel-national" placeholder="${J.cc === "IN" ? "98765 43210" : "Mobile number"}" ${nd.phone === "req" ? 'aria-required="true" ' : ""}value="${pv}"></div>${hint ? `<p class="zsmall" style="margin:2px 0 6px">${hint}</p>` : ""}`;
    const emp = (label, hint) => `<label for="emp">${label} ${markOf(nd.emp, "a mobile number")}</label><input id="emp" enterkeyhint="go" autocomplete="off" autocapitalize="characters" maxlength="30" ${nd.emp === "req" ? 'aria-required="true" ' : ""}value="${ev}">${hint ? `<p class="zsmall" style="margin:2px 0 6px">${hint}</p>` : ""}`;
    if (vm === "id") return emp("Your employee ID", eo ? "This game is for employees only." : "") + phone(eo ? "Your mobile number" : "No employee ID? Type your mobile number instead", eo ? "" : "Vendors, customers and families use their mobile number.");
    if (vm === "either") return phone("Your mobile number", "") + `<p class="zsmall" style="margin:0 0 6px;text-align:center"><b>or</b></p>` + emp("Your employee ID", "Give either one. Employees can use their ID; everyone else uses a mobile number.");
    if (vm === "both") return phone("Your mobile number", "") + emp(eo ? "Your employee ID" : "Your employee ID (employees only)", eo ? "This game is for employees only." : "Not an employee? Leave this empty.");
    return phone("Your mobile number", "");
  };
  const BUSY_TRIES = 15;
  const INAPP = /Instagram|FBAN|FBAV|LinkedInApp|Teams|Outlook|MicroMessenger|; wv\)/i.test(String(navigator.userAgent || "")); // a link opened inside another app's own browser: opening it later in Chrome or Safari looks like a second phone
  const joinView = (msg) => {
    if (J.mode === "removed") return `${brandStrip()}<div class="zhead"><b>Corporate Tambola</b></div><div class="zcard" role="status"><h2>You are not on this game's list</h2><p class="zsmall" style="margin:0">You were removed from this game, so there is no ticket for you here. If you think this is a mistake, please ask the person who invited you.</p></div>`;
    if (J.mode === "gone") return `${brandStrip()}<div class="zhead"><b>Corporate Tambola</b></div><div class="zcard" role="status"><h2>This link is not active any more</h2><p class="zsmall" style="margin:0">Please ask the person who invited you for a new link.</p></div>`;
    if (J.mode === "busy") return `${brandStrip()}<div class="zhead"><b>Corporate Tambola</b></div><div class="zcard zwait" role="status"><h2>Many people are joining right now</h2><p style="margin:0 0 6px">Your request is safe. We are trying again for you every few seconds. Keep this page open.</p><p class="zsmall" style="margin:0">Try ${J.busyTries} of ${BUSY_TRIES}.</p></div><div class="zagain"><button class="zbtn s alt" id="again" type="button">Stop and try myself</button></div>`; // a whole office joins from one address: the server asks for a short wait and the page asks again by itself
    if (J.mode === "waiting") return `${brandStrip()}<div class="zhead"><b>Corporate Tambola</b></div><div class="zcard zwait" role="status"><h2>Please wait a moment</h2><p style="margin:0 0 6px">${J.note ? esc(J.note) : `Your request to join has gone to ${J.who ? esc(J.who) : "the organizer"}.`}</p><p class="zsmall" style="margin:0">Keep this page open. As soon as you are let in, your ticket appears here.</p></div><div class="zagain">${J.emp || J.phone ? `<p class="zsmall" style="margin:0 0 6px">You asked with <b>${esc([J.emp, shownPhone()].filter(Boolean).join(" / "))}</b>. Is that wrong?</p>` : ""}<button class="zbtn s alt" id="again" type="button">Wrong number or ID? Type it again</button></div>`;
    if (J.mode === "declined" || J.mode === "lapsed") return `${brandStrip()}<div class="zhead"><b>Corporate Tambola</b></div><div class="zcard" role="status"><h2>${J.mode === "declined" ? "Your request was not accepted" : "This request has run out"}</h2><p class="zsmall" style="margin:0 0 8px">${J.mode === "declined" ? "You are not on the list for this game. Please ask the person who invited you." : "Nobody answered in time. You can ask again."}</p></div><div class="zagain"><button class="zbtn s alt" id="again" type="button">${J.mode === "declined" ? "Typed it wrong? Type it again" : "Ask again"}</button></div>`;
    const personal = !!TOKEN && J.mode !== "needPhone"; // a personal link is made for one person: no number to type unless the server asks
    return `${brandStrip()}<div class="zhead"><b>Corporate Tambola</b></div>
    <div class="zcard zform zjoin"><h2>Join the game</h2>
    <ol class="zsteps" aria-label="How to join"><li><b>1</b><span>Tick the boxes</span></li><li><b>2</b><span>${personal ? "Press the button" : "Type your number"}</span></li><li><b>3</b><span>Get your ticket</span></li></ol><p class="zsmall zdnd" id="dndtip">Tip: turn on Do Not Disturb so other apps do not interrupt your game.</p>
    ${lateTip()}<p class="zsmall" id="soundtip" style="margin:0 0 6px">Sound is off, so your phone stays quiet in the office. To hear the numbers read out, press Sound on your ticket page.</p><p class="zgoalline" style="margin:0 0 6px">Numbers are called one by one. Tap each one on your ticket as it is called. When a row or the whole ticket is complete, press Claim before the next number: the software checks it, no need to shout.</p>${INVITE_FROM ? `<div class="zbanner ok" style="margin:0 0 8px">You were invited by a colleague or family member. Join with your own mobile number to get your own ticket.</div>` : ""}
    ${INAPP ? `<p class="zsmall" style="margin:0 0 8px">Tip: if this link opened inside another app, open it in Chrome or Safari and always use that same one for this game.</p>` : ""}${J.mode === "needPhone" && !msg ? `<div class="zbanner info" role="status" style="margin:0 0 8px">${J.note ? esc(J.note) : "This link was already opened on another phone. Please type your mobile number to get your ticket."}</div>` : ""}
    ${DEMO ? "" : CBConsent.html("K4")}
    ${personal ? `<p class="zsmall" style="margin:0 0 6px">Your personal link is ready. Press the button to get your ticket.</p>` : joinWho()}
    ${personal ? "" : `<label for="nm">Your name <span class="zopt">(optional)</span></label><input id="nm" enterkeyhint="go" autocomplete="name" maxlength="60" value="${esc(J.name)}"><p class="zsmall" style="margin:2px 0 6px">Shown only to the organizer.</p>`}
    ${msg ? `<div class="zbanner bad" role="alert">${esc(msg)}</div>` : ""}
    <button class="zbtn" id="go" ${DEMO ? "" : 'data-needs="K4" disabled aria-disabled="true"'}>Get my ticket</button>
    <p class="zsmall">We use your number for your ticket and, if you win, your prize. Your organizer sees it. Other players do not.</p>
    <p class="spriv">Players are 18 or older.</p>
    <p class="spriv"><a href="/privacy.html" target="_blank" rel="noopener">Privacy Policy</a></p></div>`;
  };
  /** TA22: a person who opens the link after the first number is told BEFORE joining: it is running, their numbers start later, what is gone and what is still open. */
  const lateTip = () => INFO.startMs && !INFO.manualStart && !INFO.dns && !INFO.cancelled && Date.now() >= INFO.startMs + 30000 ? `<div class="zbanner info" id="latetip" role="status" style="margin:0 0 8px"><b>This game is already running.</b> If you join now, your numbers start about ${Math.round(ZG.LATE_LAG_ROUNDS * 3)} seconds later. Numbers called before are gone for you, and prizes already won stay won. The other prizes are still open to you.</div>` : "";
  const cancelledView = () => `${brandStrip()}<div class="zhead"><b>Corporate Tambola</b></div><div class="zcard" role="status"><h2>This game was cancelled</h2><p class="zsmall" style="margin:0">${esc((INFO.cancelled && INFO.cancelled.message) || "The organizer cancelled this game.")} There is nothing to do on this page. Thank you for your interest.</p></div>`;
  const dnsView = () => `${brandStrip()}<div class="zhead"><b>Corporate Tambola</b></div><div class="zcard" role="status"><h2>This game did not start</h2><p class="zsmall" style="margin:0">This game did not start. Your details have been erased. There is nothing to do on this page. Thank you for your interest.</p></div>`;
  const removedView = () => `${brandStrip()}<div class="zhead"><b>Corporate Tambola</b></div><div class="zcard" role="status"><h2>You have been removed from this game</h2><p class="zsmall" style="margin:0">This phone no longer plays in this game. If you think this is a mistake, please ask the person who invited you.</p></div>`;
  // what the server's "me" answer says about this ticket: removed, and (for a guest invited straight by the organizer's side) whether they may invite
  const ME = { at: -Infinity, role: null, removed: false, canInvite: false, per: 0, used: 0, loaded: false };
  async function pollMe(v) {
    if (DEMO || !v.pid || performance.now() - ME.at < 90000 + (Math.floor(performance.now()) % 30000)) return;
    ME.at = performance.now();
    try {
      const r = await api("GET", `/api/z/${EID}/me?pid=${encodeURIComponent(v.pid)}`);
      ME.loaded = true; ME.removed = r.removed === true || r.state === "removed"; ME.canInvite = r.canInvite === true; ME.per = Number(r.per) || 0; ME.used = Number(r.used) || 0; ME.role = r.role || null;
      if (ME.removed) paint();
    } catch (e) {
      if (e && e.status === 404 && /not a participant/i.test(String(e.message || ""))) { ME.removed = true; paint(); } // removed before the start: the server has deleted the seat, so it no longer knows this ticket
      /* any other trouble: asked again later */
    }
  }
  // The waiting screen survives a reload: what the person typed and the waiting number are kept on this phone only until they are let in, declined, removed or start again.
  const WAITKEY = "ctz-wait-" + EID;
  const saveWait = () => { try { store.set(WAITKEY, JSON.stringify({ wid: J.wid, who: J.who, note: J.note, phone: J.phone, cc: J.cc, e164: J.e164, emp: J.emp, name: J.name, at: Date.now() })); } catch {} };
  const clearWait = () => { try { localStorage.removeItem(WAITKEY); } catch {} try { store.set(WAITKEY, ""); } catch {} };
  function restoreWait() {
    if (DEMO || J.mode) return;
    let w = null; try { w = JSON.parse(store.get(WAITKEY) || "null"); } catch { w = null; }
    if (!w || !w.wid || Date.now() - Number(w.at || 0) > 7 * 86400000) { clearWait(); return; }
    J.mode = "waiting"; J.wid = String(w.wid); J.who = String(w.who || ""); J.note = String(w.note || ""); J.phone = String(w.phone || ""); J.cc = CT_BY_ISO(w.cc).iso; J.e164 = String(w.e164 || ""); J.emp = String(w.emp || ""); J.name = String(w.name || "");
    waitPoll();
  }
  function waitPoll() {
    clearInterval(J.timer); J.timer = setInterval(async () => {
      if (J.mode !== "waiting" || !J.wid || J.polling) return;
      J.polling = true;
      try {
        const r = await api("GET", `/api/z/${EID}/me?wid=${encodeURIComponent(J.wid)}`);
        if (r.with) J.who = String(r.with).slice(0, 60);
        if (r.state === "admitted") { clearInterval(J.timer); await doJoin(); }
        else if (r.state === "declined" || r.state === "lapsed" || r.state === "removed") { clearInterval(J.timer); clearWait(); J.mode = r.state === "removed" ? "removed" : r.state; paint(); }
      } catch { /* the next look tries again */ }
      J.polling = false;
    }, 5000);
  }
  /** Joins with what is typed (or just the token). Shows a ticket, or the calm screen that fits the answer. */
  async function doJoin() {
    const ok = await rt.join(J.e164 || J.phone, J.name, inviteOf(), J.emp);
    if (ok) {
      J.mode = ""; clearInterval(J.timer); clearWait();
      if (TOKEN) { try { const u = new URLSearchParams(location.search); u.delete("t"); history.replaceState(null, "", location.pathname + (u.toString() ? "?" + u : "")); } catch {} } // the personal token leaves the address bar once it has done its job
      paint(); start(); return true;
    }
    const l = lastJoin || {}, b = l.body || {}, code = l.code || b.code || "";
    if (code === "did-not-start" || b.didNotStart) { INFO.dns = true; rt.error = null; clearInterval(J.timer); }
    else if (code === "removed") { J.mode = "removed"; rt.error = null; clearInterval(J.timer); }
    else if (code === "waiting" || b.waiting) { J.mode = "waiting"; J.wid = String(b.wid || J.wid || ""); J.who = String(b.with || J.who || "").slice(0, 60); J.note = String(b.error || l.message || "").slice(0, 300) || (code === "invite-full" ? "The person who invited you has used all their invitations, so your request has gone to the organizer." : ""); rt.error = null; saveWait(); waitPoll(); }
    else if (code === "declined" || b.declined) { J.mode = "declined"; rt.error = null; clearInterval(J.timer); }
    else if (code === "link-used" || b.needPhone) { J.mode = "needPhone"; J.note = String(b.error || l.message || "").slice(0, 300); rt.error = null; }
    else if (code === "link-gone" || /link-gone/.test(l.message || "")) { J.mode = "gone"; rt.error = null; }
    else if ((code === "busy" || (!l.status && !code && !b.error && !b.waiting)) && J.busyTries < BUSY_TRIES) { /* a join that timed out or lost its connection (no answer at all) is asked again by itself like a busy answer: joining is safe to repeat, the same phone gets the same ticket */ J.busyTries++; J.mode = "busy"; rt.error = null; clearTimeout(J.retry); J.retry = setTimeout(() => { if (J.mode === "busy") doJoin(); }, Math.round((4 + Math.min(26, J.busyTries * 2)) * 1000 * (0.7 + Math.random() * 0.6))); } // "busy" is a short wait, not a refusal: ask again by itself, each phone at its own random moment, a little longer each time
    else if (J.mode === "waiting" || J.mode === "busy") J.mode = ""; // let in, but the join failed another way: show the usual message
    paint(); return false;
  }

  const isDemoGame = () => false; // the Rs 0 game for up to 10 people is a real game: no mark on any screen
  const demoTag = () => (isDemoGame() ? ' <span class="zdemotag">DEMO GAME</span>' : "");
  // Real housie: the ticket never marks itself. Each number is a button the player taps when it is called (`marks` = what they tapped); a tap on a number not called yet is refused in place.
  const ticketHtml = (t, marks, label, win) => `<div class="zticket${LOOK === "modern" ? " modern" : ""}${isDemoGame() ? " zdemogame" : ""}" aria-label="${label}${isDemoGame() ? " (demo game)" : ""}">${t.flat().map((v) => v === null ? `<div class="e"></div>` : `<div role="button" tabindex="0" data-tap="${v}" aria-pressed="${marks.has(v)}" aria-label="${v}${marks.has(v) ? ", marked" : ""}" class="${marks.has(v) ? "m" : ""}${marks.has(v) && NEWMARK === v ? " pop" : ""}${win && win.has(v) && marks.has(v) ? " w" : ""}">${v}</div>`).join("")}</div>`;
  const TIP = ZG.PLAYER_TIP || "Tap each number as it is called. When a prize is complete, press Claim before the next number is called. A wrong claim is a Bogey: it does not count.";
  const RULE = ZG.CLAIM_RULE_TEXT || "Press Claim before the next number is called.";
  let NEWMARK = 0; // the number just tapped: its place on the ticket is stamped
  let LOOK = store.get("ctz-look") === "modern" ? "modern" : "retro"; // the player's choice of ticket look; the Retro look is the default
  const lookPicker = () => `<div class="zlook" role="radiogroup" aria-label="Ticket look"><span class="zlooklbl">Ticket look</span><label class="zlookopt"><input type="radio" name="zlook" value="retro"${LOOK === "retro" ? " checked" : ""}> Retro look</label><label class="zlookopt"><input type="radio" name="zlook" value="modern"${LOOK === "modern" ? " checked" : ""}> Modern look</label></div>`;
  // a refusal shown in place on the ticket card (a tap on a number not called yet, a Bogey): the guide's own words, kept for a few seconds across redraws
  let TAP = null;
  const tapNote = (message, status) => {
    TAP = { msg: String(message || ""), status: status || 400, until: Date.now() + 7000, guide: null };
    try { if (window.CTG) { const g = CTG.explain({ status: TAP.status, message: TAP.msg }); if (g.what.indexOf(TAP.msg) < 0) g.what = TAP.msg + " " + g.what; TAP.guide = g; } } catch {} // the phone's own words first (they name the number), then the guide's explanation and steps
  };
  function showTapNote() {
    const host = document.getElementById("tapnote"); if (!host) return;
    if (!TAP || Date.now() > TAP.until) { TAP = null; return; }
    if (window.CTG && TAP.guide) { try { CTG.inline(host, TAP.guide, {}); return; } catch {} }
    host.innerHTML = `<div class="zbanner bad" role="alert">${esc(TAP.msg)}</div>`;
  }
  const ordinalName = (k) => ["", "1st", "2nd", "3rd"][k] || k + "th";
  const KEYNAME = (key) => (key === "full2" ? "Super Bumper House" : NAMES[key]);

  function roundCards(v) {
    let out = "";
    if (v.intermission) out += `<div class="zcard zbreak" role="status"><h2>Round ${v.round} is over</h2><div style="font:700 20px var(--sans,inherit);margin:2px 0 4px">Round ${v.intermission.round} of ${v.rounds} starts in ${v.intermission.secondsLeft}s</div><div class="zsmall" style="margin:0">Everyone gets new tickets and a fresh set of numbers.</div></div>`;
    const earlier = (v.past || []).filter((p) => p.got.length);
    if (earlier.length) out += `<div class="zcard"><h2>Earlier rounds</h2>${earlier.map((p) => `<div class="zrow"><span>Round ${p.round}</span><em>${p.got.map((g) => esc((g.ordinal > 1 ? ordinalName(g.ordinal) + " " : "") + KEYNAME(g.pattern))).join(", ")}</em></div>`).join("")}</div>`;
    return out;
  }
  // A scratch card is the same fair draw as a lucky draw (the winners are fixed by the public numbers before anyone scratches); only the reveal differs.
  const scratched = new Set(), seenAt = {};
  function luckyCard(v) {
    if (!v.lucky.length) return "";
    const scr = v.lucky.some((l) => l.style === "scratch");
    const rows = v.lucky.map((l) => {
      let right;
      if (!l.published) right = `<i>at the end of the break</i>`;
      else if (l.style === "scratch") {
        seenAt[l.ordinal] = seenAt[l.ordinal] || Date.now();
        const open = scratched.has(l.ordinal) || Date.now() - seenAt[l.ordinal] > 45000; // it opens by itself after 45 seconds
        right = open ? (l.won ? `<em>You won!</em>` : `<i>Not this time</i>`) : `<button class="zscratch" data-scr="${l.ordinal}" aria-label="Scratch to reveal">Scratch here</button>`;
      } else right = l.won ? `<em>You won!</em>` : `<i>Not this time</i>`;
      return `<div class="zrow"><span>${esc(l.title)}<br><small class="zsmall" style="margin:0">${l.winners} ${l.winners === 1 ? "person is" : "people are"} picked at random${l.style === "scratch" ? " · scratch card" : ""}</small></span>${right}</div>`;
    }).join("");
    return `<div class="zcard"><h2>${scr ? "Scratch card" : "Lucky draw"}</h2>${rows}</div>`;
  }
  function icsFor(v) {
    const ms = (1692803367 + (v.scheduledRound - 1) * 3) * 1000, f = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const text = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Corporate Tambola//EN", "BEGIN:VEVENT", "UID:" + EID + "@corporate-tambola", "DTSTAMP:" + f(Date.now()), "DTSTART:" + f(ms), "DTEND:" + f(ms + 45 * 60000), "SUMMARY:Corporate Tambola game", "DESCRIPTION:Open " + location.origin + "/z?e=" + EID + " a few minutes early.", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    return "data:text/calendar;charset=utf-8," + encodeURIComponent(text);
  }
  /** Before the first number: what to expect, what can be won, a sound check and a calendar entry. Everything here is known at boot, so it costs no extra requests. */
  function waitingRoom(v) {
    if (v.phase === "play" && !v.locked && !v.late && !v.log.length && v.round <= 1 && v.startMode === "manual" && !DEMO) { // a game that begins when the Host or Organizer presses Start: what is happening, in plain words
      const ms0 = (1692803367 + (v.scheduledRound - 1) * 3) * 1000, when0 = new Date(ms0).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
      const sec0 = v.nowRound === null ? null : Math.max(0, (v.scheduledRound - v.nowRound) * 3);
      const top0 = v.waitingForStart ? `<h2>Waiting for the host to begin the game</h2><div class="zsetup">The host will press Start soon. Keep this page open: the game begins by itself on your phone the moment they do.</div>`
        : v.startingInSec !== null ? `<h2>The game is starting</h2><div class="zcount" aria-live="off" id="cd2">${clock(v.startingInSec)}</div><p class="zsmall" style="margin-top:0">until the first number. Keep this page open and your screen on: the numbers appear on their own.</p>`
        : `<h2>You are in. The game starts at ${esc(when0)}</h2>${sec0 !== null ? `<div class="zsmall" style="margin:0">Starting in</div><div class="zcount" aria-live="off" id="cd2">${clock(sec0)}</div>` : ""}<p class="zsmall" style="margin-top:0">At that time the host presses Start. Keep this page open and your screen on.</p>`;
      return `<div class="zcard zwait">${top0}<div class="zdo"><b>What to do:</b> nothing yet. Keep this page open. When the numbers start, tap each one on your ticket as it is called.</div></div>`;
    }
    if (v.phase !== "play" || v.locked || v.late || v.log.length || v.nextCallInSec === null || v.nextCallInSec <= 0 || v.round > 1) return "";
    if (DEMO) return DEMO.running ? `<div class="zcard zwait"><h2>Starting in <span id="cd">${Math.max(0, v.nextCallInSec)}</span> seconds</h2><p class="zsmall" style="margin:0">Tap each number on your ticket as it is called. When the four corners are marked, press Claim.</p></div>` : "";
    const ms = (1692803367 + (v.scheduledRound - 1) * 3) * 1000;
    const when = new Date(ms).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    const prizes = ZG.keysInPlay(v.cfg.rewards).map((key) => ZG.linesFor(v.cfg.rewards, key).map((line) => `<li>${esc((ZG.linesFor(v.cfg.rewards, key).length > 1 ? ordinalName(line.ordinal) + " " : "") + KEYNAME(key))}${line.text ? ": <b>" + esc(line.text) + "</b>" : ""}<br>${howLine(key)}</li>`).join("")).join("");
    const toFirst = v.nextCallInSec, setup = toFirst <= GRACE_SECS;
    const top = setup
      ? `<h2>Your game is setting up</h2><div class="zsetup">We are waiting 2 minutes more for everyone to join.</div><div class="zcount" aria-live="off" id="cd">${clock(toFirst)}</div><p class="zsmall" style="margin-top:0">until the first number. Keep this page open and your screen on: the numbers appear on their own.</p>`
      : `<h2>You are in. See you at ${esc(when)}</h2><div class="zsmall" style="margin:0">Starting in</div><div class="zcount" aria-live="off" id="cd">${clock(toFirst - GRACE_SECS)}</div><p class="zsmall" style="margin-top:0">hours : minutes : seconds. Keep this page open and your screen on: the numbers appear on their own.</p>`;
    return `<div class="zcard zwait">${top}
      <div class="zdo"><b>What to do:</b> nothing yet. Keep this page open. When the numbers start, tap each one on your ticket as it is called.</div>
      ${prizes ? `<h3>What you can win</h3><ul class="zlist">${prizes}</ul>` : ""}
      <h3>How it works</h3><ol class="zlist"><li>Your ticket is below. Numbers are called one by one. You see only the number just called, so stay alert.</li><li>Tap each number on your ticket as it is called. The ticket does not mark itself.</li><li>When a row or the whole ticket is complete, press <b>Claim</b> before the next number is called. The software checks it against the called numbers, you do not need to shout.</li><li>A wrong claim is a <b>Bogey</b>: it does not count. Two Bogeys on the same prize and your ticket is out of that prize.</li><li>The organizer hands over the rewards.</li></ol><p class="zsmall zfairlink"><a href="/fair.html" target="_blank" rel="noopener">How we keep it fair</a></p>
      <button class="zbtn s alt" id="soundtest">Check my sound</button><a class="zbtn s alt" id="addcal" download="game.ics" href="${icsFor(v)}">Add to my calendar</a></div>`;
  }

  // ---------- winners: a prize record that stays on this phone, the hurray, the final thank-you ----------
  const prizeKey = "ctz-prizes:" + EID;
  const readJson = (k, d) => { try { const v = JSON.parse(store.get(k) || ""); return v || d; } catch { return d; } };
  const winId = (w) => w.round + ":" + w.pattern + ":" + w.ordinal;
  const lineName = (cfg, key, ordinal) => (ZG.linesFor(cfg.rewards, key).length > 1 ? ordinalName(ordinal) + " " : "") + KEYNAME(key);
  let PRIZES = [];
  const celebrated = new Set();
  function syncPrizes(v) {
    const have = readJson(prizeKey, []), ids = new Set(have.map(winId)), fresh = [];
    const add = (w) => { if (!ids.has(winId(w))) { ids.add(winId(w)); have.push(w); if (!celebrated.has(winId(w))) fresh.push(w); celebrated.add(winId(w)); } };
    for (const w of v.won) add({ round: w.round, pattern: w.pattern, ordinal: w.ordinal, text: w.text, name: lineName(v.cfg, w.pattern, w.ordinal) });
    for (const l of v.lucky) if (l.won) add({ round: 1, pattern: "lucky", ordinal: l.ordinal, text: l.title, name: l.title });
    if (fresh.length) store.set(prizeKey, JSON.stringify(have));
    PRIZES = have;
    return fresh;
  }
  function confetti(canvas) {
    const ctx = canvas.getContext("2d"); if (!ctx || typeof ctx.clearRect !== "function") return;
    const W = (canvas.width = innerWidth), H = (canvas.height = innerHeight), cols = ["#FFB703", "#1565D8", "#E4572E", "#0B7F4A", "#D6246B", "#7B3FE4"];
    const ps = Array.from({ length: 140 }, () => ({ x: Math.random() * W, y: -20 - Math.random() * H * 0.6, r: 4 + Math.random() * 6, c: cols[(Math.random() * cols.length) | 0], vy: 2 + Math.random() * 3.5, vx: -1.5 + Math.random() * 3, a: Math.random() * 6.28, va: -0.2 + Math.random() * 0.4 }));
    const t0 = performance.now();
    (function f(t) {
      ctx.clearRect(0, 0, W, H);
      for (const q of ps) { q.x += q.vx; q.y += q.vy; q.a += q.va; ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.a); ctx.fillStyle = q.c; ctx.fillRect(-q.r / 2, -q.r / 2, q.r, q.r * 1.6); ctx.restore(); }
      if (t - t0 < 6000 && canvas.isConnected) requestAnimationFrame(f); else ctx.clearRect(0, 0, W, H);
    })(t0);
  }
  function showHurray(list) {
    const old = document.getElementById("hurray"); if (old) old.remove();
    const box = document.createElement("div"); box.id = "hurray"; box.className = "zhurray"; box.setAttribute("role", "alertdialog"); box.setAttribute("aria-live", "assertive");
    const what = list.map((w) => esc(w.name)).join(", ");
    const prize = list.filter((w) => w.text).map((w) => `<div class="zhp">${esc(w.text)}</div>`).join("");
    box.innerHTML = `<canvas class="zconf" aria-hidden="true"></canvas><div class="zhcard"><div class="zhbig">Hurray!</div><div class="zhsub">Congratulations, you won</div><div class="zhwhat">${what}</div>${list.length === 1 && HOW[list[0].pattern] ? `<div class="zhsub">${esc(HOW[list[0].pattern])}</div>` : ""}${prize}<button class="zbtn" id="hurok">Wonderful</button></div>`;
    document.body.appendChild(box);
    const done = () => { if (box.isConnected) box.remove(); };
    box.querySelector("#hurok").onclick = done; setTimeout(done, 15000);
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) confetti(box.querySelector("canvas"));
    try { navigator.vibrate && navigator.vibrate([200, 100, 200, 100, 400]); } catch {}
    if (sound && window.TBAudio) TBAudio.say("Congratulations! You won " + list.map((w) => w.name).join(", ") + "!");
  }
  // ---------- tell our store that the game is over for this phone, once (tiny): the end-of-game clock relies on it. Winners are reported by the game code itself, and only count when several phones agree.
  const overKey = "ctz-over:" + EID;
  let overPending = false;
  async function reportToStore(v) {
    if (!v.pid || DEMO) return;
    try {
      if (v.phase === "ended" && !store.get(overKey) && !overPending) {
        overPending = true; // spread over a little time so a big crowd does not ask at the same second
        setTimeout(async () => { try { await api("POST", `/api/z/${EID}/over`, { pid: v.pid }); store.set(overKey, "1"); } catch { /* tried again later */ } overPending = false; }, Math.floor(Math.random() * 45000));
      }
    } catch { /* never in the way of the game */ }
  }
  // ---------- after the game, a winner confirms the name and mobile number the prize goes to (the organizer and co-host see any change, with the original) ----------
  const CF = { loaded: false, loading: false, name: "", phone: "", confirmed: false, editing: false, edited: false, prizes: [], note: "", last: 0, busy: false };
  const myDevice = () => store.get("ctz:device") || "";
  async function loadCf(v) {
    if (DEMO || v.phase !== "ended" || !PRIZES.length || !v.pid || CF.loading || (CF.loaded && CF.confirmed) || Date.now() - CF.last < 15000) return;
    CF.last = Date.now(); CF.loading = true;
    try {
      const r = await api("GET", `/api/z/${EID}/myprizes?pid=${encodeURIComponent(v.pid)}&device=${encodeURIComponent(myDevice())}`);
      CF.prizes = r.prizes || []; if (!CF.edited) { CF.name = r.name || ""; CF.phone = r.phone || ""; } CF.confirmed = !!r.confirmed; CF.loaded = CF.prizes.length > 0;
    } catch { /* tried again shortly */ }
    CF.loading = false;
  }
  function confirmCard(v) {
    if (DEMO || v.phase !== "ended" || !PRIZES.length) return "";
    if (!CF.loaded) return `<div class="zcard"><h2>Confirm where your prize goes</h2><p class="zsmall">Waiting for your result to be confirmed by the other phones. This takes a moment.</p></div>`;
    if (CF.confirmed && !CF.editing) return `<div class="zcard"><h2>Details confirmed</h2><p style="margin:4px 0"><b>${esc(CF.name)}</b> &middot; ${esc(CF.phone)}</p><p class="zsmall">Your organizer has these details. <button class="zsnd" id="cfedit">Change</button></p></div>`;
    return `<div class="zcard zform"><h2>Confirm your prize details</h2>
      <p class="zsmall" style="margin:0 0 6px">Your organizer will use this name and mobile number to hand over your prize. Please check them and correct anything that is wrong. If you change them, your organizer and co-host will see both what you joined with and what you changed it to.</p>
      <label for="cfnm">Your name</label><input id="cfnm" autocomplete="name" maxlength="60" value="${esc(CF.name)}">
      <label for="cfph">Your mobile number</label><input id="cfph" inputmode="tel" autocomplete="tel" value="${esc(CF.phone)}">
      ${CF.note ? `<div class="zbanner ${CF.note.startsWith("Thank") ? "ok" : "bad"}" role="alert">${esc(CF.note)}</div>` : ""}
      <button class="zbtn" id="cfgo"${CF.busy ? " disabled" : ""}>Confirm</button></div>`;
  }
  function bindConfirm(v) {
    const nm = document.getElementById("cfnm"), ph = document.getElementById("cfph"), go = document.getElementById("cfgo"), ed = document.getElementById("cfedit");
    if (ed) ed.onclick = () => { CF.editing = true; CF.note = ""; paint(); };
    if (nm) nm.oninput = () => { CF.name = nm.value; CF.edited = true; };
    if (ph) ph.oninput = () => { CF.phone = ph.value; CF.edited = true; };
    if (go) go.onclick = async () => {
      CF.busy = true; CF.note = ""; paint();
      try { const r = await api("POST", `/api/z/${EID}/confirm`, { pid: v.pid, device: myDevice(), name: CF.name, phone: CF.phone }); CF.confirmed = true; CF.editing = false; CF.edited = false; CF.note = ""; CF.last = 0; }
      catch (e) { const m = e && e.message; CF.note = m && !RAW.test(m) ? m : "No signal just now. Your details are not lost. Press Confirm again."; }
      CF.busy = false; paint();
    };
  }
  function prizesCard() {
    if (!PRIZES.length) return "";
    const rows = PRIZES.slice().sort((a, b) => a.round - b.round).map((w) => `<div class="zrow"><span>${esc(w.name)}${w.text ? `<br><small class="zsmall" style="margin:0">${esc(w.text)}</small>` : ""}${HOW[w.pattern] ? "<br>" + howLine(w.pattern) : ""}</span><em>${w.pattern === "lucky" ? "Lucky draw" : "Round " + w.round}</em></div>`).join("");
    return `<div class="zcard zprizes"><h2>Your prizes</h2>${rows}<p class="zsmall" style="margin:6px 0 0">Saved on this phone. Show this to your organizer to collect.</p></div>`;
  }
  let shareLink = location.origin + "/";
  try { localStorage.removeItem("ctz-phone"); } catch {} // older versions saved the participant's own number on the phone: it is not kept any more
  /** A DEMO GAME (the organizer's free game for up to 10 people): one plain line, on every screen of the game. */
  const demoGameCard = () => (isDemoGame() ? `<div class="zcard zdemo" id="demogame" role="note"><span class="zdemotag">DEMO GAME</span> <span class="zsmall">This is a demo game for up to 10 people. The organizer can make it a real game at any time.</span></div>` : "");
  function demoCard(v) {
    if (!DEMO || v.phase === "ended") return "";
    if (!DEMO.running) return `<div class="zcard zdemo" role="note"><h2>Video <span class="zdemotag">VIDEO</span></h2><p class="zsmall" style="margin:0 0 10px">This is a real ticket and a real game, about a minute long: 3 numbers, a short break with your host's message, 3 more numbers. <b>Tap each number on your ticket as it is called</b>, and when the <b>Four corners</b> (the first and last numbers of the top and bottom rows) are marked, press <b>Claim</b> to win. Turn up your phone's volume, then press Run Demo.</p><button class="zbtn" id="drun" type="button">Run Demo</button> <button class="zbtn s alt" id="dcopy" type="button">Copy the demo link to send to a colleague</button></div>`;
    return `<div class="zcard zdemo" role="note"><span class="zdemotag">VIDEO</span> <span class="zsmall">A sample game is running. Nothing is saved and nothing is charged.</span> <button class="zbtn s alt" id="dagain" type="button">Run the video again</button></div>`;
  }
  function bindDemo() {
    if (!DEMO) return;
    for (const id of ["drun", "dagain", "dagain2"]) { const b = document.getElementById(id); if (b) b.onclick = () => DEMO.run(); }
    for (const id of ["dcopy", "dcopy2"]) { const b = document.getElementById(id); if (b) b.onclick = async () => { const link = location.origin + "/demo.html"; try { await navigator.clipboard.writeText(link); b.textContent = "Link copied: " + link; } catch { b.textContent = "Send this link: " + link; } }; } // the plain address: whoever opens it runs their own demo
  }
  function finalCard(v) {
    if (DEMO) return `<div class="zcard zfinal"><h2>That was the video <span class="zdemotag">VIDEO</span></h2><div class="zfbig">${PRIZES.length ? "You won Four corners." : "You saw how a game runs."}</div>${PRIZES.length ? "" : `<p class="zsmall" style="margin:0 0 6px">Next time tap each number as it is called and press Claim when the four corners are marked: that is how a prize is won.</p>`}<p class="zsmall" style="font-size:15px;margin:6px 0 10px">A real game has 90 numbers, many prizes, your own brand messages and videos, lucky draws and a report. You build it in about five minutes and nobody pays until you are ready.</p><a class="zbtn" style="display:inline-flex;align-items:center;text-decoration:none" href="/">Create my game</a> <button class="zbtn s alt" id="dagain2" type="button">Run the video again</button> <button class="zbtn s alt" id="dcopy2" type="button">Copy the demo link</button></div>`;
    const n = PRIZES.length;
    return `<div class="zcard zfinal"><h2>Game complete${demoTag()}</h2>
      <div class="zmedal" aria-hidden="true">${n ? "&#127942;" : "&#127922;"}</div>
      <div class="zfbig">${n ? "You won " + n + (n === 1 ? " prize!" : " prizes!") : "Well played!"}</div>
      <p class="zsmall zthanks">Thank you for joining our extended family of Corporate Tambola.</p>
      <p class="zsmall" style="font-size:15px;margin:6px 0 10px">${n ? "Your prizes are listed below and stay on this phone. Show them to your organizer to collect." : "No prize this time. Every game is a good game, and the next one is another chance."}</p>
      <button class="zbtn" id="shr">Share with friends and colleagues</button>
      <a class="zbtn s alt" style="display:inline-flex;align-items:center;text-decoration:none;margin-top:8px" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent("I just played Corporate Tambola with my team. Bring it to your company: " + shareLink)}">WhatsApp</a></div>`;
  }
  function bindShare() {
    const b = document.getElementById("shr"); if (!b) return;
    b.onclick = async () => {
      const data = { title: "Corporate Tambola", text: "I just played Corporate Tambola with my team. Bring it to your company:", url: shareLink };
      try { if (navigator.share) { await navigator.share(data); return; } } catch { return; }
      try { await navigator.clipboard.writeText(data.text + " " + data.url); b.textContent = "Link copied"; } catch { b.textContent = shareLink; }
    };
  }

  // ---------- break media plays inside the page (YouTube, video and audio files); anything else stays a link ----------
  const mediaHost = document.createElement("div");
  mediaHost.id = "ctmedia"; mediaHost.style.cssText = "position:absolute;z-index:30;display:none;background:#000;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.3)";
  document.body.appendChild(mediaHost);
  let mediaKey = "";
  const ytId = (u) => { const m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/))([A-Za-z0-9_-]{11})/.exec(u || ""); return m ? m[1] : null; };
  const mediaKind = (b) => {
    if (!b || !b.mediaUrl) return null;
    if (ytId(b.mediaUrl)) return "yt";
    if (b.kind === "youtube") return null;
    if (/\.(mp4|webm|m4v|mov|ogv)([?#]|$)/i.test(b.mediaUrl)) return "video";
    if (/\.(mp3|m4a|aac|wav|ogg|oga)([?#]|$)/i.test(b.mediaUrl)) return "audio";
    return null;
  };
  function soundButton(onTap) {
    const b = document.createElement("button"); b.type = "button"; b.textContent = "Tap for sound";
    b.style.cssText = "position:absolute;right:8px;bottom:8px;z-index:2;background:#C9A24A;color:#1b1b1b;border:0;border-radius:8px;padding:6px 12px;font:700 13px system-ui,sans-serif";
    b.onclick = () => { try { onTap(); } catch {} b.remove(); };
    mediaHost.appendChild(b);
  }
  function startMedia(b, kind) {
    const elapsed = Math.max(0, Math.min((b.seconds || 0) - (b.secondsLeft || 0), 3600));
    if (kind === "yt") {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent), canSound = !ios && navigator.userActivation && navigator.userActivation.hasBeenActive;
      const f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + ytId(b.mediaUrl) + "?autoplay=1&mute=" + (canSound ? 0 : 1) + "&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&start=" + Math.round(elapsed) + "&origin=" + encodeURIComponent(location.origin);
      f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen"; f.title = b.title; f.setAttribute("allowfullscreen", ""); f.referrerPolicy = "strict-origin-when-cross-origin";
      f.style.cssText = "width:100%;height:100%;border:0"; mediaHost.appendChild(f);
      if (!canSound) soundButton(() => f.contentWindow.postMessage(JSON.stringify({ event: "command", func: "unMute", args: [] }), "https://www.youtube-nocookie.com"));
      return;
    }
    const el = document.createElement(kind === "video" ? "video" : "audio");
    el.src = b.mediaUrl; el.controls = true; el.autoplay = true; el.setAttribute("playsinline", ""); el.preload = "auto";
    el.style.cssText = kind === "video" ? "width:100%;height:100%;background:#000" : "position:absolute;left:8px;right:8px;top:50%;transform:translateY(-50%);width:calc(100% - 16px)";
    if (kind === "audio") { mediaHost.style.background = "#0B3D91"; const t = document.createElement("div"); t.textContent = b.title; t.style.cssText = "position:absolute;left:0;right:0;top:18%;text-align:center;color:#fff;font:700 18px system-ui,sans-serif;padding:0 12px"; mediaHost.appendChild(t); } else mediaHost.style.background = "#000";
    el.addEventListener("loadedmetadata", () => { try { if (elapsed && el.duration > elapsed + 1) el.currentTime = elapsed; } catch {} });
    mediaHost.appendChild(el);
    const p = typeof el.play === "function" ? el.play() : null; if (p && p.catch) p.catch(() => { el.muted = true; const q = el.play(); if (q && q.catch) q.catch(() => {}); soundButton(() => { el.muted = false; }); });
  }
  function placeMedia() {
    if (!mediaKey) return;
    const slot = document.getElementById("mslot");
    if (!slot) { mediaHost.style.display = "none"; return; }
    const r = slot.getBoundingClientRect();
    mediaHost.style.display = "block"; mediaHost.style.left = r.left + scrollX + "px"; mediaHost.style.top = r.top + scrollY + "px"; mediaHost.style.width = r.width + "px"; mediaHost.style.height = r.height + "px";
  }
  function syncMedia(v) {
    const b = slotNow(v), kind = b ? mediaKind(b) : null, key = b && kind ? b.title + "|" + b.mediaUrl : "";
    if (key !== mediaKey) {
      mediaHost.textContent = ""; mediaHost.style.display = "none"; mediaHost.style.background = "#000"; mediaKey = key;
      if (key) startMedia(b, kind);
    }
    placeMedia();
  }
  addEventListener("resize", placeMedia);

  /** Joined after the first number: what that means, then the countdown to this phone's own first number. */
  function lateCard(v) {
    const l = v.late; if (!l) return "";
    if (l.secondsUntil > 0) return `<div class="zcard zbreak" role="status"><h2>You joined after the game began</h2><div class="zsetup">Numbers called before you joined are gone, and prizes already awarded stay awarded.</div><div class="zcount" aria-live="off">${clock(l.secondsUntil)}</div><p class="zsmall" style="margin:0">until your numbers start. Your ticket is ready below.</p></div>`;
    return `<div class="zcard"><div class="zsmall" style="margin:0">You joined after the game began, so you play from your first number. ${l.hidden} number${l.hidden === 1 ? " was" : "s were"} called before you.</div></div>`;
  }
  // ---------- invite your colleagues / family members (when the organizer allows it) ----------
  let inviteCat = "", inviteInfo = null, inviteAt = -Infinity;
  let INVNOTE = { text: "", until: 0 }; // what Copy / Share said: kept here, because the page is drawn again every second and would wipe a note put on the button itself
  const invNote = () => (INVNOTE.text && Date.now() < INVNOTE.until ? `<p class="zsmall" role="status" style="margin:8px 0 0">${esc(INVNOTE.text)}</p>` : "");
  /** The phone would not copy: a small panel outside the redrawn page holds the link in a box, so a press-and-hold selection survives and Copy can be chosen. */
  function invSheet(link) {
    const old = document.getElementById("invsheet"); if (old) old.remove();
    const s = document.createElement("div"); s.id = "invsheet"; s.className = "zinvsheet"; s.setAttribute("role", "dialog"); s.setAttribute("aria-label", "Copy your invitation link");
    s.innerHTML = `<p class="zsmall" style="margin:0 0 6px">Your phone would not copy it for you. Press and hold the link, choose Select all, then Copy.</p><input id="invfield" class="zlinkin" readonly value="${esc(link)}" aria-label="Your invitation link"><button type="button" class="zbtn s alt" id="invclose">Done</button>`;
    document.body.appendChild(s);
    s.querySelector("#invclose").onclick = () => s.remove(); setTimeout(() => { if (s.isConnected) s.remove(); }, 90000);
    const f = s.querySelector("#invfield"); try { f.focus(); f.select(); f.setSelectionRange(0, 9999); } catch {}
  }
  async function invCopy(text, okText, link) { try { await navigator.clipboard.writeText(text); INVNOTE = { text: okText, until: Date.now() + 10000 }; paint(); } catch { invSheet(link); } }
  const seatOf = (pid) => { const m = /^(\d+)x/.exec(pid || ""); return m ? Number(m[1]) : 0; };
  async function loadInvites(v) {
    if (!v.pid || !(v.cfg.invites && v.cfg.invites.on) || performance.now() - inviteAt < 45000) return;
    inviteAt = performance.now();
    try { inviteInfo = await api("GET", `/api/z/${EID}/invites?pid=${encodeURIComponent(v.pid)}`); } catch { /* shown next time */ }
  }
  const inviteLink = (v) => `${location.origin}/z.html?e=${encodeURIComponent(EID)}&from=${seatOf(v.pid)}${inviteCat ? "&c=" + encodeURIComponent(inviteCat) : ""}`;
  function inviteCard(v) {
    const iv = v.cfg.invites;
    if (!iv || !iv.on || !seatOf(v.pid)) return "";
    if (inviteInfo && inviteInfo.canInvite === false) return ""; // invited by a participant: plays, but has no invite link (two levels only)
    const cats = (ZG.INVITE_CATEGORIES || []).filter((c) => iv.cats.includes(c.id));
    if (!cats.length) return "";
    if (!inviteCat || !cats.some((c) => c.id === inviteCat)) inviteCat = cats[0].id;
    const used = inviteInfo ? inviteInfo.used : 0, unl = inviteInfo && inviteInfo.unlimited, left = Math.max(0, iv.per - used);
    const counter = unl ? "You can invite as many people as you like." : `You can invite up to <b>${iv.per}</b> people. You have invited <b>${used}</b>${left ? `, so <b>${left}</b> ${left === 1 ? "invitation is" : "invitations are"} left` : ". You have used all your invitations"}.`;
    const chips = cats.map((c) => `<button type="button" class="zchip${c.id === inviteCat ? " on" : ""}" data-icat="${esc(c.id)}">${esc(c.label)}</button>`).join("");
    const link = inviteLink(v), kind = (cats.find((c) => c.id === inviteCat) || cats[0]).label.toLowerCase();
    const text = "Join me for Corporate Tambola! Open this link, enter your mobile number and you get your own ticket: " + link;
    return `<div class="zcard zinvite"><h2>Invite your colleagues / family members</h2>
      <p class="zsmall" style="margin:0 0 8px">${counter}</p>
      ${!unl && !left ? "" : `<div class="zsmall" style="margin:0 0 4px">Who are you inviting?</div><div class="zchips">${chips}</div>
      <div class="zlink" id="invlink" style="margin-top:8px">${esc(link)}</div>
      <button class="zbtn s" id="invshare">Share invitation (${esc(kind)})</button>
      <a class="zbtn s alt" style="display:inline-flex;align-items:center;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text)}">WhatsApp</a>
      <button class="zbtn s alt" id="invcopy">Copy link</button>
      ${invNote()}
      <p class="zsmall" style="margin:8px 0 0">Your guest joins with their own mobile number and gets their own ticket. ${unl ? "" : `Your link stops working after ${iv.per} people have joined through it.`}</p>`}</div>`;
  }
  function bindInvite(v) {
    document.querySelectorAll("[data-icat]").forEach((b) => (b.onclick = () => { inviteCat = b.dataset.icat; paint(); }));
    const sh = document.getElementById("invshare"); if (sh) sh.onclick = async () => { const data = { title: "Corporate Tambola", text: "Join me for Corporate Tambola! Open this link, enter your mobile number and you get your own ticket:", url: inviteLink(v) }; try { if (navigator.share) { await navigator.share(data); return; } } catch (e) { if (e && e.name === "AbortError") return; } invCopy(data.text + " " + data.url, "Link copied. Paste it into a message to send it.", data.url); };
    const cp = document.getElementById("invcopy"); if (cp) cp.onclick = () => invCopy(inviteLink(v), "Link copied. Paste it into a message to send it.", inviteLink(v));
  }
  // ---------- My invites: for a guest who may invite (level 1) only. Their own small list: add, send on WhatsApp, resend, remove. A guest invited by a guest sees nothing. ----------
  const MI = { k6: {}, people: [], limit: 0, used: 0, loaded: false, at: -Infinity, busy: false, note: "", bad: false, ask: "", name: "", phone: "" };
  const miQ = (v) => `?me=${encodeURIComponent(v.pid)}&device=${encodeURIComponent(myDevice())}`; // the ticket id is public: the phone's own device id goes with every invite call
  async function loadMine(v, force) {
    if (DEMO || !ME.canInvite || !v.pid || MI.busy) return;
    if (!force && performance.now() - MI.at < 60000) return;
    MI.at = performance.now();
    try {
      const r = await api("GET", `/api/z/${EID}/people${miQ(v)}`);
      MI.people = Array.isArray(r.people) ? r.people : []; MI.limit = Number(r.limit) || 0; MI.used = Number(r.used) || 0; MI.loaded = true;
      if (force) paint();
    } catch (e) { if (e && e.status === 403) { ME.canInvite = false; paint(); } } // the organizer switched invitations off, or this guest may not invite
  }
  const waOk = (u) => (typeof u === "string" && /^https:\/\/wa\.me\//.test(u) ? u : "");
  function mineCard(v) {
    if (DEMO || !ME.canInvite) return "";
    const left = Math.max(0, MI.limit - MI.used);
    const counter = !MI.loaded ? "Getting your list…" : MI.limit ? `You can invite up to <b>${MI.limit}</b> people. You have invited <b>${MI.used}</b>${left ? `, so <b>${left}</b> ${left === 1 ? "place is" : "places are"} left` : ". You have used all your places"}.` : "";
    const started = v.log.length > 0 || !!v.late || v.phase === "ended"; // a guest can take a name off their list only before the game starts
    const rows = MI.people.map((p) => {
      const wa = waOk(p.waLink), gone = p.status === "removed";
      return `<div class="zrow zmi"><span>${esc(p.name || "Guest")}<br><small class="zsmall" style="margin:0">${esc(p.maskedPhone || "")} · ${gone ? "Removed" : p.status === "joined" ? "Joined" : "Invited"}</small></span>
        <span class="zmia">${!gone && p.status !== "joined" && wa ? `<a class="zbtn s" target="_blank" rel="noopener" href="${esc(wa)}" style="text-decoration:none;display:inline-flex;align-items:center">Send on WhatsApp</a>` : ""}
        ${!gone && p.status !== "joined" ? `<button class="zbtn s alt" type="button" data-mire="${esc(p.id)}">Send a new link</button>` : ""}
        ${!gone && !started ? (MI.ask === p.id ? `<button class="zbtn s" type="button" data-miyes="${esc(p.id)}">Yes, remove</button><button class="zbtn s alt" type="button" data-mino="1">No</button>` : `<button class="zbtn s alt" type="button" data-mirm="${esc(p.id)}">Remove</button>`) : ""}</span></div>`;
    }).join("");
    return `<div class="zcard zinvite" id="mine"><h2>My invites</h2><p class="zsmall" style="margin:0 0 8px">${counter}</p>${rows}
      ${MI.loaded && !left && MI.limit ? "" : `<div class="zform"><label for="mi-name">Name</label><input id="mi-name" autocomplete="off" maxlength="60" value="${esc(MI.name)}"><label for="mi-phone">Mobile number</label><input id="mi-phone" inputmode="tel" autocomplete="off" value="${esc(MI.phone)}" placeholder="98765 43210">${CBConsent.html("K6")}<button class="zbtn s" id="mi-add" type="button" data-needs="K6" disabled aria-disabled="true"${MI.busy ? ' data-hold="1"' : ""}>Add to my invites</button></div>`}
      ${MI.note ? `<div class="zbanner ${MI.bad ? "bad" : "ok"}" role="status" style="margin-top:8px">${esc(MI.note)}</div>` : ""}</div>`;
  }
  function bindMine(v) {
    if (!document.getElementById("mine")) return;
    const nm = document.getElementById("mi-name"), ph = document.getElementById("mi-phone"), add = document.getElementById("mi-add");
    if (nm) nm.oninput = () => { MI.name = nm.value; };
    if (ph) ph.oninput = () => { MI.phone = ph.value; };
    const act = async (fn, okNote) => {
      MI.busy = true; MI.note = ""; MI.bad = false; paint();
      try { await fn(); MI.note = okNote || ""; } catch (e) { MI.bad = true; MI.note = (e && e.status !== 0 && e.message && !/^http \d+$|^offline$/.test(e.message) ? e.message : "Could not do that. Please try again."); }
      MI.busy = false; await loadMine(v, true); paint();
    };
    if (add) CBConsent.wire(document, "K6", MI.k6); // the person who adds a name and number ticks that they may use them
    if (add) add.onclick = () => {
      const name = (nm.value || "").trim(), phone = (ph.value || "").trim();
      if (!CBConsent.all(document, "K6")) { MI.bad = true; MI.note = "Please tick the box to continue."; return paint(); }
      const consent = CBConsent.payload(document, "K6");
      if (name.length < 2) { MI.bad = true; MI.note = "Please type their name."; return paint(); }
      if (phone.replace(/\D/g, "").length < 10) { MI.bad = true; MI.note = "Please type their mobile number."; return paint(); }
      act(async () => {
        const r = await api("POST", `/api/z/${EID}/people${miQ(v)}`, { people: [{ name, phone }], me: v.pid, consent });
        if (r.invalid && r.invalid.length) throw new Error("That number does not look right. Please check it.");
        if (r.duplicates) throw new Error("That number is already invited.");
        MI.name = ""; MI.phone = "";
      }, "Added. Press Send on WhatsApp next to their name.");
    };
    document.querySelectorAll("[data-mire]").forEach((b) => (b.onclick = () => act(async () => { await api("POST", `/api/z/${EID}/people/${encodeURIComponent(b.dataset.mire)}/resend${miQ(v)}`, { me: v.pid }); }, "A new link is ready. Press Send on WhatsApp.")));
    document.querySelectorAll("[data-mirm]").forEach((b) => (b.onclick = () => { MI.ask = b.dataset.mirm; paint(); }));
    document.querySelectorAll("[data-mino]").forEach((b) => (b.onclick = () => { MI.ask = ""; paint(); }));
    document.querySelectorAll("[data-miyes]").forEach((b) => (b.onclick = () => { const id = b.dataset.miyes; MI.ask = ""; act(async () => { await api("POST", `/api/z/${EID}/people/${encodeURIComponent(id)}/remove${miQ(v)}`, { me: v.pid }); }, "Removed. Your place is free again."); }));
  }
  function mediaAct(b) {
    const inPage = !!mediaKind(b);
    return b.mediaUrl ? (inPage ? `<div id="mslot" class="zmslot"></div><a class="zsmall" target="_blank" rel="noopener noreferrer" href="${esc(b.mediaUrl)}">Trouble playing? Open it in a new tab</a>` : `<a class="zbtn s" style="display:inline-flex;align-items:center;text-decoration:none;margin-top:10px" target="_blank" rel="noopener noreferrer" href="${esc(b.mediaUrl)}">${b.kind === "youtube" ? "Watch the video" : "Open"}</a>`) : "";
  }
  // ---------- the OPENING plays while everyone waits for the first number; the CLOSING plays on the final screen ----------
  let closingIdx = 0;
  function openingNow(v) {
    const list = (v.cfg && v.cfg.opening) || [];
    if (!list.length || v.phase !== "play" || v.locked || v.stopped || v.paused || v.late || v.brk || v.log.length > 0 || v.nextCallInSec === null || v.nextCallInSec > GRACE_SECS) return null;
    const elapsed = GRACE_SECS - v.nextCallInSec; let from = 0; // the openings follow one another inside the 2 minutes before the first number
    for (const o of list) { const len = o.seconds || 60; if (elapsed < from + len) return Object.assign({}, o, { seconds: len, secondsLeft: Math.max(1, Math.round(from + len - elapsed)) }); from += len; }
    return null;
  }
  function closingNow(v) {
    const list = (v.cfg && v.cfg.closing) || [];
    if (!list.length || v.phase !== "ended") return null;
    const i = Math.min(closingIdx, list.length - 1);
    return Object.assign({}, list[i], { seconds: 0, secondsLeft: 0, n: i + 1, of: list.length });
  }
  const slotNow = (v) => v.brk || openingNow(v) || closingNow(v);
  const slotWhat = (b) => (b.kind === "speech" ? "Please listen to the host." : b.kind === "slides" ? "Please look at the screen." : "");
  function openingCard(v) {
    const b = openingNow(v); if (!b) return "";
    return `<div class="zcard zbreak" role="status"><h2>A message from your organizer</h2><div style="font:700 20px var(--sans,inherit);margin:2px 0 4px">${esc(b.title)}</div><div class="zsmall" style="margin:0">${slotWhat(b)} The game starts in a moment.</div>${mediaAct(b)}</div>`;
  }
  function closingCard(v) {
    const b = closingNow(v); if (!b) return "";
    return `<div class="zcard zbreak" role="status"><h2>Thank you from your organizer</h2><div style="font:700 20px var(--sans,inherit);margin:2px 0 4px">${esc(b.title)}</div><div class="zsmall" style="margin:0">${slotWhat(b)}</div>${mediaAct(b)}${b.n < b.of ? `<button class="zbtn s alt" id="cnext" type="button" style="margin-top:10px">Next message (${b.n} of ${b.of})</button>` : ""}</div>`;
  }
  function breakCard(b) {
    const act = mediaAct(b);
    const what = b.kind === "lucky" ? `${b.winners || 3} ${b.winners === 1 ? "person is" : "people are"} picked at random when this break ends. Everyone has an equal chance.` : b.kind === "speech" ? "Please listen to the host." : b.kind === "slides" ? "Please look at the screen." : "";
    return `<div class="zcard zbreak" role="status"><h2>A short break</h2><div style="font:700 20px var(--sans,inherit);margin:2px 0 4px">${esc(b.title)}</div><div class="zsmall" style="margin:0">${what} The numbers continue in ${b.secondsLeft}s.</div>${act}</div>`;
  }

  function stillToWinRows(v) {
    const keys = ZG.keysInPlay(v.cfg.rewards);
    return keys.map((key) => {
      const lines = ZG.linesFor(v.cfg.rewards, key);
      const n = key === "unlucky" ? 0 : ZG.stillToWin(v.tickets, key, v.marks || []); // by what the player has marked: the screen never gives away a number they missed
      const mine = v.myIdx[key], won = new Set((v.won || []).filter((w) => w.round === v.round).map((w) => w.pattern + "#" + w.ordinal)), pressed = (v.pressed || []).includes(key), out = (v.outOf || []).includes(key);
      return lines.map((line) => {
        const total = lines.length;
        const name = (total > 1 ? ordinalName(line.ordinal) + " " : "") + KEYNAME(key);
        const res = v.results.find((r) => r.pattern === key && r.ordinal === line.ordinal);
        let right;
        if (key === "unlucky") right = res ? ((res.winners || []).includes(v.pid) ? `<em>Yours</em>` : `<i>Awarded</i>`) : `<i>decided at the first Full House</i>`;
        else if (res) right = won.has(key + "#" + line.ordinal) ? `<em>Yours${res.count > 1 ? " · shared by " + res.count : ""}</em>` : `<i>Awarded${res.count > 1 ? " to " + res.count : ""}</i>`;
        else if (out) right = `<i>out (two Bogeys)</i>`;
        else if (line.ordinal === 1 || v.results.some((r) => r.pattern === key && r.ordinal === line.ordinal - 1)) right = pressed ? `<em>Claimed, being checked</em>` : mine >= 0 ? `<em>Complete: press Claim</em>` : n >= 99 ? `<i>not possible on your ticket</i>` : `<i>${n} to go</i>`; // the next open position of the house: what this ticket can still do about it
        else right = `<i>after the ${ordinalName(line.ordinal - 1)}</i>`;
        return `<div class="zrow"><span>${esc(name)}${line.text ? `<br><small class="zsmall" style="margin:0">${esc(line.text)}</small>` : ""}<br>${howLine(key)}</span>${right}</div>`;
      }).join("");
    }).join("");
  }

  let annSeen = null, annSpoken = null;
  function annBanner(v) {
    const a = v.announcement;
    if (!a || a.id === annSeen) return "";
    return `<div class="zbanner info zann" role="alert"><b>Message from the organizer</b><br>${esc(a.text)} <button class="zsnd" id="annok">OK</button></div>`;
  }
  // ---------- short, friendly movement (about 200 to 400 ms; none with "reduce motion"). Each one plays once, when the thing it shows first appears (the page redraws itself every second). ----------
  const MOTION = () => { try { return !matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
  const COUNTS = {};
  const countUps = () => document.querySelectorAll("[data-count]").forEach((el) => {
    const key = el.dataset.ck || el.id || "c", to = Number(el.dataset.count), from = COUNTS[key] === undefined ? to : COUNTS[key]; COUNTS[key] = to;
    if (from === to || !MOTION()) { el.textContent = String(to); return; }
    const t0 = performance.now(); (function f(t) { const k = Math.min(1, (t - t0) / 350); el.textContent = String(Math.round(from + (to - from) * k)); if (k < 1 && el.isConnected) requestAnimationFrame(f); })(t0);
  });
  let NEWCALL = 0; // the number called since the last redraw (0 = none): its ball drops in and its place on the ticket is stamped
  const rangeOf = (n) => Math.min(8, Math.floor((n - 1) / 10)); // a colour per ten numbers: 1-10, 11-20 ... 81-90
  /** the big ball, a state chip, one plain line about what to do, and the last numbers as small balls */
  function callCard(v, last, sub) {
    const secs = v.nextCallInSec, running = v.phase === "play" && !v.locked && !v.paused && !v.brk && !v.intermission && v.log.length > 0;
    const tone = v.phase === "ended" ? "end" : v.paused || v.locked ? "pause" : running ? (secs !== null && secs <= 3 ? "go" : "soon") : "wait";
    const chip = v.phase === "ended" ? "Game over" : v.paused ? "Paused" : v.locked ? "Waiting to start" : v.waitingForStart ? "Waiting for the host" : v.startingInSec !== null ? "Starting in " + (v.startingInSec >= 120 ? clock(v.startingInSec) : v.startingInSec + "s") : v.waitingForHost ? "Waiting for the host" : !v.log.length ? "Get ready" : running && claimingNow(v) && v.callMode !== "host" ? "Claim now" : running && secs !== null && v.callMode !== "host" ? "Next number in " + secs + "s" : running && v.callMode === "host" ? "The host calls the numbers" : "Numbers coming";
    const total = v.late ? "since you joined" : "of 90";
    // Between two numbers (software calls): a big countdown 9, 8, 7 ... 1, then the number. Silent on purpose: the voice speaks only the number itself.
    const hostCalls = v.callMode === "host", ownTimer = claimingNow(v) && v.claimLeft !== null && v.claimLeft !== undefined, cdown = ownTimer ? "" : hostCalls ? (running && !v.waitingForHost ? `<div class="zquiet" id="hostline" role="status"><span>The host calls the numbers</span></div>` : "") : running && secs !== null && !v.waitingForHost && v.mode !== "hold" ? `<div class="zquiet" id="quietcount" role="timer" aria-label="Next number in ${secs} seconds"><span>Next number in ${secs}s</span><i><b style="width:${Math.max(0, Math.min(100, Math.round((1 - secs / Math.max(3, v.callSeconds || 12)) * 100)))}%"></b></i></div>` : ""; // small and quiet on purpose: no digits to stare at, no colour, no sound (only the number itself is spoken)
    const calledTotal = v.log.length + (v.late ? v.late.hidden || 0 : 0), few = v.log.slice(-6, -1).reverse();
    return `<div class="zcard zcall ztight"><div class="zchiprow"><span class="zchip2 ${tone}">${esc(chip)}</span></div>
        <div class="zrow1"><div class="zball"><div class="zbig ${last ? "r" + rangeOf(last) : "none"}${NEWCALL && NEWCALL === last ? " pop" : ""}" id="big" aria-live="assertive" aria-label="${last ? "Number just called " + last : "No number yet"}">${last ? `<span>${last}</span>` : "–"}</div></div>
          <div class="ztxt"><div class="zlab">Number just called</div><div class="zmeta" id="calledcount">${esc(ZG.calledLine(calledTotal))}</div>${cdown}<p class="zhelp" id="ballhelp">${v.phase === "ended" ? "The game is over." : last ? "Find it on your ticket and tap it." : "The first number will appear here."}</p></div></div>
        <div class="zprog" role="progressbar" aria-valuemin="0" aria-valuemax="90" aria-valuenow="${calledTotal}"><i style="width:${Math.min(100, Math.round(calledTotal / 90 * 100))}%"></i></div>
        ${few.length ? `<div class="zlastrow" id="lastfew"><span class="zlab">Last 5 numbers called</span><div class="zballs">${few.map((n) => `<i class="zlastn">${n}</i>`).join("")}</div></div>` : ""}<div class="zsub">${cdown ? "" : sub}</div>${v.phase === "ended" ? "" : `<p class="zsmall zwhat">${esc(TIP)}</p><p class="zsmall zkeepon" id="keepon">${esc(KEEPON)}</p>`}<p class="zsmall zfairline" id="fairline">Every number comes from a public random source and is the same on every phone. <a href="/fair.html" target="_blank" rel="noopener">How we keep it fair</a></p></div>`;
  }
  let LAST_CLAIM_NOW = "";
  // ---- everybody is told, calmly and in plain words, when a ticket claims a prize and what came of it (ticket numbers only, never names); each pop-up closes by itself
  const TOASTS = { seen: null, seenWon: null, list: [] };
  const toast = (text) => { const t = { text, gone: false }; TOASTS.list.push(t); if (TOASTS.list.length > 3) TOASTS.list.shift(); setTimeout(() => { t.gone = true; try { paint(); } catch { /* the next beat draws it */ } }, window.__toastMs || 6000); }; // (closed by its own timer, not by comparing clocks)
  function toastsFrom(v) {
    const feed = v.claimFeed || [], won = (v.results || []).filter((x) => x.pattern !== "lucky" && x.pattern !== "unlucky");
    if (TOASTS.seen === null) { TOASTS.seen = new Set(feed.map((c) => c.id)); TOASTS.seenWon = new Set(won.map((x) => x.pattern + "#" + x.ordinal + "#" + (x.round || 1))); return; } // what happened before the page opened is not announced again
    for (const c of feed) { if (TOASTS.seen.has(c.id)) continue; TOASTS.seen.add(c.id); toast(ZG.say(c.bogey ? "claim.w" : "claim.k", { t: c.ticket, p: KEYNAME(c.pattern) })); }
    for (const x of won) { const k = x.pattern + "#" + x.ordinal + "#" + (x.round || 1); if (TOASTS.seenWon.has(k)) continue; TOASTS.seenWon.add(k); const t = (x.tickets || [])[0], name = KEYNAME(x.pattern);
      toast(ZG.say(t ? "claim.a" : "claim.a2", { t: t || "", p: name })); toast(ZG.say("claim.g", { p: name })); }
    TOASTS.list = TOASTS.list.filter((x) => !x.gone);
  }
  const toastHtml = () => (TOASTS.list.some((x) => !x.gone) ? `<div class="ztoasts" id="claimtoasts" role="status" aria-live="polite">${TOASTS.list.filter((x) => !x.gone).map((x) => `<div class="ztoast">${esc(x.text)}</div>`).join("")}</div>` : "");
  // ---- another app's call or message took the player away: on return the page asks for the server's schedule at once and says so, calmly
  let hiddenAt = 0, hiddenLen = 0, AWAY = null;
  /** A18: the welcome-back line names the numbers that were called while the player was away (the Last 5 strip only keeps them for about a minute). */
  const awayText = (secs, missed) => `Welcome back. You were away for ${secs} seconds. ` + (!missed.length ? "No number was called while you were away." : missed.length <= 6 ? `Called meanwhile: ${missed.join(", ")}. Tap them on your ticket. If a prize is complete, press Claim.` : `${missed.length} numbers were called meanwhile; the last 6 were ${missed.slice(-6).join(", ")}. Tap on your ticket any number you missed: it marks only if it was called.`);
  const awayLine = (v) => (AWAY && Date.now() < AWAY.until ? `<div class="zbanner info" id="awayline" role="status">${esc(awayText(AWAY.secs, ((v && v.log) || []).slice(AWAY.from)))}</div>` : "");
  function wake() { // the page is in front again
    const secs = hiddenAt ? Math.round((Date.now() - hiddenAt) / 1000) : 0; hiddenAt = 0;
    if (secs >= 5) AWAY = { secs, from: hiddenLen, until: Date.now() + 20000 };
    try { rt.resync && rt.resync(); } catch { /* the loop asks again in a moment */ }
    Promise.resolve(rt.tick && rt.tick()).catch(() => {}).then(() => { try { paint(); } catch { /* drawn on the next beat */ } });
  }
  document.addEventListener("visibilitychange", () => { rt.beatOn = document.visibilityState !== "hidden"; if (document.visibilityState === "hidden") { if (!hiddenAt) { hiddenAt = Date.now(); try { hiddenLen = rt.view().log.length; } catch { hiddenLen = 0; } } } else wake(); }); // a hidden page sends no claim signal calls
  /** One plain sentence: what is happening now and what to do, in the same words on every screen (ZG.story). */
  function storyBarFor(v) {
    const role = ME.role === "organizer" ? "organizer" : ME.role === "host" ? "host" : "player", called = v.late ? v.log.length + (v.late.hidden || 0) : v.log.length, manual = v.startMode === "manual";
    let state;
    if (INFO.cancelled) state = "cancelled"; else if (INFO.dns) state = "neverStarted"; else if (v.stopped) state = "endedByOrganizer"; else if (v.phase === "ended") state = v.endedByPrizes ? "endedPrizes" : "endedAll"; else if (v.locked) state = "unpaid"; else if (v.paused) state = "paused"; else if (v.waitingForStart) state = "waitStart"; else if (v.log.length || v.late) state = "running";
    else { const left = manual ? v.startingInSec : v.nextCallInSec; state = left !== null && left !== undefined && left <= 300 ? "countdown" : "waiting"; }
    const st = ZG.story({ state, role, called, manual, time: ZG.dayTimeIst((1692803367 + (v.scheduledRound - 1) * 3) * 1000), countdown: ZG.mmss(manual ? v.startingInSec : v.nextCallInSec), by: v.pausedInfo ? v.pausedInfo.by : undefined });
    return `<div class="zstory" id="storyline" data-state="${state}"><b>${esc(st.say)}</b><span>${esc(st.doNow)}</span></div>`;
  }
  /** Under the ticket: a Claim button for every prize the player's marks complete, what was claimed and is being checked, this player's Bogeys, and the prizes the ticket is out of. */
  const namesOf = (keys) => keys.map((k) => KEYNAME(k)).join(" and ");
  /** Gold, near the top: the player has just completed a prize and must press Claim before the next number is called. */
  /** "Claim in the next 11 s" on the gold buttons: a nudge only (the game's clock decides). None when a Host calls the numbers. */
  const claimTimer = (v) => (v.callMode !== "host" && v.claimLeft !== null && v.claimLeft !== undefined ? `<small class="zclaimt">Claim in the next ${v.claimLeft} s</small>` : "");
  const claimingNow = (v) => (v.claimNow || []).length > 0;
  /** REHEARSAL: the same block at the top of every page of a rehearsal (Game ID, REHEARSAL GAME n, the sentence), and the calm page when it is over. */
  function showRehearsalBanner() {
    let el = document.getElementById("rehbanner"); const R = INFO.rehearsal;
    if (!R) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("div"); el.id = "rehbanner"; el.setAttribute("role", "status"); el.style.cssText = "background:#b3261e;color:#fff;padding:10px 14px;text-align:center;line-height:1.35;position:sticky;top:0;z-index:40"; document.body.insertBefore(el, document.body.firstChild); }
    if (el.dataset.t !== R.block) { el.dataset.t = R.block; const ln = String(R.block).split("\n"); el.innerHTML = `<div>${esc(ln[0] || "")}</div><div style="font-size:1.25rem;font-weight:900">${esc(ln[1] || "")}</div><div style="font-weight:700">${esc(ln.slice(2).join(" "))}</div>`; }
  }
  const rehearsalOverHtml = () => `<div class="zcard" id="rehover"><h2>This rehearsal is over.</h2><p>Thank you for practising.</p>${INFO.rehearsal && INFO.rehearsal.realId ? `<p><a class="zbtn zgold" href="/z.html?e=${encodeURIComponent(INFO.rehearsal.realId)}" id="realgame">Open the real game</a></p>` : ""}</div>`;
  let BOGEYASK = null; // the prize a grey Claim button was pressed for: the in-page "Are you sure" box is open
  const bogeyAskHtml = () => (BOGEYASK ? `<div class="zmodal" id="bogeyask" role="dialog" aria-modal="true"><div class="zmbox"><p>You have no claim right now. If you submit, it counts as a wrong claim (Bogey).</p><div class="zmrow"><button type="button" id="bgcancel" class="zbtn">Cancel</button><button type="button" id="bgsubmit" class="zbtn zdanger">Submit</button></div></div></div>` : "");
  function claimAlert(v) {
    if (!(v.claimNow || []).length) return "";
    return `<div class="zalert on" id="claimalert" role="alert"><b>You have won the ${esc(namesOf(v.claimNow))}. Click CLAIM to claim.</b><button type="button" class="zgold" id="claimtop" data-claim="${esc(v.claimNow[0])}"><b>CLAIM</b>${claimTimer(v)}</button></div>`;
  }
  /** A big button fixed at the bottom of the screen, one per prize that is ready; after the press it says that the claim was sent. */
  function claimStick(v) {
    const ready = v.claimNow || [];
    const resolved = (k) => ZG.linesFor(v.cfg.rewards, k).every((l) => (v.results || []).some((x) => x.pattern === k && x.ordinal === l.ordinal));
    const waiting = (v.pressed || []).filter((k) => !resolved(k) && !(v.won || []).some((w) => w.round === v.round && w.pattern === k)); // claimed, and the answer is not out yet
    if (!ready.length && !(waiting.length && v.phase === "play" && !v.paused)) return "";
    const btns = ready.map((k, i) => `<button type="button" class="zbigclaim${i ? " zmore" : ""}" data-claim="${esc(k)}"><b>CLAIM</b><small>${esc(KEYNAME(k))}</small>${i ? "" : claimTimer(v)}</button>`).join(""); // the first is big; others ready at the same time are compact so the bar never covers the screen
    const sendingK = waiting.filter((k) => !(v.claimed || []).includes(k)), checkingK = waiting.filter((k) => (v.claimed || []).includes(k));
    const done = !ready.length ? `<div class="zsentline" role="status">${sendingK.length ? `Sending your claim…<small>${esc(sendingK.map((k) => KEYNAME(k)).join(", "))}. Keep this page open.</small>` : `Claim sent. Checking…<small>${esc(checkingK.map((k) => KEYNAME(k)).join(", "))}</small>`}</div>` : "";
    return `<div class="zclaimbar on" id="claimbar">${btns}${done}</div>`;
  }
  function claimBar(v) {
    if (!v.tickets.length || (v.phase !== "play" && v.phase !== "ended")) return "";
    const won = new Set((v.won || []).map((w) => w.round + ":" + w.pattern));
    const open = v.claimOpen || [], btns = "";
    const stale = (v.claimable || []).filter((k) => !open.includes(k));
    const staleNote = stale.length && !v.paused ? `<p class="zsmall zstale" id="stalenote">The time to claim ${esc(namesOf(stale))} has passed: a claim must be pressed before the next number is called.</p>` : "";
    const notWon = (v.pressed || []).filter((k) => !won.has(v.round + ":" + k));
    const allOut = (k) => ZG.linesFor(v.cfg.rewards, k).every((l) => v.results.some((r) => r.pattern === k && r.ordinal === l.ordinal)); // every position of the house is awarded
    const waiting = notWon.filter((k) => !allOut(k)); // claimed, a position is still open: being checked
    const sending = waiting.filter((k) => !(v.claimed || []).includes(k)), checking = waiting.filter((k) => (v.claimed || []).includes(k)); // sending: pressed on this phone but not yet taken by the game's store (it is tried again every second)
    const lost = notWon.filter((k) => allOut(k)); // claimed, every position went to others
    const bog = (v.bogeys || []).map((b) => `${esc(KEYNAME(b.pattern))} ${b.n}`).join(", ");
    const out = (v.outOf || []).map((k) => `<div class="zbanner warn zout" role="status">Two Bogeys on ${esc(KEYNAME(k))}: this ticket is out of the ${esc(KEYNAME(k))} prize. Other prizes are still open to you.</div>`).join("");
    return `<div class="zclaims" id="claims">${btns ? `<div class="zclaimrow">${btns}</div>` : ""}${staleNote}${v.lateClaim ? `<div class="zbanner warn zlate" id="latenote" role="alert">${esc(v.lateClaim)}</div>` : ""}<p class="zsmall zrule" id="claimhint">The Claim button turns gold when you complete a prize. Press it before the next number is called.</p>
      ${sending.length ? `<p class="zsmall zsent zsending" role="status">Sending your claim for ${sending.map((k) => esc(KEYNAME(k))).join(", ")}. Keep this page open and your screen on until it says sent.</p>` : ""}
      ${checking.length ? `<p class="zsmall zsent" role="status">Claim sent for ${checking.map((k) => esc(KEYNAME(k))).join(", ")}. The software is checking it against the called numbers.</p>` : ""}
      ${lost.map((k) => { let mine = -1; try { mine = ZG.completionIndexKey(v.tickets, k, v.log); } catch { /* unknown: the second line says so */ } const ls = ZG.lostClaimLines(KEYNAME(k), (v.results || []).filter((x) => x.pattern === k), mine); return `<p class="zsmall zlost"><b>${esc(KEYNAME(k))}: not this time.</b><br>${esc(ls[0])}<br>${esc(ls[1])}</p>`; }).join("")}
      ${bog ? `<p class="zsmall zbogeys">Bogeys: ${bog}</p>` : ""}${out}<div id="tapnote"></div></div>`;
  }
  /** SIDE claim button, once per prize (its first open line): gold when the player has this prize to claim, otherwise grey (while the game is in play) and a press asks first, because it would count as a wrong claim (a Bogey). */
  const SIDE_SEEN = new Set();
  function sideClaim(v, key) {
    if (key === "unlucky" || key === "lucky" || v.phase !== "play" || v.locked || !v.tickets.length || SIDE_SEEN.has(key)) return "";
    SIDE_SEEN.add(key);
    const gold = (v.claimNow || []).includes(key) || (v.paused && (v.claimOpen || []).includes(key)); // (paused: the claim is still valid, the game's clock does not run)
    if ((v.outOf || []).includes(key) || (v.pressed || []).includes(key)) return "";
    return gold ? `<button type="button" class="zside zgold" data-claim="${esc(key)}"><b>CLAIM</b>${claimTimer(v)}</button>` : `<button type="button" class="zside zgrey" data-claim="${esc(key)}" data-grey="1" aria-label="Claim ${esc(KEYNAME(key))}: you have no claim right now"><b>CLAIM</b></button>`;
  }
  /** Every prize and whether it is still open: the open ones first, the claimed ones after, crossed out with a small "claimed". */
  function livePrizesCard(v) {
    if (!ZG.prizeStatus || !v.cfg || !v.cfg.rewards) return "";
    SIDE_SEEN.clear();
    const list = ZG.prizeStatus(v.cfg, v.results || [], v.round || 1), lucky = v.lucky || [];
    if (!list.length && !lucky.length) return "";
    const mine = new Set((v.won || []).filter((w) => w.round === v.round).map((w) => w.pattern + "#" + w.ordinal));
    const open = list.filter((p) => !p.claimed).length + lucky.filter((l) => !l.published).length; // a lucky draw is a prize like the others
    const rows = list.map((p) => {
      const me = mine.has((p.key === "full2" ? "full2" : p.key) + "#" + p.ordinal);
      if (p.claimed) { const res = (v.results || []).find((x) => x.pattern === p.key && x.ordinal === p.ordinal && (x.round || 1) === (v.round || 1)), tk = res && res.tickets && res.tickets.length ? res.tickets : null;
        return `<li class="done"><span class="zic">&#10003;</span><span class="znm"><s>${esc(p.name)}${p.text ? ": " + esc(p.text) : ""}</s> <small class="zwonby">${tk ? "Won by Ticket " + tk.join(", ") : "Already won"}</small></span>${me ? ' <b class="zme">You</b>' : ""}</li>`; }
      const need = p.key === "unlucky" || p.key === "lucky" ? null : ZG.stillToWin(v.tickets, p.key, v.marks || []);
      return `<li class="open"><span class="zic">&#9733;</span><span class="znm"><b>${esc(p.name)}</b>${p.text ? ": " + esc(p.text) : ""}${need !== null && need !== undefined && v.tickets.length ? `<small class="zneed">You need ${need} more ${need === 1 ? "number" : "numbers"}</small>` : ""}</span><span class="ztag">To win</span>${sideClaim(v, p.key)}</li>`;
    }).join("") + lucky.map((l) => { const res = (v.results || []).find((x) => x.pattern === "lucky" && x.ordinal === l.ordinal), tk = res && res.tickets && res.tickets.length ? res.tickets : null;
      return l.published ? `<li class="done lucky"><span class="zic">&#10003;</span><span class="znm"><s>Lucky draw: ${esc(l.title)}</s> <small class="zwonby">${l.style === "scratch" && !(scratched.has(l.ordinal) || (seenAt[l.ordinal] && Date.now() - seenAt[l.ordinal] > 45000)) ? "Scratch the card to see" : l.won ? "You won!" : tk ? "Won by Ticket " + tk.join(", ") : "Already drawn"}</small></span></li>` : `<li class="open lucky"><span class="zic">&#9733;</span><span class="znm"><b>Lucky draw: ${esc(l.title)}</b><small class="zneed">${l.winners} ${l.winners === 1 ? "ticket is" : "tickets are"} picked at random, whoever is playing</small></span><span class="ztag">To win</span></li>`; }).join("");
    return `<div class="zcard zps" id="prizepanel"><h2>Prizes${open ? " still to win · " + open : " · all won"}</h2><div class="zlegend"><span><i class="g"></i>Still to win</span><span><i class="s"></i>Already won</span></div><ul class="zpl">${rows}</ul></div>`;
  }
  function playView(v) {
    const called = new Set(v.marks || []); // what the player has tapped (the ticket never marks itself)
    const last = v.log[v.log.length - 1];
    toastsFrom(v);
    const banners = [storyBarFor(v), claimAlert(v), awayLine(v)];
    { const now = (v.claimNow || []).join(","); if (now && now !== LAST_CLAIM_NOW) { try { navigator.vibrate && navigator.vibrate(220); } catch {} } LAST_CLAIM_NOW = now; } // a short buzz the moment a prize becomes claimable, where the phone allows it
    if (v.reconnecting) banners.push(`<div class="zbanner info" id="reconnecting" role="status">${esc(ZG.say("net.reconnecting"))}</div>`);
    if (v.error) banners.push(`<div class="zbanner warn" role="alert">${esc(v.error)}</div>`);
    if (v.locked) banners.push(ME.role === "organizer" || ME.role === "host" ? `<div class="zbanner warn" role="status"><b>Payment pending for this game.</b> The game starts 2 minutes after the payment is confirmed. Open your console to pay. Your ticket is safe. Keep this page open.</div>` : `<div class="zbanner warn" role="status"><b>Waiting for the Organizer or Host to start the game.</b> Your ticket is safe. Keep this page open: it begins as soon as they are done.</div>`);
    else if (v.stopped) banners.push(`<div class="zbanner info">The organizer has ended this game.</div>`);
    else if (v.paused) { const p = v.pausedInfo, hm = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }), left = p ? Math.max(1, Math.round(p.secondsLeft / 60)) : 0; banners.push(`<div class="zbanner pause" role="status" id="pausebanner"><b>PAUSED</b><span>${p && p.restartsInSec ? "Restarts in " + p.restartsInSec + (p.restartsInSec === 1 ? " second" : " seconds") + "." + (v.callMode === "host" ? "" : " The first number comes " + (v.callSeconds || 12) + " seconds after that.") : p ? "Paused by " + esc(p.by) + " at " + esc(hm(p.sinceMs)) + ". The numbers start again at about " + esc(hm(p.endMs)) + " (in about " + left + (left === 1 ? " minute" : " minutes") + "), or sooner when they press Resume. Keep this page open." : "The game is paused. It will carry on shortly. Keep this page open."}</span></div>`); }
    else if (v.mode === "hold" && v.nowRound !== null && v.phase !== "ended") banners.push(`<div class="zbanner warn">Checking with the organizer… numbers will continue in a moment.</div>`);
    else if (v.mode === "blind" && v.phase !== "ended") banners.push(`<div class="zbanner warn">Cannot reach the organizer's controls right now. Play continues; a pause may appear late.</div>`);
    // (one end message only: the story line at the top says how the game ended)
    const sub = v.phase === "ended" || v.locked || v.brk || v.intermission || (DEMO && !DEMO.running) ? "" : v.waitingForStart ? "Waiting for the host to begin the game" : v.startingInSec !== null ? "The game starts in " + (v.startingInSec >= 120 ? clock(v.startingInSec) : v.startingInSec + " seconds") : v.late && v.late.secondsUntil > 0 ? "Your numbers start in " + clock(v.late.secondsUntil) : v.waitingForHost ? "The host presses for the next number" : v.log.length === 0 ? (v.nextCallInSec !== null ? (v.nextCallInSec > GRACE_SECS ? "Starting in " + clock(v.nextCallInSec - GRACE_SECS) : "First number in " + clock(v.nextCallInSec)) : "Getting ready…") : v.paused || v.mode === "hold" ? "" : v.waitingForHost ? "The host presses for the next number" : v.nextCallInSec !== null && v.callMode !== "host" && !(claimingNow(v) && v.claimLeft !== null) ? "Next number in " + v.nextCallInSec + "s" : "";
    const still = v.tickets.length ? stillToWinRows(v) : "";
    const chk = v.pendingChecks > 0 ? `<p class="zsmall">Double-checking ${v.pendingChecks} earlier number${v.pendingChecks === 1 ? "" : "s"} in the background.</p>` : "";
    const curWins = v.won.filter((w) => w.round === v.round), winSet = new Set(curWins.flatMap((w) => w.cells));
    const ribbon = curWins.length ? `<div class="zwin" role="status">&#127881; Congratulations! You won ${curWins.map((w) => esc(lineName(v.cfg, w.pattern, w.ordinal))).join(", ")}${curWins.some((w) => w.text) ? " &middot; " + curWins.filter((w) => w.text).map((w) => esc(w.text)).join(", ") : ""}</div>` : "";
    const tix = (v.tickets.length ? lookPicker() : "") + v.tickets.map((t, i) => (v.tickets.length > 1 ? `<div class="zsmall" style="margin:${i ? 12 : 0}px 0 4px"><b>Ticket ${"AB"[i]}</b></div>` : "") + ticketHtml(t, called, v.tickets.length > 1 ? "Ticket " + "AB"[i] : DEMO ? "Video ticket" : "Your ticket", winSet)).join("");
    const sndBtn = `<button class="zsnd zsndin" id="snd" aria-pressed="${sound}">${!sound ? "&#128263; Sound off" : !window.TBAudio || TBAudio.unlocked ? "&#128266; Sound on" : "&#128266; Tap for sound"}</button>`;
    return `${brandStrip(sndBtn)}<div class="zplay">
      ${demoCard(v)}${demoGameCard()}${annBanner(v)}${banners.join("")}
      ${v.phase === "ended" ? finalCard(v) + closingCard(v) + confirmCard(v) + prizesCard() : ""}
      ${waitingRoom(v)}
      ${openingCard(v)}
      ${lateCard(v)}
      ${roundCards(v)}
      ${v.brk ? breakCard(v.brk) : ""}
      ${callCard(v, last, sub)}
      <div class="zcard ztk${curWins.length ? " zwon" : ""}"><h2>${DEMO ? 'Video ticket <span class="zdemotag">VIDEO</span>' : (v.tickets.length > 1 ? "Your tickets" : "Your ticket") + demoTag()}</h2>${ribbon}${tix}${claimBar(v)}</div>
      ${v.phase === "ended" ? "" : livePrizesCard(v)}
      ${v.phase === "ended" ? "" : prizesCard()}
      ${mineCard(v)}${inviteCard(v)}
      <div class="zcard"><h2>Still to win</h2>${still}${chk}</div>
      ${luckyCard(v)}${v.phase === "ended" ? "" : '<ol class="zrules" id="zrules"><li>This game works like the real one.</li><li>When a number is called, tap it on your ticket to cross it out.</li><li>If you complete a prize, press Claim before the next number is called.</li></ol>'}</div>${claimStick(v)}${toastHtml()}${bogeyAskHtml()}`;
  }

  // ---------- present check-in: the ticket opens only after this ----------
  // Name and mobile are confirmed (or edited), the invite chain is shown (never editable), the 4-digit code on THIS ticket page is typed, Submit appears only when all of that is done.
  const CK = { loaded: false, loading: false, at: -1e9, present: false, open: false, opensMs: 0, ids: null, code: "", invitedBy: null, err: "", fatal: "", force: false, busy: false, html: "", v: { name: null, mobile: null, okN: false, okM: false, code: "", editN: false, editM: false } };
  async function loadCk(v) {
    if (!INFO.checkin || !v.pid || CK.present || CK.loading || performance.now() - CK.at < (CK.open ? 60000 : 5000)) return;
    CK.loading = true; CK.at = performance.now();
    try {
      const r = await api("GET", `/api/z/${EID}/checkin?pid=${encodeURIComponent(v.pid)}&device=${encodeURIComponent(myDevice())}`);
      if (r && r.required === false) INFO.checkin = false;
      else if (r) { CK.fatal = ""; CK.loaded = true; CK.present = !!r.present; CK.open = !!r.open; CK.opensMs = r.opensMs; CK.ids = { game: r.gameId, participant: r.participantId, ticket: r.ticketId }; if (r.code) CK.code = r.code; CK.invitedBy = r.invitedBy || null; if (CK.v.name === null) { try { const k = JSON.parse(store.get("ctz:" + EID + ":ck") || "null"); if (k && typeof k === "object") Object.assign(CK.v, { name: k.name, mobile: k.mobile, okN: !!k.okN, okM: !!k.okM, code: String(k.code || "").slice(0, 4), editN: !!k.editN, editM: !!k.editM }); } catch { /* start fresh */ } } // the same link again: the half-filled check-in is where they left it
      if (CK.v.name === null) CK.v.name = r.name || ""; if (CK.v.mobile === null) CK.v.mobile = r.mobile || ""; }
    } catch (e) {
      if (e && e.status === 403) { // not a "try again later": this ticket was taken off the game, or it belongs to another phone
        const m = String(e.message || "");
        if (e.code === "removed" || /not a participant|removed/i.test(m)) ME.removed = true; else CK.fatal = m || "This ticket cannot check in from this phone."; // the 1-second loop then draws the right screen
        CK.loaded = true;
      } /* any other trouble: asked again in a few seconds */
    }
    CK.loading = false;
  }
  const KEEPON = "Tip: keep this screen on, and turn on Do Not Disturb, so a call or message does not make you miss a number."; // TA08 / A18: one plain line, the same on the check-in, the ticket and the pause
  const ckTime = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }); // the time on THIS phone, with its own time zone named: people play from all over the world
  function checkinView() {
    const ids = CK.ids ? `<div class="zckids"><div><span>Game ID</span><b>${esc(CK.ids.game)}</b></div><div><span>Participant ID</span><b>${esc(CK.ids.participant)}</b></div><div><span>Ticket ID</span><b>${esc(CK.ids.ticket)}</b></div></div>` : "";
    if (CK.fatal) return `${brandStrip()}${demoGameCard()}<div class="zcard" role="status"><h2>We could not open your check-in</h2><p class="zsmall" style="margin:0">${esc(CK.fatal)}</p></div>`;
    if (!CK.loaded) return `${brandStrip()}${demoGameCard()}<div class="zcard"><p class="zmsg">Loading your check-in…</p></div>`;
    if (!CK.open) {
      const left = Math.max(0, Math.round((CK.opensMs - Date.now()) / 1000));
      return `${brandStrip()}${demoGameCard()}<div class="zcard zck"><div class="zeyebrow">Before the game</div><h2>Check-in opens at ${esc(ckTime(CK.opensMs))}</h2>${ids}<p class="zsmall">Check-in opens 5 minutes before the game starts. Keep this page open: the check-in appears here by itself, and your ticket opens once you are marked present.</p><p class="zsmall zkeepon">${esc(KEEPON)}</p><div class="zckwait"><span>Opens in</span> <b>${esc(clock(left))}</b></div></div>`;
    }
    const x = CK.v, ready = x.okN && x.okM && String(x.code).length === 4;
    return `${brandStrip()}${demoGameCard()}<div class="zcard zck"><div class="zeyebrow">Before the game</div><h2>Mark yourself present</h2>${ids}
      <p class="zsmall">Check your name and mobile number, type the code shown below, and press Submit. Your ticket opens when you are marked present.</p>
      <p class="zsmall zkeepon">${esc(KEEPON)}</p>
      <p class="zsmall zckkeep">We keep the time you check in (and a corrected name or number) with your other game data, and delete it within 24 hours after the game ends. If you win, the time of your check-in is kept for 365 days with the winners record.</p>
      <div class="zckrow"><label for="ckname">Your name</label><input id="ckname" class="zin" autocomplete="off" maxlength="60" value="${esc(x.name)}"${x.editN ? "" : " disabled"}><button type="button" class="zmini" id="ckeditn">${x.editN ? "Done" : "Edit"}</button></div>
      <label class="zchk"><input type="checkbox" id="ckokn"${x.okN ? " checked" : ""}> This name is correct</label>
      <div class="zckrow"><label for="ckmob">Your mobile number</label><input id="ckmob" class="zin" inputmode="tel" autocomplete="off" maxlength="14" value="${esc(x.mobile)}"${x.editM ? "" : " disabled"}><button type="button" class="zmini" id="ckeditm">${x.editM ? "Done" : "Edit"}</button></div>
      <label class="zchk"><input type="checkbox" id="ckokm"${x.okM ? " checked" : ""}> This mobile number is correct</label>
      ${CK.invitedBy ? `<div class="zckinv">You came in through <b>${esc(CK.invitedBy)}</b>. You cannot edit this line.</div>` : ""}
      <div class="zckcode"><span>Your code</span><b id="ckshow" aria-label="Your code">${esc(CK.code)}</b></div>
      <label for="ckcode">Type your code here</label><input id="ckcode" class="zin zckin" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="4" placeholder="4 digits" value="${esc(x.code)}">
      <div id="ckerr" class="zckerr" role="alert">${CK.err ? esc(CK.err) : ""}</div>
      <p id="ckhint" class="zsmall zckhint"${ready ? " hidden" : ""}>To press Submit: tick both boxes and type your 4-digit code.</p>
      <button type="button" class="zbtn" id="cksubmit"${CK.busy ? " disabled" : ""}>Submit</button></div>`;
  }
  function bindCheckin() {
    const $ = (id) => document.getElementById(id), x = CK.v, keep = () => { try { store.set("ctz:" + EID + ":ck", JSON.stringify(x)); } catch { /* not kept */ } }, sync = () => { keep(); const h = $("ckhint"); if (h) h.hidden = !!(x.okN && x.okM && String(x.code).length === 4); };
    const clearErr = () => { CK.err = ""; const e = $("ckerr"); if (e) e.textContent = ""; }, hook = (id, fn) => { const el = $(id); if (el) el.oninput = () => { fn(el); clearErr(); sync(); }; }; // A15: ticking a box clears the red line too (it said "tick the box" and kept saying it)
    hook("ckname", (el) => { x.name = el.value; }); hook("ckmob", (el) => { x.mobile = el.value; });
    hook("ckcode", (el) => { el.value = el.value.replace(/\D/g, "").slice(0, 4); x.code = el.value; });
    const chk = (id, key) => { const el = $(id); if (el) el.onchange = () => { x[key] = el.checked; clearErr(); sync(); }; }; chk("ckokn", "okN"); chk("ckokm", "okM");
    const ed = (id, key, field) => { const el = $(id); if (el) el.onclick = () => { x[key] = !x[key]; if (key === "editM" && x.editM && String(x.mobile).includes("*")) x.mobile = ""; CK.html = ""; CK.force = true; paint(); const f = $(field); if (f && x[key]) f.focus(); }; }; ed("ckeditn", "editN", "ckname"); ed("ckeditm", "editM", "ckmob");
    const go = $("cksubmit"); if (go) go.onclick = async () => {
      if (CK.busy) return;
      const miss = []; if (!x.okN) miss.push('tick "This name is correct"'); if (!x.okM) miss.push('tick "This mobile number is correct"'); if (String(x.code).length !== 4) miss.push("type your 4-digit code");
      if (miss.length) { CK.err = "Before you press Submit: " + miss.join(", ") + "."; const e0 = $("ckerr"); if (e0) e0.textContent = CK.err; return; } // the button is always there: when something is missing, it says what
      CK.busy = true; CK.err = ""; go.disabled = true;
      try {
        const body = { pid: rt.view().pid, device: myDevice(), code: x.code, confirmName: !!x.okN, confirmMobile: !!x.okM };
        if (x.editN && x.name) body.name = x.name; if (x.editM && x.mobile) body.mobile = x.mobile;
        const r = await api("POST", `/api/z/${EID}/checkin`, body);
        if (r && r.present) { CK.present = true; CK.err = ""; try { store.set("ctz:" + EID + ":ck", ""); } catch { /* ignore */ } }
      } catch (e) { const m = e && e.message || ""; CK.err = !m ? "That did not work. Please try again." : RAW.test(m) ? "No signal. Your answers are kept. Press Submit again." : m; }
      CK.busy = false; CK.html = ""; CK.force = true; paint();
    };
    sync();
  }
  // Keep the screen on while numbers are being called (or are about to be): a phone that locks misses the number and the claim window. Where the phone cannot do it, nothing happens.
  const wantAwake = (v, o) => !o.dns && !o.cancelled && !o.removed && !v.stopped && v.phase !== "ended" && (!!o.checkinWaiting || (v.phase === "play" && !v.locked && (v.log.length > 0 || (v.nextCallInSec !== null && v.nextCallInSec <= o.graceSecs + 60)))); // TA08: held from check-in to the end of the game, a pause included (the numbers come back after the break)
  let wl = null, wlAt = 0, awake = false;
  async function keepAwake(want) {
    try {
      if (!want) { if (wl) { const x = wl; wl = null; await x.release(); } return; }
      if (wl || !navigator.wakeLock || document.visibilityState === "hidden" || Date.now() - wlAt < 20000) return;
      wlAt = Date.now(); wl = await navigator.wakeLock.request("screen");
      wl.addEventListener("release", () => { wl = null; });
    } catch { wl = null; /* refused, or not supported (some in-app browsers): the page just asks the person to keep the screen on */ }
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { wlAt = 0; keepAwake(awake); } });
  function paint() {
    if (HOLD.held(paint)) return;
    const v = rt.view();
    showRehearsalBanner();
    if (INFO.rehearsal && INFO.rehearsal.over) { $app.innerHTML = rehearsalOverHtml(); return; } // an ended rehearsal: nothing else is shown, the real game's link is offered
    if (BOGEYASK && (v.claimNow || []).length) BOGEYASK = null; // a real prize to claim: the question must never sit on top of the gold buttons
    if (window.ctzView) window.ctzView(v); // the flight recorder (blackbox.js) learns which stage the game is in
    awake = wantAwake(v, { dns: INFO.dns, cancelled: INFO.cancelled, removed: ME.removed, checkinWaiting: !!(INFO.checkin && v.pid && !CK.present), graceSecs: GRACE_SECS }); keepAwake(awake); // held from check-in (or about a minute before the first number) to the end of the game, a pause included
    if (!v.won) v.won = []; // an older saved copy of the game code during an update: never break the screen
    if (INFO.dns) { if (timer) { clearInterval(timer); timer = null; } clearInterval(J.timer); mediaHost.style.display = "none"; $app.innerHTML = dnsView(); window.__ctzOff = v.phase === "boot"; paintBrand(); return; } // a game that did not start: one calm screen, nobody can join or pay
    if (v.phase === "missing" || v.phase === "boot") { $app.innerHTML = (INFO.brand || v.phase === "boot" ? brandStrip() : "") + `<p class="zmsg">${esc(v.phase === "boot" && !navigator.onLine ? "No connection right now. Your ticket is safe on this phone. This page tries again by itself every few seconds and as soon as you are back online." : v.error || "Loading…")}</p><div class="zretry"><button class="zbtn" id="retry" type="button">Try again</button>${v.phase === "boot" ? `<p class="zsmall" style="text-align:center">This page also tries again by itself every few seconds.</p>` : ""}</div>`; paintBrand(); window.__ctgRetry = bootUp; const rb = document.getElementById("retry"); if (rb) rb.onclick = () => { rb.disabled = true; rb.textContent = "Trying…"; bootUp(); }; if (v.phase === "boot" && !bootTimer) bootTimer = setTimeout(bootUp, 8000); return; }
    if (INFO.cancelled) { if (timer) { clearInterval(timer); timer = null; } clearInterval(J.timer); mediaHost.style.display = "none"; $app.innerHTML = cancelledView(); paintBrand(); return; } // a cancelled game: one calm screen, nothing else
    if (v.phase === "join") { const f = document.getElementById("ph") || document.getElementById("nm") || document.getElementById("emp"); if (f && document.activeElement === f) return; $app.innerHTML = joinView(J.mode && J.mode !== "needPhone" ? null : v.error); paintBrand(); bindJoin(); return; }
    if (ME.removed) { if (timer) { clearInterval(timer); timer = null; } mediaHost.style.display = "none"; $app.innerHTML = removedView(); paintBrand(); return; } // taken off the list: the phone stops
    if (INFO.checkin && v.pid && !CK.present) { // the ticket is hidden until the person marks themselves present
      loadCk(v); const af = document.activeElement; if (!CK.force && af && /^ck/.test(af.id || "")) return; CK.force = false; // never wipe a box someone is typing in, but a redraw the Edit / Submit buttons ask for goes through
      const h = checkinView(); if (h !== CK.html || !$app.firstChild) { CK.html = h; $app.innerHTML = h; paintBrand(); bindCheckin(); }
      return;
    }
    CK.html = "";
    const fresh = syncPrizes(v); reportToStore(v); loadCf(v); pollMe(v);
    { const af = document.activeElement; if (af && (af.id === "cfnm" || af.id === "cfph" || af.id === "mi-name" || af.id === "mi-phone")) return; } // never wipe a form someone is typing in
    NEWCALL = v.log.length > lastLen && !firstPaint && MOTION() ? v.log[v.log.length - 1] : 0;
    KEEP($app, () => { $app.innerHTML = playView(v); });
    countUps(); showTapNote(); bindTicket(v);
    paintBrand(); syncMedia(v); bindShare(); bindDemo(); bindConfirm(v); loadInvites(v); bindInvite(v); loadMine(v); bindMine(v);
    if (fresh.length) showHurray(fresh);
    const s = document.getElementById("snd");
    if (s) s.onclick = async () => { if (sound && window.TBAudio && !TBAudio.unlocked) { TBAudio.enabled = true; await TBAudio.unlock(); try { TBAudio.say("Sound is on.", ""); } catch {} paint(); return; } sound = !sound; store.set("ctz-sound", sound ? "on" : "off"); if (window.TBAudio) { TBAudio.enabled = sound; if (sound) await TBAudio.unlock(); } paint(); };
    if (v.log.length > lastLen) { if (!firstPaint && v.log.length === lastLen + 1 && sound && window.TBAudio) TBAudio.play(v.log[v.log.length - 1]); lastLen = v.log.length; }
    firstPaint = false;
    const cn = document.getElementById("cnext"); if (cn) cn.onclick = () => { closingIdx += 1; paint(); };
    const ok = document.getElementById("annok"); if (ok) ok.onclick = () => { annSeen = v.announcement.id; paint(); };
    if (v.announcement && v.announcement.id !== annSpoken) { annSpoken = v.announcement.id; if (sound && window.TBAudio) TBAudio.say(v.announcement.text); try { navigator.vibrate && navigator.vibrate(120); } catch {} }
    document.querySelectorAll("[data-scr]").forEach((b) => (b.onclick = () => { scratched.add(Number(b.dataset.scr)); paint(); }));
    const st = document.getElementById("soundtest"); if (st) st.onclick = async () => { if (window.TBAudio) { TBAudio.enabled = true; await TBAudio.unlock(); TBAudio.test(); } };
  }
  /** Real housie: a tap on a ticket number marks it (or unmarks it); a tap on a number not called yet is refused in place. Claim sends the claim, or shows the Bogey. */
  const claimBusy = new Set(); // the prizes being sent right now: one slow claim never blocks another prize's Claim button
  function bindTicket(v) {
    const tap = (el) => {
      const n = Number(el.dataset.tap); if (!n) return;
      const r = rt.mark(n);
      if (!r.ok) { tapNote(r.error, 400); try { navigator.vibrate && navigator.vibrate([60, 40, 60]); } catch {} }
      else { TAP = null; NEWMARK = r.marked && MOTION() ? n : 0; try { navigator.vibrate && navigator.vibrate(20); } catch {} }
      paint(); NEWMARK = 0;
    };
    document.querySelectorAll("input[name=zlook]").forEach((r) => (r.onchange = () => { LOOK = r.value === "modern" ? "modern" : "retro"; store.set("ctz-look", LOOK); paint(); }));
    document.querySelectorAll("[data-tap]").forEach((el) => { el.onclick = () => tap(el); el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tap(el); } }; });
    { const c = document.getElementById("bgcancel"), s = document.getElementById("bgsubmit"); if (c) c.onclick = () => { BOGEYASK = null; paint(); }; if (s) s.onclick = async () => { const k = BOGEYASK; BOGEYASK = null; await pressClaim(k, null); }; }
    document.querySelectorAll("[data-claim]").forEach((b) => (b.onclick = async () => {
      if (b.dataset.grey) { BOGEYASK = b.dataset.claim; paint(); return; } // no claim right now: ask first
      await pressClaim(b.dataset.claim, b);
    }));
  }
  /** One press of any gold button (top, bottom or side) sends ONE claim for everything the player has to claim; a second press while it is going does nothing. */
  async function pressClaim(key, btn) {
    const gold = (rt.view().claimNow || []).slice(); const keys = gold.includes(key) || !gold.length ? (gold.length ? gold : [key]) : [key];
    if (keys.some((k) => claimBusy.has(k))) return; keys.forEach((k) => claimBusy.add(k)); if (btn) btn.disabled = true;
    try {
      for (const k of keys) {
        const r = await rt.claim(k);
        if (!r.ok) { tapNote(r.error, 400); try { navigator.vibrate && navigator.vibrate([80, 50, 80, 50, 80]); } catch {} if (sound && window.TBAudio && r.bogey) TBAudio.say("Bogey!"); }
        else { TAP = null; if (sound && window.TBAudio) TBAudio.say(r.sent ? "Claim sent for " + KEYNAME(k) : "Claim saved. Sending it now. Keep this page open."); }
      }
    } catch { tapNote("Could not send your claim. Please press Claim again.", 0); }
    keys.forEach((k) => claimBusy.delete(k)); paint();
  }
  /** A15: "Type it again" on a personal link goes back to the typing screen (a link-holder with no mode would see a page with no number box: a dead end). */
  const againState = (token) => (token ? { mode: "needPhone", note: "Type your mobile number again, then press the button." } : { mode: "" });
  function bindJoin() {
    const again = document.getElementById("again"); if (again) again.onclick = () => { clearInterval(J.timer); clearTimeout(J.retry); J.busyTries = 0; Object.assign(J, againState(!!TOKEN)); J.wid = ""; clearWait(); paint(); };
    const go = document.getElementById("go"); if (!go) return;
    if (!DEMO) CBConsent.wire(document, "K4", J.k4); // never ticked in advance; the button stays off until both boxes are ticked
    const phEl = document.getElementById("ph"), ccEl = document.getElementById("cc");
    if (phEl && ccEl) phEl.addEventListener("change", () => { const p = CTPhone.parse(ccEl.value, phEl.value); if (p.ok && /^\s*(\+|00)/.test(phEl.value)) { ccEl.value = p.iso; phEl.value = p.national; } }); // +44 7911 123456 pasted: the list shows the United Kingdom and the box keeps the rest
    ["ph", "nm", "emp"].forEach((id) => { const i = document.getElementById(id); if (i) i.addEventListener("keydown", (e) => { if (e.key === "Enter" && !go.disabled) { e.preventDefault(); go.click(); } }); }); // the keyboard's Go / Enter key does what the button does
    go.onclick = async () => {
      if (!DEMO && !CBConsent.all(document, "K4")) return;
      J.consent = DEMO ? null : CBConsent.payload(document, "K4");
      go.disabled = true; J.busyTries = 0; clearTimeout(J.retry);
      if (window.TBAudio) TBAudio.unlock();
      const ph = document.getElementById("ph"), nm = document.getElementById("nm"), em = document.getElementById("emp"), cc = document.getElementById("cc");
      J.emp = em ? em.value.trim() : J.emp;
      J.phone = ph ? ph.value : J.phone; J.name = nm ? nm.value.trim() : J.name;
      if (cc) { J.cc = CT_BY_ISO(cc.value).iso; try { store.set(CC_KEY, J.cc); } catch {} }
      const stop = (m) => { rt.error = m; try { document.activeElement && document.activeElement.blur(); } catch {} paint(); }; // said in place, at once: nothing is sent to the server for a mistake the phone can see
      if (J.mode === "needPhone" && !J.phone.trim() && !J.emp) return stop("Type your own mobile number, then press the button again."); // the link was used on another phone: the game needs the number it was made for
      const pp = CTPhone.parse(J.cc, J.phone), nd = joinNeeds(), idText = J.emp.replace(/\s+/g, "");
      if (!pp.ok && !pp.empty) return stop(pp.why); // typed, even if the box is optional: a mistyped number is never dropped silently
      if (idText && !/^[A-Za-z0-9][A-Za-z0-9._\-\/]{0,29}$/.test(idText)) return stop("An employee ID has letters and numbers only.");
      if (!(TOKEN && J.mode !== "needPhone")) {
        if (nd.emp === "req" && !idText && nd.phone === "req" && pp.empty) return stop("Enter your employee ID and your mobile number.");
        if (nd.emp === "req" && !idText) return stop("Enter your employee ID.");
        if (nd.phone === "req" && pp.empty) return stop("Enter your mobile number.");
        if (nd.phone === "alt" && nd.emp === "alt" && !idText && pp.empty) return stop("Enter your employee ID or your mobile number.");
      }
      if (pp.ok) { J.cc = pp.iso; J.e164 = pp.e164; } else J.e164 = "";
      go.textContent = "Getting your ticket…"; // a press shows at once that it is working (the redraw after a refusal builds the button again)
      try { document.activeElement && document.activeElement.blur(); } catch {} // the redraw after a refusal is skipped while a box still has the keyboard
      await doJoin(); // shows the ticket screen at once on success: the first tick may take a few seconds on a slow network
    };
  }
  let infoTick = 0;
  // Only a DEMO GAME re-reads the public settings (once a minute, at most 10 phones): the moment the organizer makes it a real game the mark goes, and the re-reading stops with it. A real game never spends these requests.
  // LANGUAGE (1.6.2): a small dropdown at the top right of every screen. English is the only language for now; the choice is remembered in this browser and takes effect at once. It sits outside the page that redraws every second, so it never closes by itself, and it is never under the gold Claim buttons (those are at the bottom).
  (function langBox() {
    try { const saved = localStorage.getItem("ctz-lang"); if (saved) ZG.setLang(saved); } catch { /* the browser may block storage */ }
    if (document.getElementById("langsel")) return;
    const btn = document.createElement("button"); btn.type = "button"; btn.id = "langsel"; btn.setAttribute("aria-label", "Language"); btn.setAttribute("aria-haspopup", "listbox"); btn.setAttribute("aria-expanded", "false");
    btn.style.cssText = "position:fixed;top:6px;right:6px;z-index:45;font-size:.8rem;padding:2px 8px;border-radius:8px;border:1px solid #c9cdd6;background:#fff;color:#1a2233;cursor:pointer";
    const menu = document.createElement("div"); menu.id = "langmenu"; menu.setAttribute("role", "listbox"); menu.hidden = true; menu.style.cssText = "position:fixed;top:32px;right:6px;z-index:46;background:#fff;color:#1a2233;border:1px solid #c9cdd6;border-radius:8px;padding:4px;box-shadow:0 6px 16px rgba(0,0,0,.2)";
    const label = () => { btn.textContent = String(ZG.getLang()).toUpperCase() + " ▾"; };
    for (const [c, n] of Object.entries(ZG.LANGS)) { const o = document.createElement("button"); o.type = "button"; o.setAttribute("role", "option"); o.dataset.lang = c; o.textContent = n; o.style.cssText = "display:block;width:100%;text-align:left;padding:6px 10px;border:0;background:none;font-size:.9rem;cursor:pointer"; o.onclick = () => { ZG.setLang(c); try { localStorage.setItem("ctz-lang", ZG.getLang()); } catch { /* not remembered */ } label(); menu.hidden = true; btn.setAttribute("aria-expanded", "false"); }; menu.appendChild(o); }
    btn.onclick = () => { menu.hidden = !menu.hidden; btn.setAttribute("aria-expanded", String(!menu.hidden)); };
    label(); document.body.appendChild(btn); document.body.appendChild(menu);
  })();
  let rehTick = 0;
  async function loop() { try { await rt.tick(); } catch { /* the loop must never die */ } if (INFO.rehearsal && !INFO.rehearsal.over && ++rehTick % 15 === 0) { try { await api("GET", `/api/z/${EID}/info`); } catch { /* next time */ } } if (isDemoGame() && ++infoTick % 60 === 0) { try { await api("GET", `/api/z/${EID}/info`); } catch { /* the next minute tries again */ } } paint(); }
  function start() { if (timer) return; loop(); timer = setInterval(loop, 1000); }

  if (!EID) { $app.innerHTML = `<p class="zmsg">This link is incomplete. Please ask your organizer for the game link.</p>`; return; }
  // A game that could not be opened (a weak signal, a busy minute) tries again by itself and has a Try again button, so nobody has to reload the page.
  var bootTimer = 0, booting = null;
  function bootUp() {
    clearTimeout(bootTimer); bootTimer = 0;
    if (!EID || booting || (rt.phase !== "boot" && rt.phase !== "missing")) return booting || Promise.resolve();
    booting = rt.boot().then(() => {
      if (rt.phase === "play") clearWait(); else restoreWait();
      paint(); if (rt.phase === "play") start();
      if (rt.phase !== "boot" && rt.phase !== "missing") { if (window.__ctgRetry === bootUp) window.__ctgRetry = null; try { if (window.CTG) CTG.close(); } catch {} } // opened: the "could not reach the game" pop-up goes away by itself
    }).finally(() => { booting = null; });
    return booting;
  }
  bootUp();
  rt.onProgress = () => { if (timer) paint(); };
  window.__rt = rt;
})();
