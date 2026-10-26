#!/usr/bin/env python3
"""One summary line per real-site game, read from the files tools/browser-tests/ui-game.mjs writes (no network, almost no CPU: run it after a game).

usage:  python live-summary.py [--dir C:/ct/test-sites/data/ui] [--browser chrome] [--expect-joined N] TAG [TAG ...]
reads:  <dir>/ui-<browser>-<TAG>.json  (checks, failedReq, errors, pageErr, notes, eid, cap, mode)  and  <dir>/live-<browser>-<TAG>.log or live-<TAG>.log when present.
prints: TAG  PASS|FAIL  eid  mode  cap | joined X/Y | numbers N equal=yes/no | winners agree=yes/no | own 5xx=a relay 502=b drand/3rd party=c busy(429/503)=d | page errors=e | failed checks: ...
A game is PASS only when every check passed AND own 5xx == 0 AND busy == 0. Beacon-relay 502 (our /api/beacon/... answering 502 when the public beacon is out) and third-party (drand) errors are counted separately and
reported as NOTES, never silently ignored. Number delay and timer gaps are NOT in the result file: measure them from /big.html?e=<eid> (see docs/LIVE_GAME_CHECKLIST_2026-10-27.md, assertions 4 and 5).
"""
import json, os, re, sys

def arg(name, default=None):
    if name in sys.argv:
        i = sys.argv.index(name); v = sys.argv[i + 1]; del sys.argv[i:i + 2]; return v
    return default

D = arg("--dir", r"C:/ct/test-sites/data/ui"); BROWSER = arg("--browser", "chrome"); EXPECT = arg("--expect-joined")
tags = [a for a in sys.argv[1:] if not a.startswith("--")]
if not tags:
    print(__doc__); sys.exit(2)

OWN = re.compile(r"https?://(www\.)?(corporatetambola\.com|corporate-tambola\.pages\.dev)(/|$)")
RELAY = re.compile(r"/api/beacon/")
BUSY = re.compile(r"\b(429|503)\b")

def one(tag):
    p = os.path.join(D, f"ui-{BROWSER}-{tag}.json")
    if not os.path.exists(p):
        return f"{tag}  NO-RESULT-FILE  ({p})", False
    d = json.load(open(p, encoding="utf8"))
    checks = d.get("checks", []); bad = [c for c in checks if not c.get("ok")]
    joined = next((c for c in checks if re.search(r"\ball \d+ (people|pages)\b|\bjoined\b", c["n"])), None)
    jm = re.search(r"all (\d+) people joined", joined["n"]) if joined else None
    got = int(jm.group(1)) if jm and joined.get("ok") else None
    nums = next((c for c in checks if re.search(r"same \d+ numbers", c["n"])), None)
    nm = re.search(r"same (\d+) numbers", nums["n"]) if nums else None
    win = next((c for c in checks if "same winners" in c["n"]), None)
    own5 = relay5 = third = busy = 0
    for r in d.get("failedReq", []):
        m = re.match(r"^(.*?)\s+(\d{3})\s+(https?://\S+)", str(r))
        if not m: continue
        status, url = int(m.group(2)), m.group(3)
        if BUSY.search(str(status)) and OWN.search(url) and not RELAY.search(url): busy += 1
        if status >= 500:
            if OWN.search(url) and RELAY.search(url): relay5 += 1
            elif OWN.search(url): own5 += 1
            else: third += 1
    perr = len(d.get("errors", [])) + len(d.get("pageErr", []) if isinstance(d.get("pageErr"), list) else [])
    # the harness's own '5xx' check counts relay 502 too: re-judge it with the split above
    judged_bad = [c for c in bad if not (c["n"].startswith("no page error and no 5xx") and own5 == 0 and perr == 0 and relay5 + third > 0)]
    ok = not judged_bad and own5 == 0 and busy == 0 and perr == 0
    incomplete = got is None or nums is None or win is None  # the game has not reached its final checks yet (or they failed to run)
    if incomplete and ok: ok = False
    exp = int(EXPECT) if EXPECT else None
    jtxt = f"joined {got if got is not None else '?'}/{exp if exp else d.get('cap')}"
    if exp is not None and got is not None and got != exp: ok = False
    line = (f"{tag}  {'INCOMPLETE' if incomplete and not judged_bad else 'PASS' if ok else 'FAIL'}  eid={d.get('eid')} {d.get('mode')} cap={d.get('cap')} | {jtxt} | numbers {nm.group(1) if nm else '?'} equal={'yes' if nums and nums.get('ok') else 'NO' if nums else '?'}"
            f" | winners agree={'yes' if win and win.get('ok') else 'NO' if win else '?'} | own 5xx={own5} relay-502={relay5} 3rd-party={third} busy={busy} | page errors={perr}")
    if judged_bad: line += " | FAILED: " + "; ".join(c["n"] for c in judged_bad)
    if relay5 or third: line += f" | NOTE: {relay5} beacon-relay 5xx and {third} third-party errors (public beacon outage; phones fell back to other mirrors)"
    for n in d.get("notes", []): line += f" | note: {n}"
    return line, ok

allok = True
for t in tags:
    line, ok = one(t); print(line); allok &= ok
sys.exit(0 if allok else 1)
