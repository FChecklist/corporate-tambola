# Protection of the product (2026-10-22)

The owner's ask: make it as hard as technically possible for anyone to copy Corporate Tambola by handing the website to an AI, and to make clear that nobody may create this game under their own name.

What an outsider can and cannot reach, and what we did about each layer:

| Layer | What is there | What a copier gets | What we did |
|---|---|---|---|
| Server (Pages Functions worker, D1) | the game engine's settlement, claims and Bogey checks, payments, keys, consent records, mail | nothing: it never leaves Cloudflare; only its answers do | nothing to add; keep every new rule on the server first |
| Shared engine in the browser (`zgame.js`) | the number sequence, patterns, claim window, tie rules, consensus | the minified behaviour, no comments, no names of ideas | shipped without comments or whitespace, a notice on top, no source map |
| Page scripts (`z.js`, `zc.js`, `guide.js`, ...) | screens, guided errors, the console | the same: minified, notice on top | `pages/build.mjs` strips every shipped `.js` (`Bun.Transpiler`, whitespace only, so behaviour is unchanged) |
| Pages and files | marketing, legal, guides | readable (they are for people) | `X-Robots-Tag: noai, noimageai` on every page and script; `noindex` kept where it was |
| AI crawlers | GPTBot, ClaudeBot, Google-Extended, CCBot, PerplexityBot, Bytespider, Amazonbot, Applebot-Extended, meta-externalagent, cohere, Diffbot, omgili, YouBot, DuckAssistBot, MistralAI and the OpenAI/Anthropic user agents | `Disallow: /` in `robots.txt`, with the trust, legal, pricing, guide pages and `llms.txt` allowed back so an AI can still answer a buyer's questions about safety and price | `apps/web/public/robots.txt` |
| Terms | section 2.3 already reserved every right to Rajat Agarwal | | section 2.4 added: feeding the pages, code or rules to an AI to copy, re-create, train on or derive a similar product is prohibited; automated access other than playing or organizing is prohibited |
| Cloudflare "Block AI bots" (zone setting) | enforces the crawler list at the edge, independent of `robots.txt` | | **owner action**: the API token on this laptop has no zone bot-management scope (403). In the Cloudflare dashboard: corporatetambola.com -> Security -> Bots -> turn on "Block AI bots" (and "AI Labyrinth" if offered). Two clicks. |
| Name | "Corporate Tambola" and the logo | | **owner action**: a trademark application (class 9 and 41) is the only protection for the name itself; the code's copyright does not protect a name |

## Honest limits

- Behaviour cannot be hidden: anyone can play a game and describe what they saw to an AI, and an AI can write a tambola game from a description. What we protect is the *work*: the exact rules, texts, guided errors, legal texts, consent design and the server logic are not retrievable from the site, and copying the texts that are visible is a copyright breach we can act on.
- `robots.txt` and `noai` are requests that honest crawlers follow; the Cloudflare block is the enforcement, and it is the owner's click.
- Minified does not mean encrypted: a determined person can still read the shipped JavaScript. The comments and design notes (the part that explains *why*) are no longer in it.

## How to check it is live

```
curl -sI https://corporatetambola.com/zgame.js | grep -i x-robots-tag      # noindex, noai, noimageai
curl -s  https://corporatetambola.com/zgame.js | head -c 120               # the notice, then minified code
curl -s  https://corporatetambola.com/robots.txt | grep -c "User-agent"    # the crawler list
```
