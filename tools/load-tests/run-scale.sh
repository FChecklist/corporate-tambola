#!/bin/bash
cd /c/ct/test-sites/tambola
node ../tools/campaign.mjs --from 3 --to 3 --conc 1 --people 250 --heavy 30 --lead 240 --tag s250h > ../data/campaign-s250h.log 2>&1
node ../tools/campaign.mjs --from 1 --to 1 --conc 1 --people 500 --heavy 30 --lead 300 --tag s500a > ../data/campaign-s500a.log 2>&1
node ../tools/campaign.mjs --from 3 --to 3 --conc 1 --people 500 --heavy 30 --lead 300 --tag s500h > ../data/campaign-s500h.log 2>&1
node ../tools/campaign.mjs --from 1 --to 1 --conc 1 --people 1000 --heavy 30 --lead 420 --tag s1000a > ../data/campaign-s1000a.log 2>&1
node ../tools/campaign.mjs --from 3 --to 3 --conc 1 --people 1000 --heavy 30 --lead 420 --tag s1000h > ../data/campaign-s1000h.log 2>&1
echo done > ../data/SCALE-DONE.txt
