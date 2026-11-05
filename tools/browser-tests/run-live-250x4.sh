#!/bin/bash
# Owner order 26 Oct: four 250-person games on the REAL corporatetambola.com, one after the other, with the Rs 0 test account demo1@xyz.in (allowed up to 250 people):
#   1 manual + employees only + employee ID     2 manual + anyone
#   3 auto 9 s + employees only + employee ID   4 auto 12 s + anyone
# The organizer builds and publishes by clicking in real Chrome; 6 people play on real phone-size pages, the other 244 on protocol phones that run the real phone game code.
cd /c/ct/test-sites/tools
L=/c/ct/test-sites/data/ui
run() { # tag mode speed aud label
  BROWSER=chrome SITE=https://corporatetambola.com node ui-game.mjs --tag "$1" --login demo1@xyz.in --cap 250 --players 250 --real 6 --mode "$2" --speed "$3" --aud "$4" --lead 12 > $L/live-chrome-$1.log 2>&1
  echo "$(date -u +%H:%M) chrome $1 live 250 people $5: $(grep -c '^PASS' $L/live-chrome-$1.log) pass, $(grep -c '^FAIL' $L/live-chrome-$1.log) fail" >> $L/live-matrix.summary
}
run L250-1 host 9 1 "manual + employees only + employee ID"
run L250-2 host 9 5 "manual + anyone"
run L250-3 auto 9 1 "auto 9 s + employees only + employee ID"
run L250-4 auto 12 5 "auto 12 s + anyone"
echo "$(date -u +%H:%M) 250x4 ALL DONE" >> $L/live-matrix.summary
