// Publishes a notice that browsers show as a notification (to people who allowed notifications in their browser). We store nothing about readers.
// Usage:  PLATFORM_KEY=<your platform key> node tools/send-notice.mjs "<title>" "<text>" [/page-to-open] [id]
const [title, body, url, id] = process.argv.slice(2);
const key = process.env.PLATFORM_KEY, base = process.env.BASE ?? "https://corporate-tambola.pages.dev";
if (!key || !title || !body) { console.error('Usage: PLATFORM_KEY=... node tools/send-notice.mjs "<title>" "<text>" [/page] [id]'); process.exit(2); }
const mine = { id: id ?? "n" + Date.now().toString(36), title, body, ...(url ? { url } : {}) };
const cur = await (await fetch(base + "/api/notices")).json();
const r = await fetch(base + "/api/notices", { method: "POST", headers: { "content-type": "application/json", "x-organizer": key }, body: JSON.stringify({ notices: [...(cur.notices ?? []).map(({ id, title, body, url }) => ({ id, title, body, ...(url ? { url } : {}) })), mine].slice(-10) }) });
console.log(r.status, await r.text());
