#!/usr/bin/env python3
"""Option coverage matrix: for every value of every option (and every play-mode x audience pair), how many games ran, how many were clean, per size class.
usage: python coverage_matrix.py <label> <tag> [<tag> ...]   -> docs/COVERAGE_<label>.md"""
import json, sys, os, re, collections
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))  # CLOUD PORT
label = sys.argv[1]; tags = sys.argv[2:]; base = os.environ.get("DATA_DIR") or os.path.join(ROOT, "data")
rows = []
for t in tags:
    f = os.path.join(base, f"campaign-{t}.json")
    if os.path.exists(f):
        for r in json.load(open(f, encoding="utf8")).get("results", []): r["_t"] = t; rows.append(r)
def size(r): p = r.get("players") or r.get("people") or 0; return "10 (demo)" if p <= 10 else "100" if p <= 120 else "250" if p <= 300 else "500" if p <= 600 else "1000"
def clean(r): return all(c["ok"] for c in r.get("checks", []))
def only_timing(r): return all(c["ok"] or re.search(r"within 4 s|no burst|median gap", c["n"]) for c in r.get("checks", []))
dims = {
 "play mode": lambda r: r.get("mode"), "audience / verification": lambda r: r.get("aud"), "tickets per person": lambda r: r.get("tickets"),
 "prize set": lambda r: r.get("prizes"), "tie rule": lambda r: r.get("ties"), "brand breaks": lambda r: "yes" if r.get("brand") else "no",
 "rounds": lambda r: r.get("rounds"), "claim behaviour": lambda r: r.get("claim"), "events": lambda r: r.get("events") or "-",
 "payment path": lambda r: r.get("paidVia") or "free demo",
 "mode x audience": lambda r: f"{r.get('mode')} x {r.get('aud')}",
}
out = [f"# Option coverage: {label}", "", f"Games read: {len(rows)} from {', '.join(tags)}. *clean* = every check passed; *timing only* = the only failed checks were number-timing checks (this laptop under load, see the six sigma report).", ""]
for name, fn in dims.items():
    out += [f"## {name}", "", "| value | games | clean | timing only | other failure |", "|---|---:|---:|---:|---:|"]
    g = collections.defaultdict(list)
    for r in rows: g[str(fn(r))].append(r)
    for v, rs in sorted(g.items()):
        c = sum(1 for r in rs if clean(r)); t = sum(1 for r in rs if not clean(r) and only_timing(r)); o = len(rs) - c - t
        out.append(f"| {v} | {len(rs)} | {c} | {t} | {o} |")
    out.append("")
sz = collections.defaultdict(list)
for r in rows: sz[size(r)].append(r)
out += ["## By game size", "", "| size | games | clean | timing only | other failure |", "|---|---:|---:|---:|---:|"]
for s, rs in sz.items():
    c = sum(1 for r in rs if clean(r)); t = sum(1 for r in rs if not clean(r) and only_timing(r)); out.append(f"| {s} | {len(rs)} | {c} | {t} | {len(rs)-c-t} |")
dst = os.path.join(ROOT, "docs", f"COVERAGE_{re.sub(r'[^A-Za-z0-9]+','_',label)}.md")
open(dst, "w", encoding="utf8").write("\n".join(out) + "\n"); print("\n".join(out[:70])); print("written", dst)
