# Deploys

What is live, and how to know.

* Open `/version.json` on the site. It holds `commit` (the git commit the pages were built from), `dirty` (true if files differed from that commit), `builtAt` (UTC) and `game`. It holds nothing else.
* A deploy is made with `bun run pages:deploy`: it builds `pages/public` (which writes `version.json`), then uploads it to the Cloudflare Pages project `corporate-tambola`. The Worker's database changes are the numbered files in `apps/edge/migrations`.
* TEST or LIVE mode (whether real payments are taken) is separate from a deploy: `GET /api/mode`.

## Last deploys of `corporate-tambola`

Read from Cloudflare Pages on 2026-10-14 00:43 UTC. Refresh this table with `node tools/list-deploys.mjs` (needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment).

| Time (UTC) | Environment | Branch | Commit | Result | Deployment |
|---|---|---|---|---|---|
| 2026-10-13 19:42 | production | main | 332bc33 | ok | https://2891263c.corporate-tambola.pages.dev |
| 2026-10-13 11:08 | production | main | a4aed42 | ok | https://d885b817.corporate-tambola.pages.dev |
| 2026-10-13 10:36 | production | main | af6d77d | ok | https://19785b66.corporate-tambola.pages.dev |
| 2026-10-13 10:28 | production | main | e26d4d8 | ok | https://10e29053.corporate-tambola.pages.dev |
| 2026-10-12 05:11 | production | main | 5384eb0 | ok | https://42247421.corporate-tambola.pages.dev |
| 2026-10-12 05:06 | production | main | 5384eb0 | ok | https://5b47e531.corporate-tambola.pages.dev |
| 2026-10-12 05:03 | production | main | 5384eb0 | ok | https://80c0d17a.corporate-tambola.pages.dev |
| 2026-10-11 18:20 | production | main | 2f65d49 | ok | https://d2b74dbc.corporate-tambola.pages.dev |
| 2026-10-11 17:48 | production | main | 2588cc8 | ok | https://1f2345e4.corporate-tambola.pages.dev |
| 2026-10-11 17:16 | production | main | 91291da | ok | https://dbd3f6aa.corporate-tambola.pages.dev |
| 2026-10-11 15:32 | production | main | 8b660da | ok | https://3de43cd4.corporate-tambola.pages.dev |
| 2026-10-11 13:47 | production | main | d07564c | ok | https://6c406c47.corporate-tambola.pages.dev |
| 2026-10-11 06:11 | production | main | 53d1eeb | ok | https://1abc850b.corporate-tambola.pages.dev |
| 2026-10-11 06:07 | production | main | 3e93fbf | ok | https://a35457ec.corporate-tambola.pages.dev |
| 2026-10-11 05:35 | production | main | 4ea93df | ok | https://7fb8625e.corporate-tambola.pages.dev |
