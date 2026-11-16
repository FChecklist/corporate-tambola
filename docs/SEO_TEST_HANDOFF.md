# SEO / social / AI-search work: handoff to the tester (2026-10-30)

Branch `feat/seo-2026-10-30`, cut from `master` (this repo has no `main`). No code in `apps/edge`, no tests, no release branches touched. Product code only; no test was written or run by the coder.

## Decisions the owner must confirm
1. **Address.** This repo's live address is `https://corporatetambola.com` (PUBLIC_ORIGIN, mails, sitemap, tests). `housie.corporatetambola.com` appears nowhere in the repo. Everything uses `ORIGIN` in `tools/seo-tags.mjs`. If the Tambola site really moves to `housie.`, change that one constant, then re-run the 4 tools below (and move PUBLIC_ORIGIN, Razorpay and the key file host).
2. **Clean URLs.** Cloudflare Pages answers `/x.html` with a 308 to `/x`. Canonical, og:url, sitemap, llms and JSON-LD now use the clean `/x` (home stays `/`). The old tests expect `.html`.
3. **Disallow + noindex** on utility pages (as ordered) means Google cannot read their noindex. `zc.html?demo=1` is linked from the home page, so it may show as a bare URL. Safer: drop the Disallow for `zc` only. Not done.
4. **`demo.html`** stays noindex (a script-driven game screen) but is no longer Disallowed in robots, so the noindex can be read and shared links get a card. `demo-internal` does not exist in the repo.
5. **`partner.html`** is served with `X-Robots-Tag: noindex` (build.mjs) so it was removed from the sitemap.
6. **noai headers.** `X-Robots-Tag: noai, noimageai` removed from public indexable pages in `pages/build.mjs` (it contradicted the crawler decision). Kept on `.js` and on all noindex pages.
7. Dropped the home FAQ "How is the organizer verified?" to stay at 8 questions. FAQ blocks exist on home, organizer guide and the 3 use-case pages only (not on legal/terms/dpa/trust: they are documents).

## How to regenerate (order matters)
```
node tools/apply-seo-head.mjs      # heads, H1s, FAQ, links on existing pages
node tools/make-usecase-pages.mjs  # the 3 new pages
node tools/make-sitemap.mjs        # sitemap.xml
node tools/indexnow.mjs            # dry run; add --send after deploy
```
Do NOT run `tools/make-legal-pages.mjs`: its output is older than the checked-in pages (organizer-guide would lose sections). It now only imports the shared tags.

## Changed / new files
Tools: `tools/seo-tags.mjs` (new, shared tags + ORIGIN + prices read from `packages/shared/src/pricing.ts`), `tools/apply-seo-head.mjs` (new), `tools/make-usecase-pages.mjs` (new), `tools/indexnow.mjs` (new), `tools/make-sitemap.mjs` (rewritten), `tools/make-legal-pages.mjs` (imports shared tags only), `pages/build.mjs` (ship list, header rules for new pages, mkdir for `.well-known`, noai default removed).

New public files (`apps/web/public/`): `online-housie-for-employees.html`, `tambola-for-diwali-office-party.html`, `tambola-for-dealer-and-customer-meets.html`, `og-corporate-tambola.png` (1200x630, 93 KB), `llms-full.txt`, `site.webmanifest`, `favicon.ico`, `.well-known/security.txt`. The IndexNow key file already existed: `ct4f9c2e7a1b8d3056ae91c4d7f20b6a38.txt`.

Edited: `index.html` (H1, title, JSON-LD Organization+WebSite+SoftwareApplication with the 8 real prices+FAQPage, 8 visible FAQ, "Ideas for your event" links, hero image preload, "Private by design" -> "Close group by design", "private work link" -> "personal work link"), `trust.html`, `legal.html`, `terms.html`, `dpa.html`, `organizer-guide.html` (H1, FAQ, "private game" -> "close-group game"), `pricing.html` (H1), `about`, `contact`, `brochure`, `helpdesk`, `ai-prompt`, `privacy`, `legal-position`, `subprocessors`, `partner-terms`, `refund-policy` (head tags only), `demo.html` (share tags, noscript H1), `404.html` (links), `site.css` (small styles), `robots.txt`, `sitemap.xml`, `llms.txt`. Footer of every page with the shared footer gained 3 use-case links.

## What to check
- **Existing tests that will now fail by design** (`apps/web/test/seo.test.ts` and friends): `.html` canonical/sitemap expectations; INDEXABLE list (3 new pages, partner removed); og:image is now the PNG (not logo/ticket.webp); title<=70 -> now <=60; `noai` headers; home JSON-LD order is still Organization, WebSite, SoftwareApplication, FAQPage; robots no longer has `Disallow: /demo.html`; texts changed ("Private by design", "private game", "private work link", organizer-verified FAQ).
- **Every indexable page:** one H1, title <=60, description <=155 and unique, canonical equals the page's clean URL, `lang="en"`, OG + Twitter with absolute https PNG, alt, 1200x630; every `<img>` has alt, width, height; JSON-LD parses; FAQPage questions all visible on the page; BreadcrumbList on inner pages; no ratings or reviews anywhere.
- **Prices:** home JSON-LD offers = 8 packs from Rs 2,399 to Rs 29,499 (offerCount 8); use-case pages and llms-full quote the same numbers; "200 employees" answer says Up to 250 = Rs 3,499.
- **Use-case pages:** 300-450 words each (script enforces), demo/pricing buttons work, FAQ 5 items, layout fine at 390 px wide with no sideways scroll (checked once by screenshot for the Diwali page).
- **robots.txt:** allowed groups (Googlebot, Bingbot, Applebot, DuckDuckBot, the 12 AI agents) have no js/css block for search engines; AI groups and `*` still block `*.js`/`*.css`; blocked: CCBot, Bytespider, Diffbot, omgili, img2dataset, PetalBot, Timpibot; Disallow for api, ai, j, pay, paytest, paylink, signin, report, board, preview, z, zc, big, helpdesk-*, ai-link (each as `.html`, exact clean path and `?`); old "not for AI training" comment gone.
- **Build:** `bun pages/build.mjs` copies the new files incl. `.well-known/security.txt`; `_headers` has rules for the 3 new pages and no `noai` on public pages. After deploy check `/.well-known/security.txt`, `/llms-full.txt`, `/site.webmanifest`, `/og-corporate-tambola.png` (200, image/png), `/ct4f9c...txt`, and that `*.pages.dev` still 301s to the custom domain (middleware untouched).
- **Not checked by the coder:** live crawl, Google/Bing validators (Rich Results Test, Facebook/LinkedIn debugger), Lighthouse speed, IndexNow `--send` (not run; it publishes).
- Internal links on old pages still use `/x.html` (a 308 hop); not changed.
