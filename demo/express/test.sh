set -e

LOG_FILE=$(mktemp)
node index.js > "$LOG_FILE" 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true; rm -f "$LOG_FILE"' EXIT
ATTEMPTS=0
while ! grep -q "Express running" "$LOG_FILE"; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null || [ "$ATTEMPTS" -ge 30 ]; then
    echo "Server failed to start."
    cat "$LOG_FILE"
    exit 1
  fi
  ATTEMPTS=$((ATTEMPTS + 1))
  sleep 1
done
curl --fail --max-time 10 http://127.0.0.1:3000 | grep -q 'Welcome to LiquidJS'
