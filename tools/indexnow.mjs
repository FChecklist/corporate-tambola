// Tells Bing, Yandex and other IndexNow search engines which pages are new or changed, so they re-read them quickly. (Google does not use IndexNow: it reads sitemap.xml.)
// Run after a deploy:   node tools/indexnow.mjs            shows what would be sent (nothing is sent)
//                       node tools/indexnow.mjs --send     sends every URL in sitemap.xml
//                       node tools/indexnow.mjs --send https://corporatetambola.com/trust   sends only the URLs you name
// The key is the name of the key file in apps/web/public (ct4f9c2e7a1b8d3056ae91c4d7f20b6a38.txt): the file must be live at <site>/<key>.txt and hold the key as its only line.
import { readFileSync, readdirSync } from "node:fs";
import { ORIGIN } from "./seo-tags.mjs";

const PUB = new URL("../apps/web/public/", import.meta.url);
const keyFile = readdirSync(PUB).find((f) => /^[0-9a-f]{8,128}\.txt$/i.test(f) || /^ct[0-9a-f]{30,}\.txt$/i.test(f));
if (!keyFile) throw new Error("no IndexNow key file in apps/web/public");
const key = keyFile.replace(/\.txt$/, "");
if (readFileSync(new URL(keyFile, PUB), "utf8").trim() !== key) throw new Error("the key file must contain its own name (the key) and nothing else");

const send = process.argv.includes("--send");
const named = process.argv.slice(2).filter((a) => a.startsWith("https://"));
const urls = named.length ? named : [...readFileSync(new URL("sitemap.xml", PUB), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
for (const u of urls) if (!u.startsWith(ORIGIN + "/")) throw new Error("not on our own address: " + u);
const body = { host: new URL(ORIGIN).host, key, keyLocation: `${ORIGIN}/${keyFile}`, urlList: urls };

console.log(`${urls.length} URL(s), key file ${ORIGIN}/${keyFile}`);
if (!send) { console.log(urls.join("\n") + "\n(dry run: add --send to send)"); process.exit(0); }
const r = await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body) });
console.log("IndexNow answered", r.status, r.status === 200 || r.status === 202 ? "(accepted)" : await r.text());
if (r.status >= 400) process.exit(1);
