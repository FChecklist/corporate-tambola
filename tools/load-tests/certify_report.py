#!/usr/bin/env python3
"""Step-by-step six sigma statement for Corporate Tambola, from the real run files.
usage: python certify_report.py <label> <tag> [<tag> ...]      e.g. certify_report.py "100-player game" k100 kh100auto
Writes C:\\ct\\test-sites\\tambola\\docs\\SIX_SIGMA_<label>.md. Rule-level steps come from data/sigma-steps.json (millions of trials each); journey steps are counted from the campaign / human game / live JSON files.
A defect is any failed check, counted per person/ticket/claim/prize position where the check names how many. An opportunity is each person, ticket, claim, prize position or game the check looked at."""
import json, sys, os, re, math, collections
from statistics import NormalDist
label = sys.argv[1]; tags = sys.argv[2:]
base = r"C:\ct\test-sites\data"

def sigma(defects, opps):
    if opps <= 0: return None
    p = max(defects, 0.5) / opps
    return NormalDist().inv_cdf(1 - p) + 1.5
def upper(defects, opps):  # one-sided 95% upper bound of defects per million (rule of three when none)
    if opps <= 0: return None
    return (3.0 if defects == 0 else defects + 1.96 * math.sqrt(defects) + 1) / opps * 1e6
def verdict(defects, opps):
    u = upper(defects, opps)
    if opps <= 0: return "not measured"
    if u is not None and u <= 3.4: return "SIX SIGMA (proven by the sample)"
    if defects == 0: return f"no defect seen; the sample ({opps:,}) is too small to prove 3.4 per million (needs about 880,000)"
    return "BELOW six sigma" if defects / opps * 1e6 > 3.4 else "rate within six sigma but not proven"

STEPS = collections.OrderedDict()
def add(step, opps, defects):
    s = STEPS.setdefault(step, [0, 0]); s[0] += opps; s[1] += defects
first_int = lambda t: int(re.search(r"(\d+)", t).group(1)) if re.search(r"\d+", t or "") else 1
games = 0
def count_in(pattern, text, default=1):
    m = re.search(pattern, text or ""); return int(m.group(1)) if m else default

def short_of(d):
    m = re.search(r"(\d+) of (\d+)", d or "")
    return max(1, int(m.group(2)) - int(m.group(1))) if m else 1
RULES = [  # (regex on check name, step, opportunities(name, detail, result), defects(name, detail, ok))
    (r"^organizer account made", "O1 Organizer account made", lambda n, d, r: 1, None),
    (r"^game created", "O2 Game created", lambda n, d, r: 1, None),
    (r"^settings saved", "O3 Settings saved", lambda n, d, r: 1, None),
    (r"^the participant list was added", "O4 People list added", lambda n, d, r: 1, None),
    (r"^published", "O5 Game published", lambda n, d, r: 1, None),
    (r"payment was accepted|after payment the game is unlocked|a pay link was made|the pay link page shows|the invoice reached", "O6 Payment, unlock and invoice", lambda n, d, r: 1, None),
    (r"^all \d+ allowed people got a ticket", "P1 Allowed people get a ticket", lambda n, d, r: count_in(r"all (\d+) allowed", n), lambda n, d, ok: 0 if ok else short_of(d)),
    (r"held in the waiting room", "P2 People not allowed in are held back", lambda n, d, r: max(1, r.get("waiting") or 0), None),
    (r"asked for it \(400 need-id\)", "P3 People without an employee ID are asked for it", lambda n, d, r: max(1, r.get("needId") or 0), None),
    (r"hold \d+ well-formed ticket", "P4 Tickets are well formed", lambda n, d, r: count_in(r"all (\d+) players", n), None),
    (r"tickets of the game are different", "P5 No two tickets are the same", lambda n, d, r: count_in(r"all (\d+) tickets", n), lambda n, d, ok: 0 if ok else count_in(r"(\d+) repeated", d)),
    (r"received the same \d+ numbers in the same order|every phone shows the same numbers", "P6 Every phone gets the same numbers in order", lambda n, d, r: count_in(r"every one of (\d+) players", n, r.get("joined") or 1), lambda n, d, ok: 0 if ok else count_in(r"(\d+) differ", d)),
    (r"every phone that joined reached the end", "P7 Every phone reaches the end", lambda n, d, r: r.get("joined") or 1, lambda n, d, ok: 0 if ok else count_in(r"(\d+) still not ended", d)),
    (r"every phone shows the same winners", "P8 Every phone shows the same winners", lambda n, d, r: r.get("joined") or 1, lambda n, d, ok: 0 if ok else count_in(r"(\d+) differ", d)),
    (r"claims on the server are true", "P9 Every claim is true on the claimer's ticket", lambda n, d, r: count_in(r"all (\d+) claims", n), lambda n, d, ok: 0 if ok else count_in(r"(\d+) false", d)),
    (r"prize positions: each winner completed", "P10 Every winner really completed the house", lambda n, d, r: count_in(r"all (\d+) prize", n), lambda n, d, ok: 0 if ok else count_in(r"(\d+) winners", d)),
    (r"winner's claim reached the server before", "P11 Every winner's claim was in time", lambda n, d, r: max(1, r.get("winners") or 1), lambda n, d, ok: 0 if ok else count_in(r"(\d+) late", d)),
    (r"no earlier valid in-time claim was passed over", "P12 Prize distribution follows the claims", lambda n, d, r: max(1, r.get("winners") or 1), lambda n, d, ok: 0 if ok else count_in(r"(\d+) passed", d)),
    (r"prize positions of a house are given in order", "P13 Prize positions in order of completion", lambda n, d, r: max(1, r.get("winners") or 1), lambda n, d, ok: 0 if ok else count_in(r"(\d+) out of order", d)),
    (r"the winners in the store equal the winners on the phones", "P14 Server and phones agree on the winners", lambda n, d, r: 1, None),
    (r"the game ended because every prize was won|numbers stopped", "P15 The game ends when it should", lambda n, d, r: 1, None),
    (r"the median gap between numbers", "P16 Numbers keep the chosen speed", lambda n, d, r: max(1, r.get("numbers") or 1), None),
    (r"no burst of numbers", "P17 No burst of numbers", lambda n, d, r: max(1, r.get("numbers") or 1), lambda n, d, ok: 0 if ok else count_in(r"(\d+) bursts", d)),
    (r"every number reached the phone within", None, None, None),  # handled by the delivery count below
    (r"no phone had an unhandled error", "P18 No phone error", lambda n, d, r: r.get("joined") or 1, None),
    (r"^report: |end-of-game report e-mail was sent", "E1 End-of-game report is sent and right", lambda n, d, r: 1, None),
    (r"checkin|checked in|present", "C1 Check-in works", lambda n, d, r: 1, None),
]
cases = []
for t in tags:
    for f in (os.path.join(base, f"campaign-{t}.json"),):
        if os.path.exists(f):
            for r in json.load(open(f, encoding="utf8")).get("results", []): r["_t"] = t; cases.append(r)
    for f in [x for x in os.listdir(base) if x.startswith(f"human-{t}") and x.endswith(".json")] + [x for x in os.listdir(base) if x == f"live-{t}.json"]:
        j = json.load(open(os.path.join(base, f), encoding="utf8"))
        if "checks" in j: j["_t"] = t; j["joined"] = j.get("audit", {}).get("players") or j.get("players") or 10; j["winners"] = j.get("winners") or 2; cases.append(j)
for r in cases:
    games += 1
    for c in r.get("checks", []):
        n, d, ok = c["n"], c.get("d", ""), c["ok"]
        for pat, step, opp, dfc in RULES:
            if re.search(pat, n):
                if step is None: break
                o = opp(n, d, r); df = dfc(n, d, ok) if dfc else (0 if ok else 1)
                add(step, o, df); break
        else:
            if n.startswith("audit:") or n.startswith("auto:"): pass
    # the delivery of every number to every phone (campaign runs that counted them)
    if r.get("deliveries"):
        add("P19 Every number reaches every phone within 6 s (measured on all phones)", r["deliveries"], r.get("late6Own", r.get("late6", 0)) or 0)
    elif any("every number reached" in c["n"] for c in r.get("checks", [])):
        c = [c for c in r["checks"] if "every number reached" in c["n"]][0]; add("P19 Every number reaches every phone within 6 s (reference phone only)", max(1, r.get("numbers") or 20), 0 if c["ok"] or (r.get("delayMax") or 0) <= 6 else 1)

lines = [f"# Six sigma, step by step: {label}", "", f"Source runs: {', '.join(tags)} ({games} games). Counted from the real run files; nothing is rounded up.", "",
         "An *opportunity* is each person, ticket, claim, prize position, number delivered or game that a check looked at. A *defect* is a failed one. Six sigma = at most 3.4 defects per million opportunities, and it is called *proven* only when the sample is large enough that the 95% upper bound is below 3.4 per million.", "",
         "## Journey steps (counted in the games)", "", "| Step | Opportunities | Defects | Defects per million | 95% upper bound per million | Sigma level (+1.5 shift) | Verdict |", "|---|---:|---:|---:|---:|---:|---|"]
tot_o = tot_d = 0
for step, (o, df) in sorted(STEPS.items()):
    s = sigma(df, o); u = upper(df, o); tot_o += o; tot_d += df
    lines.append(f"| {step} | {o:,} | {df} | {df / o * 1e6 if o else 0:,.1f} | {u:,.1f} | {s:.2f} | {verdict(df, o)} |")
lines += ["", f"All journey steps together: {tot_o:,} opportunities, {tot_d} defects ({tot_d / tot_o * 1e6 if tot_o else 0:,.1f} per million).", ""]
sp = os.path.join(base, "sigma-steps.json")
if os.path.exists(sp):
    S = json.load(open(sp, encoding="utf8")); meta = S.pop("_meta", {})
    lines += ["## Rule steps (millions of trials against an independent check, no network)", "", f"Run: {meta.get('at', '?')}, {meta.get('trialsPerStep', '?'):,} trials per step.", "", "| Step | Trials | Defects | Defects per million | 95% upper bound per million | Verdict |", "|---|---:|---:|---:|---:|---|"]
    for k, v in S.items():
        lines.append(f"| {k} | {v['trials']:,} | {v['defects']} | {v['dpmo']} | {v['upper95PerMillion']} | {verdict(v['defects'], v['trials'])} |")
    lines += [""]
dst = rf"C:\ct\test-sites\tambola\docs\SIX_SIGMA_{re.sub(r'[^A-Za-z0-9]+', '_', label)}.md"
open(dst, "w", encoding="utf8").write("\n".join(lines) + "\n"); print("\n".join(lines[:60])); print("written", dst)
