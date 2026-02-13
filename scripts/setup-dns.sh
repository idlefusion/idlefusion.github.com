#!/usr/bin/env bash
#
# Cloudflare DNS setup for idlefusion.com
#
# Automates DNS record creation/updates for Cloudflare Workers deployment.
# Requires: CF_API_TOKEN and CF_ZONE_ID environment variables.
#
# Usage:
#   export CF_API_TOKEN="your-api-token"
#   export CF_ZONE_ID="your-zone-id"
#   ./scripts/setup-dns.sh
#
# To find your Zone ID: Cloudflare Dashboard → your domain → Overview → right sidebar
# To create an API token: Cloudflare Dashboard → My Profile → API Tokens → Create Token
#   Required permissions: Zone:DNS:Edit
#

set -euo pipefail

API_BASE="https://api.cloudflare.com/client/v4"
DOMAIN="idlefusion.com"
WORKER_NAME="idlefusion-website"

# ── Validation ──────────────────────────────────────────────────────────────

if [[ -z "${CF_API_TOKEN:-}" ]]; then
  echo "Error: CF_API_TOKEN is not set."
  echo "Create one at: https://dash.cloudflare.com/profile/api-tokens"
  echo "Required permissions: Zone:DNS:Edit"
  exit 1
fi

if [[ -z "${CF_ZONE_ID:-}" ]]; then
  echo "Error: CF_ZONE_ID is not set."
  echo "Find it at: https://dash.cloudflare.com → your domain → Overview → right sidebar"
  exit 1
fi

# ── Helpers ─────────────────────────────────────────────────────────────────

cf_api() {
  local method="$1"
  local endpoint="$2"
  shift 2
  curl -s -X "$method" \
    "${API_BASE}${endpoint}" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "$@"
}

get_record_id() {
  local name="$1"
  local type="$2"
  local response
  response=$(cf_api GET "/zones/${CF_ZONE_ID}/dns_records?type=${type}&name=${name}")
  echo "$response" | python3 -c "
import sys, json
data = json.load(sys.stdin)
records = data.get('result', [])
print(records[0]['id'] if records else '')
" 2>/dev/null || echo ""
}

upsert_record() {
  local name="$1"
  local type="$2"
  local content="$3"
  local proxied="${4:-true}"

  echo "→ ${type} record: ${name} → ${content} (proxied: ${proxied})"

  local record_id
  record_id=$(get_record_id "$name" "$type")

  local payload
  payload=$(python3 -c "
import json
print(json.dumps({
    'type': '${type}',
    'name': '${name}',
    'content': '${content}',
    'proxied': ${proxied},
    'ttl': 1
}))
")

  local response
  if [[ -n "$record_id" ]]; then
    echo "  Updating existing record (${record_id})..."
    response=$(cf_api PUT "/zones/${CF_ZONE_ID}/dns_records/${record_id}" -d "$payload")
  else
    echo "  Creating new record..."
    response=$(cf_api POST "/zones/${CF_ZONE_ID}/dns_records" -d "$payload")
  fi

  local success
  success=$(echo "$response" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print('true' if data.get('success') else 'false')
" 2>/dev/null || echo "false")

  if [[ "$success" == "true" ]]; then
    echo "  Done."
  else
    echo "  Failed:"
    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
    return 1
  fi
}

# ── DNS Records ─────────────────────────────────────────────────────────────

echo "Setting up DNS records for ${DOMAIN}..."
echo ""

# Apex domain — CNAME flattened by Cloudflare at the edge
upsert_record "${DOMAIN}" "CNAME" "${WORKER_NAME}.workers.dev"

# www redirect — CNAME to the same worker, handle redirect in _redirects or worker
upsert_record "www.${DOMAIN}" "CNAME" "${WORKER_NAME}.workers.dev"

echo ""
echo "DNS records configured. Verify at:"
echo "  https://dash.cloudflare.com → ${DOMAIN} → DNS → Records"
echo ""
echo "Next steps:"
echo "  1. npm run deploy    # Deploy your site to Cloudflare Workers"
echo "  2. Verify https://${DOMAIN} resolves correctly"
