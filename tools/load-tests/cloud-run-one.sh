#!/bin/bash
# CLOUD: one campaign on its own FRESH local server + database. usage: cloud-run-one.sh PORT TAG FROM TO CONC PEOPLE LEAD   (--heavy 60 as in run-certify5.sh)
cd "$(dirname "$0")/../.." || exit 1
D=data; mkdir -p $D; port=$1 tag=$2 from=$3 to=$4 conc=$5 people=$6 lead=$7
log() { echo "$(date -u +%FT%TZ) $1" >> $D/cloud-part2.progress; }
tools/load-tests/cloud-start-server.sh $port db-$tag >> $D/cloud-part2.progress
log "START $tag cases $from-$to conc $conc people $people lead $lead port $port"
BASE=http://localhost:$port DB_FILE=./data/db-$tag.sqlite NODE_OPTIONS=--max-old-space-size=6144 node tools/load-tests/campaign.mjs --from $from --to $to --conc $conc --people $people --heavy 60 --lead $lead --tag $tag > $D/$tag.out 2>&1
rc=$?; log "DONE $tag (exit $rc)"; kill $(cat $D/server-$port.pid) 2>/dev/null
