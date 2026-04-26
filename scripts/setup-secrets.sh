#!/usr/bin/env bash
# Migrate secrets from .env.local → Google Secret Manager.
# Idempotent: re-running with same values creates a new version (cheap, fine).
#
# Usage: bash scripts/setup-secrets.sh
#
# Run once per project, then update Cloud Run --set-secrets to reference these.

set -euo pipefail

PROJECT="${GOOGLE_CLOUD_PROJECT:-invertible-tree-490306-j1}"
SA="debrief-demo-room-live@${PROJECT}.iam.gserviceaccount.com"

# Load .env.local (export every var)
if [ ! -f .env.local ]; then
  echo "ERROR: .env.local not found. Run from project root." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env.local
set +a

gcloud services enable secretmanager.googleapis.com --project="$PROJECT" --quiet

# Secrets to migrate. Format: <secret-name>:<env-var-name>
SECRETS=(
  "supabase-service-role-key:SUPABASE_SERVICE_ROLE_KEY"
  "supabase-url:SUPABASE_URL"
  "gemini-api-key:GEMINI_API_KEY"
  "google-api-key:GOOGLE_API_KEY"
)

for entry in "${SECRETS[@]}"; do
  name="${entry%%:*}"
  var="${entry##*:}"
  value="${!var:-}"
  if [ -z "$value" ]; then
    echo "skip $name — $var is empty in .env.local"
    continue
  fi

  if gcloud secrets describe "$name" --project="$PROJECT" >/dev/null 2>&1; then
    echo "→ $name exists, adding new version"
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --project="$PROJECT" --quiet >/dev/null
  else
    echo "→ creating $name"
    printf '%s' "$value" | gcloud secrets create "$name" --replication-policy=automatic --data-file=- --project="$PROJECT" --quiet >/dev/null
  fi

  # Grant Cloud Run SA access
  gcloud secrets add-iam-policy-binding "$name" \
    --member="serviceAccount:$SA" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$PROJECT" --quiet >/dev/null
done

echo ""
echo "Done. Secrets ready for Cloud Run --set-secrets."
