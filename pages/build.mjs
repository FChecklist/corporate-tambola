// Copies the files the live product needs into public/ (the older server-driven pages are deliberately left out: they need a server).
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const SRC = join(import.meta.dir, "../apps/web/public"), OUT = join(import.meta.dir, "public");
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const FILES = ["index.html", "report.html", "report.js", "reportgen.js", "manifest.webmanifest", "zsw.js", "pwa.js", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "site.js", "theme.js", "rum.js", "robots.txt", "sitemap.xml", "ct4f9c2e7a1b8d3056ae91c4d7f20b6a38.txt", "site.css", "common.js", "app.css", "fonts.css", "legal.html", "partner.html", "partner.js", "partner.css", "404.html", "ai-link.html", "ai-link.js", "signin.html", "signin.js", "z.html", "z.js", "z.css", "zc.html", "zc.js", "zc.css", "zgame.js", "control.js", "audio.js", "pay.html", "pay.js", "big.html", "big.js", "big.css"];
for (const f of FILES) { if (!existsSync(join(SRC, f))) throw new Error("missing " + f); cpSync(join(SRC, f), join(OUT, f)); }
for (const d of ["fonts", "img"]) cpSync(join(SRC, d), join(OUT, d), { recursive: true });
// security headers; styles allow inline because the pages set a few style attributes, scripts stay locked to our own files
const CSP = "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; media-src 'self' blob:; connect-src 'self' https://cloudflareinsights.com https://api.drand.sh https://api2.drand.sh https://api3.drand.sh https://drand.cloudflare.com https://checkout.razorpay.com https://api.razorpay.com; frame-src https://api.razorpay.com https://checkout.razorpay.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const PAYCSP = CSP.replace("script-src 'self' https://static.cloudflareinsights.com;", "script-src 'self' https://static.cloudflareinsights.com https://checkout.razorpay.com;"); // only the payment page loads Razorpay Checkout
const PAYHDR = `
  Content-Security-Policy: ${PAYCSP}
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
`;
writeFileSync(join(OUT, "_headers"), `/pay.html${PAYHDR}/pay${PAYHDR}/z.html\n  Content-Security-Policy: ${CSP.replace(/ frame-src[^;]*;/, " frame-src https://www.youtube-nocookie.com;").replace("media-src 'self' blob:;", "media-src 'self' blob: https:;")}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()\n/zc.html\n  Content-Security-Policy: ${CSP.replace(/ frame-src[^;]*;/, "")}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()\n/*.js\n  Cache-Control: no-cache\n/img/*\n  Cache-Control: public, max-age=604800\n/pay.html\n  X-Robots-Tag: noindex\n/z.html\n  X-Robots-Tag: noindex\n/zc.html\n  X-Robots-Tag: noindex\n/big.html\n  X-Robots-Tag: noindex\n/partner.html\n  X-Robots-Tag: noindex\n/*.css\n  Cache-Control: no-cache\n/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n`);
writeFileSync(join(OUT, "_routes.json"), JSON.stringify({ version: 1, include: ["/api/*", "/ai/*"], exclude: [] }));
console.log("pages/public ready");
