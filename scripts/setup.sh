#!/usr/bin/env bash
set -euo pipefail

API="http://127.0.0.1:3000"
USERNAME="alice"
PASSWORD="password123"
SKILL_PATH="examples/demo-skill"

echo "=== Skill Platform Setup ==="

# 1. Check API is running
echo "[1/5] Checking API..."
if ! curl -sf "$API/health" > /dev/null; then
  echo "  ❌ API not running at $API — start it first: npm run dev:api"
  exit 1
fi
echo "  ✅ API running"

# 2. Register test user
echo "[2/5] Registering user '$USERNAME'..."
RESP=$(curl -sf -X POST "$API/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}") || true

if echo "$RESP" | grep -q '"error"'; then
  echo "  ⚠️  Registration failed (maybe user exists), trying login..."
  RESP=$(curl -s -X POST "$API/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")
fi

TOKEN=$(echo "$RESP" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
  echo "  ❌ Could not get token"
  exit 1
fi
echo "  ✅ Token obtained"

# 3. Publish demo skill
echo "[3/5] Publishing demo skill..."
export SKILL_AUTH_TOKEN="$TOKEN"
npm run skill -- publish "$SKILL_PATH" 2>&1 | grep -E "Published|Verdict|Scores" || echo "  ❌ Publish failed"
echo "  ✅ Published"

# 4. Search to verify
echo "[4/5] Verifying search..."
RESULT=$(curl -sf "$API/skills?query=demo" | cat)
if echo "$RESULT" | grep -q '"name"'; then
  COUNT=$(echo "$RESULT" | grep -o '"name"' | wc -l | tr -d ' ')
  echo "  ✅ Found $COUNT skill(s)"
else
  echo "  ⚠️  No skills found in search"
fi

# 5. Done
echo "[5/5] Setup complete!"

echo ""
echo "Open http://127.0.0.1:3001 to see the skill in the web UI"
echo "Login: $USERNAME / $PASSWORD"
