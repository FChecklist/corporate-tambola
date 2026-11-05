#!/bin/bash
# The 12 live games the owner asked for: 4 scenarios x 3 browsers, 10 players each, on corporatetambola.com, one after another (the laptop cannot hold two at once).
cd /c/ct/test-sites/tools
L=/c/ct/test-sites/data/ui
until grep -qE "no page error|organizer built and published" $L/live-chromium-LX1.log 2>/dev/null && ! pgrep -f "tag LX1" >/dev/null 2>&1; do sleep 20; done
run() { # browser login tag mode speed aud
  BROWSER=$1 SITE=https://corporatetambola.com node ui-game.mjs --tag $3 --login $2 --cap 10 --players 10 --mode $4 --speed $5 --aud $6 --lead 9 > $L/live-$1-$3.log 2>&1
  echo "$(date -u +%H:%M) $1 $3 mode=$4 speed=$5 aud=$6: $(grep -c '^PASS' $L/live-$1-$3.log) pass, $(grep -c '^FAIL' $L/live-$1-$3.log) fail" >> $L/live-matrix.summary
}
run chrome demo1@xyz.in LC3 auto 12 1
run chrome demo1@xyz.in LC4 host 9 5
run chrome demo1@xyz.in LC5 auto 12 5
run chromium demo2@xyz.in LX2 host 9 1
run chromium demo2@xyz.in LX3 host 9 5
run chromium demo2@xyz.in LX4 auto 12 5
run webkit demo3@xyz.in LW1 host 9 1
run webkit demo3@xyz.in LW2 auto 12 1
run webkit demo3@xyz.in LW3 host 9 5
run webkit demo3@xyz.in LW4 auto 12 5
echo "ALL DONE $(date -u +%H:%M)" >> $L/live-matrix.summary
