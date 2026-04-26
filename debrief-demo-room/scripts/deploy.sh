#!/usr/bin/env bash
# Deploy debrief-demo-room to Cloud Run.
# Run AFTER scripts/setup-secrets.sh has been run at least once.
#
# Usage: bash scripts/deploy.sh
#
# After first deploy, capture the URL and re-run scripts/gcs-cors-update.sh
# with the new origin to allow browser → GCS uploads from production.

set -euo pipefail

PROJECT="${GOOGLE_CLOUD_PROJECT:-invertible-tree-490306-j1}"
REGION="${GOOGLE_CLOUD_LOCATION_RUN:-us-central1}"
SERVICE="debrief-demo-room"
SA="debrief-demo-room-live@${PROJECT}.iam.gserviceaccount.com"
BUCKET="demo-day-room-${PROJECT}"

# Allowed Cloud Tasks service account (the SA that creates tasks — same SA here)
TASK_ALLOWED_SAS="$SA"

# TASK_AUDIENCE = service URL. We pass a placeholder on first deploy, then
# update it once Cloud Run assigns the URL. Cloud Run sets a stable URL after
# first deploy, so subsequent deploys can use the real value.
EXISTING_URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT" --format='value(status.url)' 2>/dev/null || echo '')"
TASK_AUDIENCE="${EXISTING_URL:-https://placeholder.example.com}"

gcloud run deploy "$SERVICE" \
  --source=. \
  --region="$REGION" \
  --project="$PROJECT" \
  --service-account="$SA" \
  --allow-unauthenticated \
  --min-instances=1 \
  --max-instances=10 \
  --memory=2Gi \
  --cpu=2 \
  --cpu-boost \
  --timeout=600 \
  --concurrency=40 \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=${PROJECT},GOOGLE_CLOUD_LOCATION=global,GOOGLE_GENAI_USE_VERTEXAI=true,GCS_BUCKET_NAME=${BUCKET},CLOUD_TASKS_BRIEF_QUEUE=brief-extraction,CLOUD_TASKS_TRANSCRIBE_QUEUE=transcribe,CLOUD_TASKS_LOCATION=${REGION},CLOUD_TASKS_SERVICE_ACCOUNT=${SA},BRIEF_EXTRACTION_DEV_MODE=false,TASK_AUDIENCE=${TASK_AUDIENCE},TASK_ALLOWED_SERVICE_ACCOUNTS=${TASK_ALLOWED_SAS},NODE_ENV=production" \
  --set-secrets="SUPABASE_URL=supabase-url:latest,SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest,GEMINI_API_KEY=gemini-api-key:latest,GOOGLE_API_KEY=google-api-key:latest"

NEW_URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT" --format='value(status.url)')"
echo ""
echo "Deployed: $NEW_URL"

# If audience was placeholder, re-deploy with the real URL so OIDC works.
if [ "$TASK_AUDIENCE" = "https://placeholder.example.com" ]; then
  echo "First deploy detected — updating TASK_AUDIENCE to $NEW_URL"
  gcloud run services update "$SERVICE" \
    --region="$REGION" --project="$PROJECT" \
    --update-env-vars="TASK_AUDIENCE=${NEW_URL}"
fi

echo ""
echo "Next: update GCS CORS to include $NEW_URL"
echo "  edit scripts/gcs-cors.json origins → add \"$NEW_URL\""
echo "  gcloud storage buckets update gs://$BUCKET --cors-file=scripts/gcs-cors.json"
