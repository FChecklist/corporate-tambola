#!/bin/bash
# CLOUD helper: start the deployed-style local server again on the SAME database file (no wipe). usage: cloud-restart-prod-server.sh PORT DBNAME [TREE]
cd "$(dirname "$0")/../.." || exit 1
export PATH=$PATH:/root/.bun/bin
P=$1; DBN=$2; TREE=${3:-$(pwd)}
TREE=$TREE PORT=$P CT_MODE=TEST TEST_MODE=1 PUBLIC_ORIGIN=http://localhost:$P DB_FILE=./data/$DBN.sqlite nohup bun run tools/load-tests/fault/local-prod.ts >> data/server-$P.log 2>&1 &
echo $! > data/server-$P.pid
for i in $(seq 1 40); do curl -s -m 2 http://localhost:$P/version.json >/dev/null && { echo "server $P restarted"; exit 0; }; sleep 0.5; done
echo "server $P did not come back"; exit 1
