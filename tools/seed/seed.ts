/** Creates a ready-to-use demo engagement on the local server and prints how to open every screen. */
import { writeFileSync } from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:8787";
const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
async function http(method: string, path: string, body?: unknown, h: { token?: string; device?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (h.token) headers.authorization = `Bearer ${h.token}`;
  if (h.device) headers["x-device"] = h.device;
  const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path}: ${d.error ?? r.status}`);
  return d;
}
const email = `demo.${hex(2)}@acme-industries.com`;
const co = await http("POST", "/api/checkout", { org: "Acme Industries", email, country: "IN", taxId: "27ABCDE1234F1Z5", pack: 250, currency: "INR" });
const code = co.engagementCode;
const ae = await http("POST", "/api/auth/email", { email });
const av = await http("POST", "/api/auth/verify", { email, code: ae.devCode });
const T = av.token;
const A = (m: string, p: string, b?: unknown) => http(m, `/api/e/${code}${p}`, b, { token: T });
await A("PATCH", "/settings", { name: "Diwali Engagement 2026", ticketMode: "double", familyLimit: 2, familyCanWin: true, participantInvites: 1, callMode: "ai", startsAt: Date.now() + 1800_000 });
await A("PUT", "/rewards", { spec: [
  { pattern: "early5", texts: ["Rs 500 voucher"] }, { pattern: "top", texts: ["Rs 800 voucher"] }, { pattern: "mid", texts: ["Rs 800 voucher"] }, { pattern: "bot", texts: ["Rs 800 voucher"] },
  { pattern: "corners", texts: ["Rs 1,000 voucher"] }, { pattern: "full", texts: ["Smart watch", "Headphones", "Gift hamper"] }, { pattern: "full", scope: "two_ticket", texts: ["Weekend trip", "Tablet"] }] });
await A("PUT", "/breaks", { breaks: [{ id: "b1", after: 22, kind: "file", title: "Acme launch video", seconds: 20 }, { id: "b2", after: 45, kind: "youtube", title: "MD's Diwali message", seconds: 30 }, { id: "b3", after: 67, kind: "slides", title: "Our new offices", seconds: 20 }] });
const names = ["Anita Rao", "Priya Nair", "Rahul Mehta", "Sana Sheikh", "Vikram Singh", "Deepa Iyer", "Fatima Khan", "Emily Chen", "Ahmed Ali", "Arjun Kapoor", "Suresh Kumar", "Lakshmi Menon", "Joseph DSouza", "Kavya Reddy", "Nikhil Joshi", "Pooja Bhatt", "Sam Wilson", "Omar Farooq", "Meera Nair", "Karan Shah"];
const nums = names.map((_, i) => "+9198" + String(76500000 + i * 137).padStart(8, "0"));
await A("POST", "/upload/commit", { items: names.map((n, i) => ({ name: n, e164: nums[i] })) });
const cs = await A("GET", "/console");
const id = (n: string) => cs.participants.find((p: any) => p.name === n).id;
await A("POST", "/people/bulk", { ids: [id("Anita Rao")], action: "role", role: "host" });
await A("POST", "/people/bulk", { ids: [id("Priya Nair"), id("Vikram Singh")], action: "role", role: "team_lead", cap: 10 });
const cs2 = await A("GET", "/console");
const link = (n: string) => cs2.participants.find((p: any) => p.name === n).roleLink;
const out = { baseUrl: BASE, organizerEmail: email, organizerLoginNote: "Log in at /#login with this email; the 6-digit code is shown on screen in local dev and saved in data/outbox", organizerToken: T,
  engagementCode: code, gameLink: `${BASE}/e/${code}`, hostLink: link("Anita Rao"), teamLeadLinks: [link("Priya Nair"), link("Vikram Singh")],
  participants: names.map((n, i) => ({ name: n, number: nums[i] })), howToLoginInBrowserForTests: "In the browser console: localStorage.setItem('tb_org_token', organizerToken)" };
writeFileSync(new URL("../../data/seed.json", import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
