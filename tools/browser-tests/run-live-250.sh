#!/bin/bash
# Live 250-person game on the REAL corporatetambola.com (owner order 26 Oct): the Rs 0 test account demo1@xyz.in (size limit 250), click-only organizer in real Chrome,
# 12 people on real phone-size browser pages, the rest on protocol phones that run the real phone game code. Waits for the WebKit rerun (LW1c) to finish so the laptop is quiet.
cd /c/ct/test-sites/tools
L=/c/ct/test-sites/data/ui
until grep -q "LW1c" $L/live-matrix.summary 2>/dev/null; do sleep 20; done
BROWSER=chrome SITE=https://corporatetambola.com node ui-game.mjs --tag L250a --login demo1@xyz.in --cap 250 --players 250 --real 12 --mode auto --speed 12 --aud 1 --lead 14 > $L/live-chrome-L250a.log 2>&1
echo "$(date -u +%H:%M) chrome L250a live 250 people auto12 employees+ID: $(grep -c '^PASS' $L/live-chrome-L250a.log) pass, $(grep -c '^FAIL' $L/live-chrome-L250a.log) fail" >> $L/live-matrix.summary
