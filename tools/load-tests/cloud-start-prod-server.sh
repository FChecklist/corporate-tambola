#!/bin/bash
# CLOUD helper: a local server that mimics the deployed settings (see fault/local-prod.ts). usage: cloud-start-prod-server.sh PORT DBNAME [TREE]
cd "$(dirname "$0")/../.." || exit 1
export PATH=$PATH:/root/.bun/bin
P=$1; DBN=$2; TREE=${3:-$(pwd)}; mkdir -p data
rm -f data/$DBN.sqlite data/$DBN.sqlite-shm data/$DBN.sqlite-wal data/$DBN.sqlite.organizer-key
TREE=$TREE PORT=$P CT_MODE=TEST TEST_MODE=1 PUBLIC_ORIGIN=http://localhost:$P DB_FILE=./data/$DBN.sqlite nohup bun run tools/load-tests/fault/local-prod.ts > data/server-$P.log 2>&1 &
echo $! > data/server-$P.pid
for i in $(seq 1 40); do curl -s -m 2 http://localhost:$P/version.json >/dev/null && { echo "prod-style server $P up (tree $TREE)"; grep "settings applied" data/server-$P.log | cut -c1-300; exit 0; }; sleep 1; done
echo "server $P did not come up"; cat data/server-$P.log | tail -5; exit 1
