#!/bin/bash
# CLOUD: copy the run files into the tracked results folders (data/ is git-ignored). Safe to run repeatedly.
cd "$(dirname "$0")/../.." || exit 1
mkdir -p tools/load-tests/results/part2 tools/load-tests/results/fault
cp -f data/campaign-m*.json data/m250.out data/m500.out data/m1000a.out data/m1000b.out data/m1000c.out data/m500r35.out data/cloud-part2.progress tools/load-tests/results/part2/ 2>/dev/null
cp -f data/chaosA.out data/campaign-chaosA.json data/approvals-race-run3.out data/approvals-race-run3.json data/approvals-n800b.out data/approvals-e2e-n800b.json tools/load-tests/results/fault/ 2>/dev/null
ls tools/load-tests/results/part2 tools/load-tests/results/fault | head -60
