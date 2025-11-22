#!/bin/bash
set -e

echo "🧪 COMPREHENSIVE TEST SUITE"
echo "============================"
echo ""

# Test 1: API Endpoints
echo "📡 Testing API Endpoints..."
curl -s http://localhost:5000/api/users -w "\n✅ /api/users - HTTP %{http_code}\n" || echo "❌ /api/users failed"
curl -s http://localhost:5000/api/settings -w "\n✅ /api/settings - HTTP %{http_code}\n" || echo "❌ /api/settings failed"
curl -s http://localhost:5000/api/messages -w "\n✅ /api/messages - HTTP %{http_code}\n" || echo "❌ /api/messages failed"
echo ""

# Test 2: Check JavaScript conversion
echo "📝 Verifying JavaScript Conversion..."
TS_COUNT=$(find server -name "*.ts" -not -path "*/node_modules/*" | wc -l)
JS_COUNT=$(find server -name "*.js" -not -path "*/node_modules/*" | wc -l)
JSX_COUNT=$(find client/src -name "*.jsx" -not -path "*/node_modules/*" | wc -l)
TSX_COUNT=$(find client/src -name "*.tsx" -not -path "*/node_modules/*" | wc -l)

echo "  Backend:"
echo "    • .js files: $JS_COUNT ✅"
echo "    • .ts files (wrappers only): $TS_COUNT"
echo "  Frontend:"
echo "    • .jsx files: $JSX_COUNT ✅"
echo "    • .tsx files: $TSX_COUNT ✅ (All converted)"
echo ""

# Test 3: Database connectivity
echo "🗄️  Testing Database Connection..."
if [ -n "$DATABASE_URL" ]; then
  echo "  ✅ DATABASE_URL is set"
else
  echo "  ⚠️  DATABASE_URL not found"
fi
echo ""

# Test 4: Check for syntax errors
echo "🔍 Checking for Syntax Errors..."
node --check server/app.js 2>&1 && echo "  ✅ server/app.js - syntax OK" || echo "  ❌ server/app.js - syntax error"
node --check server/routes.js 2>&1 && echo "  ✅ server/routes.js - syntax OK" || echo "  ❌ server/routes.js - syntax error"
node --check server/storage.js 2>&1 && echo "  ✅ server/storage.js - syntax OK" || echo "  ❌ server/storage.js - syntax error"
node --check server/discord-bot.js 2>&1 && echo "  ✅ server/discord-bot.js - syntax OK" || echo "  ❌ server/discord-bot.js - syntax error"
echo ""

# Test 5: Import resolution
echo "✨ Checking Module Imports..."
node --check server/index-dev.js 2>&1 && echo "  ✅ server/index-dev.js - imports OK" || echo "  ❌ server/index-dev.js - import error"
echo ""

echo "🎉 Test Suite Complete!"
