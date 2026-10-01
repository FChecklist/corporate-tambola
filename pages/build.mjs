// Copies the files the live product needs into public/ (the older server-driven pages are deliberately left out: they need a server).
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const SRC = join(import.meta.dir, "../apps/web/public"), OUT = join(import.meta.dir, "public");
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const FILES = ["index.html", "site.js", "site.css", "common.js", "app.css", "fonts.css", "legal.html", "partner.html", "partner.js", "z.html", "z.js", "z.css", "zc.html", "zc.js", "zc.css", "zgame.js", "control.js", "audio.js"];
for (const f of FILES) { if (!existsSync(join(SRC, f))) throw new Error("missing " + f); cpSync(join(SRC, f), join(OUT, f)); }
for (const d of ["fonts", "img"]) cpSync(join(SRC, d), join(OUT, d), { recursive: true });
// security headers; styles allow inline because the pages set a few style attributes, scripts stay locked to our own files
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; media-src 'self' blob:; connect-src 'self' https://api.drand.sh https://api2.drand.sh https://api3.drand.sh https://drand.cloudflare.com https://checkout.razorpay.com https://api.razorpay.com; frame-src https://api.razorpay.com https://checkout.razorpay.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
writeFileSync(join(OUT, "_headers"), `/z.html\n  Content-Security-Policy: ${CSP.replace(/ frame-src[^;]*;/, "")}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()\n/zc.html\n  Content-Security-Policy: ${CSP.replace(/ frame-src[^;]*;/, "")}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()\n/*.js\n  Cache-Control: public, max-age=3600\n/*.css\n  Cache-Control: public, max-age=3600\n/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n`);
writeFileSync(join(OUT, "_routes.json"), JSON.stringify({ version: 1, include: ["/api/*"], exclude: [] }));
console.log("pages/public ready");
