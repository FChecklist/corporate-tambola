#!/bin/bash
# CLOUD: one-screen status of the Part 2 chains (lines per tag: finished cases, last progress line, worst lag seen)
cd "$(dirname "$0")/../.." || exit 1
date -u +%H:%MZ; uptime | sed 's/.*load/load/'
for t in m250 m500 m1000a m1000b; do f=data/$t.out; [ -f $f ] || continue
  echo "== $t: PASS $(grep -c '^PASS' $f) FAIL $(grep -c '^FAIL' $f) CRASH $(grep -c '^CRASH' $f)  checks-failed-lines $(grep -c '^FAIL #' $f)"
  grep -E '^(PASS|FAIL|CRASH) #' $f | cut -c1-200 | tail -n 3
  grep -E '^  #[0-9]+ ' $f | tail -n 2 | cut -c1-230
  echo "   max lag seen (ms): $(grep -oE 'lag [0-9]+/[0-9]+ms' $f | sed 's/.*\///; s/ms//' | sort -n | tail -n 1)"
done
tail -n 3 data/cloud-part2.progress
