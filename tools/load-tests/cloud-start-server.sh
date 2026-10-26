#!/bin/bash
# CLOUD helper: start one local server on a port with a FRESH database file; writes data/server-PORT.pid. usage: cloud-start-server.sh PORT [DBNAME]
cd "$(dirname "$0")/../.." || exit 1
export PATH=$PATH:/root/.bun/bin
P=$1; DBN=${2:-s-$P}; mkdir -p data
rm -f data/$DBN.sqlite data/$DBN.sqlite-shm data/$DBN.sqlite-wal data/$DBN.sqlite.organizer-key
PORT=$P CT_MODE=TEST TEST_MODE=1 PUBLIC_ORIGIN=http://localhost:$P DAILY_WRITE_BUDGET=1000000000 DB_FILE=./data/$DBN.sqlite nohup bun run apps/edge/src/local.ts > data/server-$P.log 2>&1 &
echo $! > data/server-$P.pid
for i in $(seq 1 40); do curl -s -m 2 http://localhost:$P/version.json >/dev/null && { echo "server $P up (db $DBN)"; exit 0; }; sleep 1; done
echo "server $P did not come up"; exit 1
