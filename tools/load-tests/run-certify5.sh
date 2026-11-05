#!/bin/bash
cd /c/ct/test-sites/tambola
D=/c/ct/test-sites/data
mark() { echo "$(date +%H:%M) $1" >> $D/certify.progress; }
mark "re-run of the remaining non-clean 100-player cases (database-lock cause removed)"
for n in $(cat $D/rerun100b.txt); do echo $n; done | xargs -P 4 -I{} sh -c "node ../tools/campaign.mjs --from {} --to {} --conc 1 --people 100 --lead 200 --tag s{} > $D/s{}.out 2>&1"
mark "r100 done"
node ../tools/campaign.mjs --from 1 --to 18 --conc 3 --people 250 --heavy 60 --lead 250 --tag m250 > $D/m250.out 2>&1; mark "m250 done"
node ../tools/campaign.mjs --from 19 --to 36 --conc 2 --people 500 --heavy 60 --lead 300 --tag m500 > $D/m500.out 2>&1; mark "m500 done"
node ../tools/campaign.mjs --from 37 --to 45 --conc 1 --people 1000 --heavy 60 --lead 400 --tag m1000 > $D/m1000.out 2>&1; mark "m1000 done"
mark "ALL DONE"
