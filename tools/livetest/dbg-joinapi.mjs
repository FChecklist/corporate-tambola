// What does the live /join answer when it is not JSON? Prints status, headers and the first bytes of the body.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const BASE = "https://corporatetambola.com"; const id = process.argv[2]; const ph = process.argv[3] || "9104209999";
const CONSENT = JSON.parse(readFileSync("C:/ct/tambola/apps/edge/src/consent-text.json", "utf8"));
const r = await fetch(`${BASE}/api/z/${id}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone: ph, name: "Dbg", device: createHash("sha256").update("dev|" + ph).digest("hex").slice(0, 32), consent: { v: CONSENT.version, boxes: Object.keys(CONSENT.K4) } }) });
const t = await r.text();
console.log(r.status, r.headers.get("content-type"), "cf-ray", r.headers.get("cf-ray"), "retry-after", r.headers.get("retry-after"));
console.log(t.slice(0, 300).replace(/\s+/g, " "));
