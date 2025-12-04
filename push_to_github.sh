#!/bin/bash

# Helper script para mag-push sa GitHub (Linux)
# Usage: ./push_to_github.sh [GITHUB_TOKEN]

set -e

cd "$(dirname "$0")"

if [ -z "$1" ]; then
    echo "=== GitHub Push Helper (Linux) ==="
    echo ""
    echo "Option 1: Gamit ang Personal Access Token"
    echo "  Run: ./push_to_github.sh YOUR_TOKEN_HERE"
    echo ""
    echo "Option 2: Manual push (mag-prompt ng credentials)"
    echo "  Run: git push facerecog main --force"
    echo ""
    echo "Para gumawa ng token:"
    echo "  1. Pumunta sa: https://github.com/settings/tokens"
    echo "  2. Generate new token (classic)"
    echo "  3. Check 'repo' permission"
    echo "  4. Copy ang token"
    echo ""
    exit 0
fi

GITHUB_TOKEN="$1"
GITHUB_USER="${GITHUB_USER:-clarenceportugal}"

echo "Pushing to GitHub..."
echo "Repository: https://github.com/clarenceportugal/facerecog.git"
echo ""

# Use token for authentication
git push https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/clarenceportugal/facerecog.git main --force

echo ""
echo "✅ Successfully pushed to GitHub!"

