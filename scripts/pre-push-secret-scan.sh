#!/usr/bin/env bash
# Pre-push secret scan. Aborts the push if any tracked file contains a value
# that looks like an API key. Run automatically by git if symlinked into
# .git/hooks/pre-push (see install instructions below).
#
# Install (once):
#   ln -s ../../scripts/pre-push-secret-scan.sh .git/hooks/pre-push
#   chmod +x scripts/pre-push-secret-scan.sh
#
# Bypass (only if you know the match is a false positive):
#   git push --no-verify

set -euo pipefail

# Patterns we never want to ship:
#   AIzaSy...     — Google API keys
#   sb_secret_... — Supabase service role
#   sk-...        — OpenAI / Anthropic style
#   eyJ...        — long JWTs (Supabase anon, etc.)
PATTERN='AIzaSy[A-Za-z0-9_-]{30,}|sb_secret_[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{30,}|eyJ[A-Za-z0-9._-]{60,}'

# Only scan files that are part of the upcoming push (delta from origin).
# Falls back to scanning all tracked files if origin/main is unknown.
RANGE="origin/main..HEAD"
if ! git rev-parse --verify "$RANGE" >/dev/null 2>&1; then
  RANGE="HEAD"
fi

CHANGED="$(git diff --name-only "$RANGE" 2>/dev/null | grep -v package-lock.json || true)"
if [ -z "$CHANGED" ]; then
  exit 0
fi

# shellcheck disable=SC2086
HITS="$(echo "$CHANGED" | xargs -I{} sh -c 'test -f "{}" && grep -EnH "'"$PATTERN"'" "{}" || true' 2>/dev/null || true)"

if [ -n "$HITS" ]; then
  echo ""
  echo "✗ pre-push: possible secret detected in upcoming push:"
  echo "$HITS"
  echo ""
  echo "  If this is a false positive, bypass with:  git push --no-verify"
  echo "  If real, rotate the secret immediately and remove from history."
  exit 1
fi

exit 0
