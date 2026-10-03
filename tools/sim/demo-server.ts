// A demo engagement for looking at the screens: a game in progress with invented people, invitations on, an organizer, a host and a winner.
// Usage: bun run tools/sim/demo-server.ts   (PORT, default 8793). Open /zc.html?e=DEMO-DAY with the organizer key "demo" in sessionStorage (the screenshot script does this).
import { startLocal } from "../../apps/edge/src/local";
import { sealPii } from "../../apps/edge/src/pii";
const s = startLocal({ port: Number(process.env.PORT ?? 8793), secret: "demo", dbFile: ":memory:" });
(s.env as any).FREE_LAUNCH = "1";
const G = 1692803367, nowRound = Math.floor((Date.now() / 1000 - G) / 3) + 1;
const sha = async (t: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t))), (b) => b.toString(16).padStart(2, "0")).join("");
const id = "DEMO-DAY", start = nowRound - 40 - 25; // the first number was called about 75 seconds ago
const call = (m: string, p: string, b?: unknown) => fetch(s.url + p, { method: m, headers: { "content-type": "application/json", "x-organizer": "demo" }, body: b === undefined ? undefined : JSON.stringify(b) });
await call("POST", "/api/z", { id, startRound: start, callSeconds: 6, cap: 200 });
await call("PATCH", `/api/z/${id}/settings`, { invites: { on: true, per: 4, cats: ["family", "colleagues", "friends", "dealers", "vendors"] }, rewards: [{ pattern: "early5", ordinal: 1, text: "Gift hamper" }, { pattern: "top", ordinal: 1, text: "Movie tickets" }, { pattern: "full", ordinal: 1, text: "Weekend getaway" }] }).catch(() => {});
// the engagement already started, so settings were refused: write the policy straight into its stored settings for the demo
s.raw.run("UPDATE engagement SET config=? WHERE id=?", [JSON.stringify({ rewards: [{ pattern: "early5", scope: "ticket", ordinal: 1, text: "Gift hamper" }, { pattern: "top", scope: "ticket", ordinal: 1, text: "Movie tickets" }, { pattern: "full", scope: "ticket", ordinal: 1, text: "Weekend getaway voucher" }], breaks: [], rounds: 1, invites: { on: true, per: 4, cats: ["family", "colleagues", "friends", "dealers", "vendors"] } }), id]);
s.raw.run("INSERT OR REPLACE INTO kv(k,v) VALUES(?,?)", [`contact/${id}`, JSON.stringify({ email: "organizer@yourcompany.example", phone: "9811122233" })]);
const first = ["Asha", "Bala", "Chandra", "Deepa", "Eshan", "Farah", "Gopal", "Hema", "Imran", "Jaya", "Kiran", "Latha"], last = ["Sharma", "Nair", "Iyer", "Gupta", "Khan", "Reddy"];
const device = "d".repeat(32); // the demo phone is seat 5
for (let i = 1; i <= 12; i++) {
  const pid = `${i}x${String(i).padStart(12, "0")}`, ph = "h" + i, late = i > 10;
  s.raw.run("INSERT INTO seat(eid,seq,pid,ph,dev,jr,inv,cat,src,role) VALUES(?,?,?,?,?,?,?,?,?,?)", <any[]>[id, i, pid, ph, i === 5 ? (await sha(`dev|${id}|${device}`)).slice(0, 32) : "x" + i, late ? start + 40 + 15 : 0, i <= 3 ? null : i <= 8 ? (i % 3) + 1 : i - 6, i <= 3 ? null : ["family", "colleagues", "friends", "dealers"][i % 4], "link", i === 1 ? "organizer" : i === 2 ? "host" : null]);
  s.raw.run("INSERT INTO participant(eid,pid,phone_hash,name,pii,joined_ms) VALUES(?,?,?,NULL,?,?)", [id, pid, ph, await sealPii(s.env as any, { phone: `98765${String(40000 + i * 37).slice(-5)}`, name: `${first[i - 1]} ${last[i % 6]}` }), Date.now() - (14 - i) * 60_000]);
}
console.log("READY " + s.url + " pid5=5x000000000005");
