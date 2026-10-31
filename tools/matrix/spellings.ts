// rc/tambola-1.8.5 scenario matrix: the spelling tables. Test addresses: demoN@demo-test.invalid only. No personal data.
// Every table is checked for duplicates when the matrix starts (distinct inputs are part of "distinct scenarios").
export const EMP_BASES = ["ABCD1234", "EMPL0001", "WXYZ9876", "TEAM2026", "HRDX0420", "ITSE0001", "QRST5678", "MNOP1357", "FINC2468", "SALE7531", "OPSX1122", "LEGL4455", "CODE", "ABCDEFGHIJKLMN1234567890ABCDEF", "ZYXWVUTSRQPONMLKJIHGFEDCBA0123", "ABCDEFGHIJKLMN1234567890ABCDEFG"]; // the last is 31 characters: refused; the others are 4 to 30 characters, each with letters at both odd and even places so no two spellings coincide
export const EMAIL_BASES = ["demo1@demo-test.invalid", "demo2@demo-test.invalid", "demo3@demo-test.invalid", "demo.4@demo-test.invalid", "demo-5@demo-test.invalid", "demo_6@demo-test.invalid", "demo7+tag@demo-test.invalid", "demo8@demo-test.invalid", "demo9@sub.demo-test.invalid", "demo10@demo-test.invalid", "demo11@demo-test.invalid", "demo12@demo-test.invalid", "demo13@demo-test.invalid", "abcd@efgh.ij", "demo15@demo-test.invalid", "demo16@x.demo-test.invalid"];
/** Nothing usable once cleaned (employee) / not an address (Email ID). */
export const EMP_JUNK = ["---", "​", "🙂🙂", "...", "ñññ", "१२३", "_/-", "###", "   ", "ЖЖ", "é", "٣٤", "--//..", "~~", "★★★", "(+)"];
export const EMAIL_JUNK = ["demo1", "demo1@", "@demo-test.invalid", "demo1@demo", "1B-678", "no-at-sign", "a@@b.cd", "x@y.", "@", "demo 1", "a@b.c", "demo2@", "@@", "bad@@x.invalid", "plain", "A1B2"];

const ZW = "​";
const mid = (s: string, sep: string) => s.split("").join(sep);
const full = (s: string) => s.replace(/[A-Za-z0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));
const alt = (s: string) => s.split("").map((c, i) => (i % 2 ? c.toLowerCase() : c.toUpperCase())).join("");
export const EMP_FORMATS: [string, (s: string) => string][] = [
  ["same", (x) => x], ["lower", (x) => x.toLowerCase()], ["mixed", (x) => alt(x)], ["dashes", (x) => mid(x, "-")], ["spaces", (x) => mid(x, " ")], ["slashes", (x) => mid(x, "/")], ["dots", (x) => mid(x, ".")],
  ["underscores", (x) => mid(x, "_")], ["tabs", (x) => mid(x, "\t")], ["nbsp", (x) => mid(x, " ")], ["zero-width", (x) => mid(x, ZW)], ["zwnj", (x) => mid(x, "‌")], ["word-joiner", (x) => mid(x, "⁠")],
  ["soft-hyphen", (x) => mid(x, "­")], ["lrm-rlm", (x) => "‎" + x + "‏"], ["bom", (x) => "﻿" + x], ["newlines", (x) => "\n" + x + "\r\n"], ["hash", (x) => "#" + x], ["brackets", (x) => "(" + x + ")"],
  ["quotes", (x) => `"${x}"`], ["emoji-suffix", (x) => x + "🙂"], ["emoji-inside", (x) => x.slice(0, 1) + "🙂" + x.slice(1)], ["accent-prefix", (x) => "éß" + x], ["cyrillic-inside", (x) => x.slice(0, 1) + "Ж" + x.slice(1)],
  ["devanagari-suffix", (x) => x + "१२"], ["full-width", (x) => full(x)], ["full-width-lower-dashes", (x) => full(mid(x, "-")).toLowerCase()], ["everything", (x) => ZW + "#" + mid(x.toLowerCase(), " -/.") + "🙂\n"],
];
const at = (e: string) => e.indexOf("@");
export const EMAIL_FORMATS: [string, (s: string) => string][] = [
  ["same", (x) => x], ["upper", (x) => x.toUpperCase()], ["mixed", (x) => alt(x)], ["local-upper", (x) => x.slice(0, at(x)).toUpperCase() + x.slice(at(x))], ["domain-upper", (x) => x.slice(0, at(x) + 1) + x.slice(at(x) + 1).toUpperCase()],
  ["leading-space", (x) => "  " + x], ["trailing-space", (x) => x + "  "], ["both-spaces", (x) => " " + x + " "], ["space-around-at", (x) => x.replace("@", " @ ")], ["space-in-local", (x) => x.slice(0, 1) + " " + x.slice(1)],
  ["space-in-domain", (x) => x.slice(0, -2) + " " + x.slice(-2)], ["tab-inside", (x) => x.slice(0, 2) + "\t" + x.slice(2)], ["newline-wrap", (x) => "\n" + x + "\r\n"], ["nbsp", (x) => x.replace("@", " @ ")],
  ["zero-width", (x) => mid(x, ZW)], ["zwnj", (x) => x.slice(0, 1) + "‌" + x.slice(1)], ["word-joiner", (x) => x.slice(0, 1) + "⁠" + x.slice(1)], ["bom", (x) => "﻿" + x], ["full-width-at", (x) => x.replace("@", "＠")],
  ["full-width-dot", (x) => x.replace(/\./g, "．")], ["full-width-all", (x) => full(x).replace("@", "＠").replace(/\./g, "．").replace(/-/g, "－")], ["full-width-upper", (x) => full(x.toUpperCase()).replace("@", "＠")],
  ["tab-upper", (x) => "\t" + x.toUpperCase()], ["everything", (x) => " " + alt(x).replace("@", " ＠ ") + "\n"], ["space-after-each", (x) => mid(x, " ")], ["crlf-wrap", (x) => "\r\n" + x + "\r\n"], ["ideographic-space", (x) => x.slice(0, 2) + "　" + x.slice(2)], ["vertical-tab-formfeed", (x) => "\v" + x + "\f"],
];
export const dedupeCheck = () => {
  for (const [n, t] of Object.entries({ EMP_BASES, EMAIL_BASES, EMP_JUNK, EMAIL_JUNK })) if (new Set(t).size !== t.length) throw new Error("duplicate in " + n);
  if (EMP_FORMATS.length !== 28 || EMAIL_FORMATS.length !== 28) throw new Error("28 formats each");
  for (const [n, t] of [["EMP_FORMATS", EMP_FORMATS], ["EMAIL_FORMATS", EMAIL_FORMATS]] as const) if (new Set(t.map((f) => f[0])).size !== t.length) throw new Error("duplicate format name in " + n);
};
