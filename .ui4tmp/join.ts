const j = await Bun.file("seed2.json").json();
const code = j.engagementCode, base = "http://localhost:8803";
let ok = 0;
for (const [i, p] of j.participants.entries()) {
  const dev = "dev-ui4-device-" + String(i).padStart(4,"0") + "-abcdef0123456789";
  const h = { "content-type": "application/json", "x-device": dev };
  const a = await fetch(`${base}/api/e/${code}/join`, { method: "POST", headers: h, body: JSON.stringify({ raw: p.number, country: "IN" }) });
  const b = await fetch(`${base}/api/e/${code}/confirm`, { method: "POST", headers: h, body: JSON.stringify({ raw: p.number, country: "IN", consent: true }) });
  if (b.status === 200) ok++; else console.log(i, a.status, b.status, await b.text());
}
console.log("joined", ok);
