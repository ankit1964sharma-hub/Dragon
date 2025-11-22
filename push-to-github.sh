#!/bin/bash

echo "🚀 Pushing to GitHub: ankit1964sharma-hub/Dragon"
echo ""

# Check if Dragon remote exists, if not add it
if ! git remote | grep -q "dragon"; then
  echo "➕ Adding Dragon remote..."
  git remote add dragon https://github.com/ankit1964sharma-hub/Dragon.git
else
  echo "✅ Dragon remote already exists"
fi

# Show current remotes
echo ""
echo "📋 Current remotes:"
git remote -v

echo ""
echo "📝 Staging all changes..."
git add -A

echo ""
echo "💾 Creating commit..."
git commit -m "Fix withdrawal channel validation, add balance reset command, verify event toggles" || echo "No changes to commit"

echo ""
echo "🚀 Pushing to GitHub..."
git push dragon main || git push dragon master || {
  echo ""
  echo "⚠️  If this is the first push, you may need to:"
  echo "   git push -u dragon main"
  echo ""
  echo "📌 If you get authentication errors, GitHub requires a Personal Access Token (PAT)"
  echo "   Generate one at: https://github.com/settings/tokens"
  echo "   Use the token as your password when prompted"
}

echo ""
echo "✅ Done! Check your repository at: https://github.com/ankit1964sharma-hub/Dragon"
