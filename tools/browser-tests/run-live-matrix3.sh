#!/bin/bash
cd /c/ct/test-sites/tools
L=/c/ct/test-sites/data/ui
until grep -q "ALL DONE" $L/live-matrix.summary 2>/dev/null; do sleep 30; done
BROWSER=webkit SITE=https://corporatetambola.com node ui-game.mjs --tag LW1b --login demo3@xyz.in --cap 10 --players 10 --mode host --speed 9 --aud 1 --lead 9 > $L/live-webkit-LW1b.log 2>&1
echo "$(date -u +%H:%M) webkit LW1b mode=host aud=1: $(grep -c '^PASS' $L/live-webkit-LW1b.log) pass, $(grep -c '^FAIL' $L/live-webkit-LW1b.log) fail" >> $L/live-matrix.summary
echo "RERUN DONE" >> $L/live-matrix.summary
