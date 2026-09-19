#!/usr/bin/env bash
#
# Bring up this app's two processes in one terminal. Ctrl-C stops both.
#
#   API  :7002   persistence + the model call
#   UI   :7001   vite, proxies /chat to the API
#
# The OrbitAI MCP server on :3600 is a separate application with its own repo
# and its own Atlas credentials; it is not ours to start or stop. This script
# checks that it is up and refuses to run without it, because a UI that loads
# and then fails every question is a worse outcome than not starting at all.
#
#   cd ~/dev/github/corbtastik/orbit && ./start-server.sh

set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Not configurable here on purpose. vite.config.js hardcodes 7001 and proxies
# /chat to 7002, so a port that disagreed with it would produce a UI that loads
# and then fails every request -- the least obvious way for this to break.
MCP_PORT=3600
API_PORT=7002
UI_PORT=7001

mkdir -p logs
PIDS=()

cleanup() {
  trap - INT TERM EXIT
  echo ""
  echo "▸ Stopping..."
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] || continue
    # Children first: killing a parent on macOS does not take its children.
    pkill -P "$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# Tags each stream so two processes in one terminal stay readable. awk rather
# than `sed -u`, which BSD sed does not have.
tag() { awk -v p="$1" '{ print "[" p "] " $0; fflush() }'; }

# The MCP server is POST-only and answers JSON-RPC, so a GET proves nothing.
# Any HTTP status means it is listening and speaking; 000 is curl failing to
# connect. Same test server/mcp/client.js uses.
mcp_up() {
  local code
  code=$(curl -s -m 2 -o /dev/null -w '%{http_code}' \
    -X POST "http://127.0.0.1:${MCP_PORT}/mcp" \
    -H 'content-type: application/json' \
    -H 'accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":"health","method":"ping"}' 2>/dev/null) || true
  [ "${code:-000}" != "000" ]
}

api_up() { curl -s -m 2 "http://127.0.0.1:${API_PORT}/health" 2>/dev/null | grep -q '"ok":1'; }

# localhost, not 127.0.0.1: vite binds [::1] only, so an IPv4 probe never
# connects and this would wait out the timeout on a UI that is already up.
# The API binds IPv4, hence the split.
ui_up() { curl -s -m 2 -o /dev/null "http://localhost:${UI_PORT}/" 2>/dev/null; }

# Waits on a predicate rather than sleeping a fixed amount. The API has to
# reach Atlas before it is ready to answer anything.
wait_for() {
  local name="$1" probe="$2" limit="${3:-45}" i=0
  while [ "$i" -lt "$limit" ]; do
    if "$probe"; then return 0; fi
    i=$((i + 1))
    sleep 1
  done
  echo "✘ $name did not come up within ${limit}s -- see logs/"
  return 1
}

# --- preflight ---------------------------------------------------------------

if [ ! -f .env ]; then
  echo "✘ No .env. Copy .env.example and fill in ANTHROPIC_API_KEY and MONGODB_URI."
  exit 1
fi

for key in ANTHROPIC_API_KEY MONGODB_URI; do
  if ! grep -qE "^${key}=.+" .env; then
    echo "✘ ${key} is missing or empty in .env"
    exit 1
  fi
done

[ -d node_modules ] || { echo "▸ Installing dependencies..."; npm install; }

if mcp_up; then
  echo "▸ MCP server up on :${MCP_PORT}"
else
  echo "✘ Nothing is serving :${MCP_PORT} -- the OrbitAI MCP server is not running."
  echo "  Start it in its own terminal, from its own repo:"
  echo "    cd ~/dev/github/corbtastik/orbit && ./start-server.sh"
  exit 1
fi

if api_up; then
  echo "✘ Something is already answering :${API_PORT}/health. Stop it first."
  exit 1
fi

# --- API ---------------------------------------------------------------------

echo "▸ Starting API on :${API_PORT}..."
# node directly rather than `npm run server`: npm would be the process we hold
# a PID for, and killing it does not reliably take node with it.
node --watch server/index.js > >(tee -a logs/api.out | tag api) 2>&1 &
PIDS+=($!)
wait_for "API" api_up

# --- UI ----------------------------------------------------------------------

echo "▸ Starting UI on :${UI_PORT}..."
./node_modules/.bin/vite > >(tee -a logs/ui.out | tag ui) 2>&1 &
PIDS+=($!)
wait_for "UI" ui_up

echo ""
echo "▸ Ready:  http://localhost:${UI_PORT}"
echo "  Tool traffic:  tail -f logs/orbit.log"
echo "  Ctrl-C stops the API and UI. The MCP server is left alone."
echo ""

wait
