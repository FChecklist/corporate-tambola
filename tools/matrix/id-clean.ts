// rc/tambola-1.8.5 ID / e-mail CLEANING matrix (final test branch): a streamed matrix of text inputs, each one different, run through every cleaner and checked against rules written a second time.
//   bun tools/matrix/id-clean.ts                  full: at least 1,000,000 distinct inputs  (about a minute)
//   bun tools/matrix/id-clean.ts --small          20,000 inputs spread over the whole space (used by the deliberate-break runner)
//   --root <dir>      run against another copy of the repo (the deliberate-break runner uses this)
//   --worker <n>      also send n inputs through the REAL Worker (join in an employee-ID game, account sign-up)   (default 1500 full, 0 small)
//   --page <n>        also type n inputs into the REAL join page and read the hint under the ID box                  (default 1500 full, 0 small)
// An input = prefix + transform(core) + suffix. Cores are employee IDs and e-mail addresses; transforms are the ways people (and phones, and spreadsheets) write them:
// ASCII in every case, full-width, sharp s, every kind of dash, Devanagari and Arabic digits, compatibility letters (bold, circled, ligatures, roman numerals), inner spaces of all kinds,
// zero-width characters, emoji, very long, and "empty after cleaning". Inputs are streamed (nothing is stored but a set of the texts seen so far, which proves they are all different).
// Rules checked on every input (product against an independent oracle, not the product against itself):
//   R1 employee-ID game, new:  result = oracle (NFKC, keep A-Z a-z 0-9, upper case; nothing left or more than 30 = refused; '@' = refused)
//   R2 an employee-ID game never turns an e-mail into letters: any text with an '@' after NFKC is refused, and every answer is null, "" or 1 to 30 of A-Z 0-9
//   R3 employee-ID game, OLD (before EMP_CLEAN_FROM_MS): result = oracle of the old rule AND = the 1.8.3 function, copied word for word (old games keep the old behaviour; stored hashes still match)
//   R4 participant Email ID (any game): result = oracle; lower case, no space of any kind, no zero-width character; cleaning twice changes nothing
//   R5 account e-mail (sign-up, sign-in, Host setup): accepted exactly when the oracle accepts; an inner space is ALWAYS refused; end spaces, capitals and the full-width at-sign are tidied
//   R6 an Email ID is never cleaned like an employee ID and an employee ID is never accepted as an Email ID
import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { oracleEmpNew, oracleEmpOld, oracleEmail, oracleEmailId } from "./oracle";

const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const small = process.argv.includes("--small"), ROOT = resolve(arg("--root") ?? join(import.meta.dir, "../.."));
const SMALL_N = 20_000;
const WORKER_N = Number(arg("--worker") ?? (small ? 0 : 1500)), PAGE_N = Number(arg("--page") ?? (small ? 0 : 1500));
const NEW_T = Date.UTC(2026, 10, 5, 10, 0, 0);

const E = await import(join(ROOT, "apps/edge/src/empid.ts"));
const NEW = { created_ms: NEW_T }, OLD = { created_ms: E.EMP_CLEAN_FROM_MS - 86_400_000 };

// ---------- the rules, a second time ----------
/** The 1.8.3 employee-ID function (apps/edge/src/people.ts at tag tambola-v1.8.3, line 53), copied word for word: what an older game must still do. */
const frozenOldEmp = (raw: unknown): string | null => { const s = String(raw ?? "").replace(/\s+/g, "").toUpperCase(); if (!s) return ""; return /^[A-Z0-9][A-Z0-9._\-/]{0,29}$/.test(s) ? s : null; };
/** An account e-mail, from the sentence of the rule: tidy the two ends (spaces, capitals, full-width characters), then NO space anywhere, one '@', a local part of 1 to 64, a domain with a dot and 2 or more letters after the last needed dot. */
const oracleAccount = (raw: unknown): string | null => {
  const t = String(raw ?? "").normalize("NFKC").toLowerCase(); let a = 0, b = t.length;
  while (a < b && /\s/.test(t[a]!)) a++; while (b > a && /\s/.test(t[b - 1]!)) b--; const k = t.slice(a, b);
  for (const ch of k) if (/\s/.test(ch)) return null; // an inner space is refused, never glued
  const p = k.split("@"); if (p.length !== 2) return null; const [l, d] = p as [string, string];
  if (l.length < 1 || l.length > 64 || d.length < 3) return null;
  for (let i = 1; i < d.length && i <= 255; i++) if (d[i] === "." && d.length - i - 1 >= 2) return k;
  return null;
};
// the work-e-mail test the Worker uses, read from its source so the matrix cannot drift from the product
const workerSrc = readFileSync(join(ROOT, "apps/edge/src/worker.ts"), "utf8");
const m0 = /if \(!(\/\^\[\^\\s@\]\{1,64\}@[^\n]*?\/)\.test\(email\)\) return json\(\{ error: "Please enter a valid work email\."/.exec(workerSrc);
if (!m0) throw new Error("the work e-mail test was not found in worker.ts (the matrix reads it from there)");
const ACCOUNT_RE = new RegExp(m0[1]!.slice(1, -1));
const accountOk = (x: unknown): string | null => { const e = E.normAccountEmail(x); return ACCOUNT_RE.test(e) ? e : null; };

// ---------- the inputs ----------
const EMP_CORES = ["1B678", "emp001", "EMP001", "A1", "x", "007", "0", "9", "AB", "HR2024", "TCS12345", "z9y8x7", "ab12cd34ef56", "Q7", "12345678", "ABCDEFGHIJ", "Zz9", "K", "M00N", "99B", "B99", "3C", "e5", "T800", "nine", "ID", "a1b2c3d4e5f6g7h8i9j0", "J7", "P0", "44", "LA1", "X9", "7Z", "ZZ", "u2", "R2D2", "C3PO", "ID42", "Acme42", "k8s", "sku99", "Z"];
const EMAIL_CORES = ["demo1@demo-test.invalid", "demo2@demo-test.invalid", "Demo3@Demo-Test.Invalid", "a@b.co", "first.last@acme.com", "x@y", "demo1@", "@demo-test.invalid", "demo1@demo", "john doe@acme.com", "john@acme.com", "JOHN.DOE@ACME.COM", "a@b", "a@b.c", "a@@b.com", "user+tag@acme.co.in", "very.long.local.part.that.goes.on@sub.domain.example.com", "demo4@demo-test.invalid", "d5@e.fr", "ab@cd.ef"];
const CORES = [...EMP_CORES, ...EMAIL_CORES];
const fw = (s: string) => Array.from(s, (ch) => { const c = ch.charCodeAt(0); return c >= 0x21 && c <= 0x7e ? String.fromCharCode(c + 0xfee0) : c === 0x20 ? "　" : ch; }).join("");
const mapCh = (s: string, f: (c: number, ch: string) => string | null) => Array.from(s, (ch) => f(ch.codePointAt(0)!, ch) ?? ch).join("");
const dev = (s: string) => mapCh(s, (c) => (c >= 48 && c <= 57 ? String.fromCodePoint(0x966 + c - 48) : null));
const arb = (s: string) => mapCh(s, (c) => (c >= 48 && c <= 57 ? String.fromCodePoint(0x660 + c - 48) : null));
const bold = (s: string) => mapCh(s, (c) => (c >= 65 && c <= 90 ? String.fromCodePoint(0x1d400 + c - 65) : c >= 97 && c <= 122 ? String.fromCodePoint(0x1d41a + c - 97) : c >= 48 && c <= 57 ? String.fromCodePoint(0x1d7ce + c - 48) : null));
const circled = (s: string) => mapCh(s, (c) => (c >= 65 && c <= 90 ? String.fromCodePoint(0x24b6 + c - 65) : c >= 97 && c <= 122 ? String.fromCodePoint(0x24d0 + c - 97) : c >= 49 && c <= 57 ? String.fromCodePoint(0x2460 + c - 49) : null));
const sup = (s: string) => mapCh(s, (c) => (c >= 48 && c <= 57 ? "⁰¹²³⁴⁵⁶⁷⁸⁹"[c - 48]! : null));
const between = (s: string, sep: string) => Array.from(s).join(sep);
const afterFirst = (s: string, ins: string) => { const a = Array.from(s); return a.length ? a[0] + ins + a.slice(1).join("") : ins; };
const everyN = (s: string, ins: string, n: number) => Array.from(s).map((ch, i) => (i > 0 && i % n === 0 ? ins + ch : ch)).join("");
const alnumLen = (s: string) => s.replace(/[^A-Za-z0-9]/g, "").length;
const grow = (s: string, n: number) => { const b = s.replace(/[^A-Za-z0-9]/g, "") || "A"; let o = ""; while (o.length < n) o += b; return o.slice(0, n); };
const swap = (s: string) => Array.from(s, (ch) => (ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase())).join("");
const TRANSFORMS: [string, (s: string) => string][] = [
  ["identity", (s) => s], ["lower", (s) => s.toLowerCase()], ["upper", (s) => s.toUpperCase()], ["swapcase", swap],
  ["hyphen", (s) => everyN(s, "-", 2)], ["en-dash", (s) => everyN(s, "–", 2)], ["em-dash", (s) => everyN(s, "—", 3)], ["minus-sign", (s) => everyN(s, "−", 2)], ["non-breaking-hyphen", (s) => everyN(s, "‑", 2)], ["slash", (s) => everyN(s, "/", 2)], ["dot", (s) => everyN(s, ".", 3)], ["underscore", (s) => everyN(s, "_", 2)],
  ["space-after-first", (s) => afterFirst(s, " ")], ["space-between-all", (s) => between(s, " ")], ["double-space", (s) => afterFirst(s, "  ")], ["tab-inside", (s) => afterFirst(s, "\t")], ["newline-inside", (s) => afterFirst(s, "\n")], ["nbsp-inside", (s) => afterFirst(s, " ")], ["ideographic-space-inside", (s) => afterFirst(s, "　")], ["thin-space-inside", (s) => afterFirst(s, " ")],
  ["full-width", fw], ["full-width-lower", (s) => fw(s.toLowerCase())], ["eszett-after-first", (s) => afterFirst(s, "ß")], ["eszett-everywhere", (s) => between(s, "ß")], ["accent-e", (s) => afterFirst(s, "é")], ["cyrillic", (s) => afterFirst(s, "Я")], ["greek", (s) => afterFirst(s, "Ω")],
  ["devanagari-digits", dev], ["devanagari-prefix", (s) => "१२३" + s], ["arabic-indic-digits", arb], ["math-bold", bold], ["circled", circled], ["superscript-digits", sup], ["roman-numeral", (s) => afterFirst(s, "Ⅳ")], ["fi-ligature", (s) => "ﬁ" + s], ["kg-sign", (s) => afterFirst(s, "㎏")], ["numero", (s) => "№" + s], ["halfwidth-katakana", (s) => afterFirst(s, "ｱ")], ["small-at", (s) => s.replace(/@/g, "﹫")], ["full-width-at", (s) => s.replace(/@/g, "＠")],
  ["zero-width-space", (s) => between(s, "​")], ["zero-width-joiner", (s) => afterFirst(s, "‍")], ["rtl-mark", (s) => "‏" + s + "‎"], ["soft-hyphen", (s) => afterFirst(s, "­")], ["emoji", (s) => afterFirst(s, "🙂")], ["combining-acute", (s) => afterFirst(s, "́")], ["bom", (s) => "﻿" + s],
  ["symbols", (s) => "#!" + s + "*$"], ["parens", (s) => "(" + s + ")"], ["quotes", (s) => "\"" + s + "\""], ["mailto", (s) => "mailto:" + s], ["display-name", (s) => "John <" + s + ">"],
  ["long-29", (s) => grow(s, 29)], ["long-30", (s) => grow(s, 30)], ["long-31", (s) => grow(s, 31)], ["long-30-dashed", (s) => between(grow(s, 30).replace(/[^A-Za-z0-9]/g, ""), "-")], ["long-200", (s) => s.repeat(Math.ceil(200 / Math.max(1, s.length)))], ["long-5000", (s) => s.repeat(Math.ceil(5000 / Math.max(1, s.length)))],
  ["empty-dashes", (s) => "-".repeat(Math.max(1, Array.from(s).length))], ["empty-spaces", (s) => " ".repeat(Math.max(1, s.length))], ["empty-symbols", () => "***"], ["empty-emoji", () => "🙂🙂"], ["empty-devanagari", () => "नमस्ते"], ["empty-eszett", () => "ßß"], ["empty-zero-width", () => "​‍"],
];
const AFFIX = ["", " ", "  ", "\t", "\n", " ", "　", "-", "--", "#", "*", "​", "﻿", "(", ")", ".", "_", "🙂", "/"];
export const TOTAL = CORES.length * TRANSFORMS.length * AFFIX.length * AFFIX.length;

function at(n: number): string {
  let r = n; const post = r % AFFIX.length; r = Math.floor(r / AFFIX.length); const pre = r % AFFIX.length; r = Math.floor(r / AFFIX.length);
  const tr = r % TRANSFORMS.length; r = Math.floor(r / TRANSFORMS.length); const core = r % CORES.length;
  return AFFIX[pre]! + TRANSFORMS[tr]![1](CORES[core]!) + AFFIX[post]!;
}
function* inputs(): Generator<string> {
  if (small) { for (let i = 0; i < SMALL_N; i++) yield at(Math.floor((i * TOTAL) / SMALL_N)); return; }
  for (let n = 0; n < TOTAL; n++) yield at(n);
}

// ---------- the categories (to show the matrix really covers each kind of text) ----------
const CAT: [string, (x: string) => boolean][] = [
  ["plain ASCII", (x) => /^[\x20-\x7e\t\n]*$/.test(x)], ["full-width", (x) => /[！-～　]/.test(x)], ["sharp s (ß)", (x) => x.includes("ß")], ["dashes (any kind)", (x) => /[-–—−‑]/.test(x)],
  ["Devanagari / Arabic digits", (x) => /[०-९٠-٩]/.test(x)], ["compatibility letters", (x) => /[\u{1d400}-\u{1d7ff}Ⓐ-ⓩ①-⑨ﬁⅣ㎏№²³¹⁰-⁹]/u.test(x)],
  ["inner space (any kind)", (x) => /\S[\s　]+\S/.test(x)], ["zero-width / invisible", (x) => /[​-‏⁠﻿­]/.test(x)], ["emoji", (x) => /\u{1f642}/u.test(x)], ["contains @ (or full-width / small @)", (x) => /[@＠﹫]/.test(x)],
  ["very long (>= 60 characters)", (x) => x.length >= 60], ["very long after cleaning (> 30)", (x) => alnumLen(x.normalize("NFKC")) > 30], ["empty after cleaning", (x) => x.trim() !== "" && oracleEmpNew(x) === null && alnumLen(x.normalize("NFKC")) === 0 && !/@/.test(x.normalize("NFKC"))], ["nothing typed (blank)", (x) => x.trim() === ""],
];

// ---------- 1. the stream ----------
const seen = new Set<string>(); const cat: Record<string, number> = Object.fromEntries(CAT.map(([k]) => [k, 0]));
let generated = 0, distinct = 0, checks = 0, failures = 0; const byRule: Record<string, number> = {}; const first: string[] = []; const t0 = Date.now(); const keep: string[] = []; // keep: every k-th input, for the Worker and page samples
const show = (x: string) => JSON.stringify(x.length > 60 ? x.slice(0, 57) + "..." : x).replace(/[\u0080-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
const bad = (rule: string, x: string, msg: string) => { failures++; byRule[rule] = (byRule[rule] ?? 0) + 1; if (first.length < 10) first.push(`[${rule}] ${show(x)} :: ${msg}`); };
const eq = (rule: string, x: string, got: unknown, want: unknown) => { checks++; if (got !== want) bad(rule, x, `product ${JSON.stringify(got)} | rule ${JSON.stringify(want)}`); };
const SAMPLE_EVERY = Math.max(1, Math.floor((small ? SMALL_N : 1_400_000) / Math.max(WORKER_N, PAGE_N, 1)));
for (const x of inputs()) {
  generated++; if (seen.has(x)) continue; seen.add(x); distinct++;
  for (const [k, f] of CAT) if (f(x)) cat[k]!++;
  const nf = x.normalize("NFKC"), hasAt = nf.includes("@");
  // R1 + R2
  const eNew = E.normEmpFor(x, NEW), oNew = oracleEmpNew(x);
  eq("R1 employee ID, new game", x, eNew, oNew);
  checks++; if (hasAt && eNew !== null) bad("R2 e-mail turned into letters", x, `an e-mail text was answered ${JSON.stringify(eNew)}`);
  checks++; if (!(eNew === null || eNew === "" || /^[A-Z0-9]{1,30}$/.test(eNew))) bad("R2 shape of an employee ID", x, `answer ${JSON.stringify(eNew)}`);
  checks++; if (typeof eNew === "string" && eNew !== "" && E.normEmpFor(eNew, NEW) !== eNew) bad("R1 cleaning twice", x, `second pass changed ${eNew}`);
  // R3
  const eOld = E.normEmpFor(x, OLD);
  eq("R3 employee ID, old game (rule)", x, eOld, oracleEmpOld(x)); eq("R3 employee ID, old game (the 1.8.3 function)", x, eOld, frozenOldEmp(x));
  // R4
  const em = E.normEmail(x); eq("R4 Email ID text", x, em, oracleEmail(x));
  checks++; if (/[\s​-‍⁠﻿]/.test(em) || em !== em.toLowerCase()) bad("R4 lower case and space-free", x, JSON.stringify(em));
  checks++; if (E.normEmail(em) !== em) bad("R4 cleaning twice", x, "second pass changed it");
  const idNew = E.normIdFor(x, "email", NEW), idOld = E.normIdFor(x, "email", OLD), oId = oracleEmailId(x);
  eq("R4 Email ID, new game", x, idNew, oId); eq("R4 Email ID, old game", x, idOld, oId);
  checks++; if (typeof idNew === "string" && idNew !== "" && (/[\s​-‍⁠﻿]/.test(idNew) || idNew !== idNew.toLowerCase() || !idNew.includes("@"))) bad("R4 Email ID shape", x, JSON.stringify(idNew));
  // R5
  const acc = accountOk(x), oAcc = oracleAccount(x); eq("R5 account e-mail", x, acc, oAcc);
  const trimmed = nf.replace(/^\s+|\s+$/g, ""); checks++; if (/\S\s+\S/.test(trimmed) && acc !== null) bad("R5 inner space accepted", x, `accepted as ${JSON.stringify(acc)}`);
  checks++; if (acc !== null && /\s/.test(acc)) bad("R5 account e-mail has a space", x, JSON.stringify(acc));
  eq("R5 account tidy", x, E.normAccountEmail(x), nf.toLowerCase().replace(/^\s+|\s+$/g, "")); // two ends only
  // R6
  checks++; if (E.normIdFor(x, "email", NEW) !== null && E.normIdFor(x, "email", NEW) !== "" && !/^[^@]+@[^@]+$/.test(String(E.normIdFor(x, "email", NEW)))) bad("R6 not an address accepted as Email ID", x, "no single @");
  checks++; if (E.normIdFor(x, "emp", NEW) !== eNew) bad("R6 normIdFor(emp) differs from normEmpFor", x, "");
  if (distinct % SAMPLE_EVERY === 0 && keep.length < Math.max(WORKER_N, PAGE_N)) keep.push(x);
  if (distinct % 250_000 === 0) console.log(`  ... ${distinct.toLocaleString("en-US")} distinct inputs, ${failures} failures, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// ---------- 2. a sample through the REAL Worker ----------
let workerRan = 0, pageRan = 0;
if (WORKER_N > 0) {
  const { World } = await import(join(ROOT, "apps/edge/test/rc185/helpers.ts"));
  const pick = keep.slice(0, WORKER_N);
  for (const x of pick) { // one list-only employee-ID game per input: the organizer lists the text, the person types the same text; the real routes decide
    const w = new World();
    try {
      const m = await w.game(NEW_T, "EMP-1", {}, false); const want = oracleEmpNew(x); const usable = typeof want === "string" && want !== "";
      const a = await w.add(NEW_T, m, [{ name: "A", empId: x }]); const ab = (await a.json()) as any;
      checks++; if ((a.status === 200 && ab.added === 1) !== usable) bad("W1 real Worker list upload", x, `status ${a.status} ${JSON.stringify(ab).slice(0, 120)}, usable=${usable}`);
      const r = await w.join(NEW_T, x, 1); const b = (await r.json()) as any; const bodyText = JSON.stringify(b);
      checks++; if ((r.status === 200) !== usable || (!usable && r.status !== 400)) bad("W1 real Worker join", x, `status ${r.status} (${bodyText.slice(0, 120)}), usable=${usable}`);
      if (nfHasAt(x)) { checks++; const lettered = E.cleanEmpId(x); if (r.status === 200 || (lettered.length > 3 && bodyText.includes(lettered))) bad("W2 e-mail turned into letters by the Worker", x, bodyText.slice(0, 160)); }
      workerRan++;
    } catch (e: any) { bad("W0 real Worker error", x, String(e?.message ?? e).slice(0, 160)); } finally { w.restore(); }
  }
  // account sign-up: the real route, ten thousand times would create ten thousand organizers; a few hundred are enough to show the route follows the same test
  const acctPick = keep.filter((x) => /[@＠﹫]/.test(x)).slice(0, Math.min(400, WORKER_N)); const w2 = new World(true); let ip = 0;
  for (const x of acctPick) {
    try {
      const r = await handleStart(w2, x, ++ip); const want = oracleAccount(x) !== null;
      checks++; if ((r.status === 200) !== want) bad("W3 real Worker sign-up e-mail", x, `status ${r.status}, wanted ${want ? "accepted" : "refused"}`);
      if (/\S\s+\S/.test(x.normalize("NFKC").replace(/^\s+|\s+$/g, "")) && r.status === 200) bad("W3 inner space accepted by sign-up", x, "");
      workerRan++;
    } catch (e: any) { bad("W0 real sign-up error", x, String(e?.message ?? e).slice(0, 160)); }
  }
  w2.restore();
}
function nfHasAt(x: string) { return x.normalize("NFKC").includes("@"); }
async function handleStart(w: any, email: string, ip: number) {
  const { handle } = await import(join(ROOT, "apps/edge/test/with-terms.ts"));
  return handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `6.6.${(ip >> 8) & 255}.${ip & 255}` }, body: JSON.stringify({ email }) }), w.env, NEW_T);
}

// ---------- 3. a sample typed into the REAL join page ----------
if (PAGE_N > 0) {
  const P = await import(join(ROOT, "apps/web/test/rc185/page.ts"));
  const pick = keep.slice(0, PAGE_N);
  for (const kind of ["emp", "email"] as const) {
    const o = await P.organizer(P.NEW_AT); await P.published(o, "RC-MX", { verify: "id", employeesOnly: true, ...(kind === "email" ? { idKind: "email" } : {}) });
    const p = await P.phone(o, "/z?e=RC-MX"); await p.waitFor((t: string) => /Join the game|Join/.test(t) && !!p.$("#go"), 30_000);
    for (const x of pick) {
      try {
        P.setVal(p, "#emp", x); const hint = (p.$("#empread") as any).textContent as string; const nf = x.normalize("NFKC");
        const read = kind === "email" ? oracleEmail(x) : nf.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        const tooLong = kind === "emp" && read.length > 30; // product rule (rc 1.8.5, owner decision): an employee ID over 30 characters once cleaned gets this sentence instead of the "read this as" hint
        const looksAddress = kind !== "email" || /@[^]+\.[^]+/.test(read); // R-email-hint: in an Email ID game the hint appears ONLY when the value looks like an address (an @ followed later by a dot); 'notanemail' shows no hint. Read as: something between the @ and the dot and something after the dot, so "x@y." and "x@." (a dot with nothing around it) show no hint: an interpretation of the owner's words, listed for confirmation in TESTER_REPORT.md
        const want = x.trim() && read && looksAddress && !(kind === "emp" && nf.includes("@")) ? (tooLong ? "This ID is too long. An employee ID may be up to 30 characters once cleaned." : "The system will read this as " + read) : "";
        checks++; if (hint !== want) bad(`P1 join page hint (${kind} game)`, x, `hint ${JSON.stringify(hint.slice(0, 80))} | rule ${JSON.stringify(want.slice(0, 80))}`);
        if (kind === "emp" && nf.includes("@")) { checks++; if (hint !== "") bad("P2 e-mail turned into letters on the page", x, hint.slice(0, 80)); }
        pageRan++;
      } catch (e: any) { bad("P0 join page error", x, String(e?.message ?? e).slice(0, 160)); }
    }
    await p.close();
  }
}

// ---------- 4. the report ----------
const secs = (Date.now() - t0) / 1000;
console.log(`ID / E-MAIL CLEANING MATRIX ${small ? "SMALL" : "FULL"} (${ROOT === resolve(join(import.meta.dir, "../..")) ? "this repo" : ROOT})`);
console.log(`  dimensions:      ${CORES.length} cores (${EMP_CORES.length} employee IDs + ${EMAIL_CORES.length} e-mail addresses) x ${TRANSFORMS.length} spellings x ${AFFIX.length} prefixes x ${AFFIX.length} suffixes = ${TOTAL.toLocaleString("en-US")} combinations`);
console.log(`  inputs generated: ${generated.toLocaleString("en-US")}`);
console.log(`  distinct inputs run: ${distinct.toLocaleString("en-US")}${distinct === generated ? " (every one different)" : ` (${(generated - distinct).toLocaleString("en-US")} repeats were skipped, never counted)`}`);
console.log(`  checks made:     ${checks.toLocaleString("en-US")}`);
console.log(`  real-Worker inputs: ${workerRan}    real-page inputs (typed into the join page, two games): ${pageRan}`);
console.log(`  categories among the distinct inputs:`);
for (const [k, n] of Object.entries(cat)) console.log(`     ${k.padEnd(40)} ${n.toLocaleString("en-US")}`);
console.log(`  failures:        ${failures}${failures ? " " + JSON.stringify(byRule) : ""}`);
for (const f of first) console.log("    " + f);
console.log(`  time: ${secs.toFixed(1)}s`);
const enough = small ? distinct >= SMALL_N * 0.9 : distinct >= 1_000_000;
if (!enough) console.log("  NOT ENOUGH DISTINCT INPUTS");
process.exit(failures || !enough ? 1 : 0);
