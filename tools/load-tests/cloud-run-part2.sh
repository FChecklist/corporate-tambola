#!/bin/bash
# CLOUD: the 250 / 500 / 1000 mix (run-certify5.sh lines), each campaign on its own FRESH local server + database, two chains side by side (4 cores).
# usage: cloud-run-part2.sh A|B     A = m250 (cases 1-18, conc 3) then m1000a (37-42, conc 1)      B = m500 (19-36, conc 2) then m1000b (43-45, conc 1)
# The campaign flags are exactly those of run-certify5.sh (--heavy 60, --lead 250/300/400); only the case range of the 1000-person cases is split over two tags/servers.
cd "$(dirname "$0")/../.." || exit 1
D=data; mkdir -p $D
log() { echo "$(date -u +%FT%TZ) $1" >> $D/cloud-part2.progress; }
run() { # port tag from to conc people lead
  local port=$1 tag=$2 from=$3 to=$4 conc=$5 people=$6 lead=$7
  tools/load-tests/cloud-start-server.sh $port db-$tag >> $D/cloud-part2.progress
  log "START $tag cases $from-$to conc $conc people $people lead $lead port $port"
  BASE=http://localhost:$port DB_FILE=./data/db-$tag.sqlite NODE_OPTIONS=--max-old-space-size=6144 node tools/load-tests/campaign.mjs --from $from --to $to --conc $conc --people $people --heavy 60 --lead $lead --tag $tag > $D/$tag.out 2>&1
  local rc=$?
  log "DONE $tag (exit $rc)"
  kill $(cat $D/server-$port.pid) 2>/dev/null
}
case $1 in
  A) run 8831 m250 1 18 3 250 250; run 8833 m1000a 37 42 1 1000 400 ;;
  B) run 8832 m500 19 36 2 500 300; run 8834 m1000b 43 45 1 1000 400 ;;
  *) echo "usage: $0 A|B"; exit 1 ;;
esac
log "CHAIN $1 ALL DONE"
