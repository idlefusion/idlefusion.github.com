#!/usr/bin/env bash
#
# DNSimple → Cloudflare DNS Migration
#
# Migrates 5 domains (eewby.com, ellastrickland.com, idlefusion.com,
# katiestrickland.com, mstrick.com) from DNSimple to Cloudflare.
# runeasy.app is already on Cloudflare DNS.
#
# Usage:
#   export CF_API_TOKEN="your-cloudflare-token"
#   export DS_API_TOKEN="your-dnsimple-token"
#   ./scripts/cloudflare-migration.sh [step]
#
# Steps: add-zones, create-records, create-redirects, switch-ns, verify, unlock, all
#
set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────

CF_TOKEN="${CF_API_TOKEN:?Export CF_API_TOKEN first}"
DS_TOKEN="${DS_API_TOKEN:?Export DS_API_TOKEN first}"

CF_ACCOUNT="db45bb0a2f77daf6b206a366a124165d"
DS_ACCOUNT="5046"
CF_API="https://api.cloudflare.com/client/v4"
DS_API="https://api.dnsimple.com/v2/$DS_ACCOUNT"

DOMAINS=(eewby.com ellastrickland.com idlefusion.com katiestrickland.com mstrick.com)

STATE_DIR="$(cd "$(dirname "$0")" && pwd)/.migration-state"
ZONE_MAP_FILE="$STATE_DIR/zone-map.json"

# ─── Helpers ──────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()     { echo -e "${RED}[ERR]${NC} $*"; }
header()  { echo -e "\n${BOLD}${BLUE}═══ $* ═══${NC}\n"; }

confirm() {
  echo -e "\n${YELLOW}▸ $1${NC}"
  read -rp "  Press Enter to continue (Ctrl+C to abort)... "
  echo
}

# Cloudflare API call
cf() {
  local method=$1 path=$2
  shift 2
  curl -sf -X "$method" "${CF_API}${path}" \
    -H "Authorization: Bearer $CF_TOKEN" \
    -H "Content-Type: application/json" \
    "$@"
}

# DNSimple API call
ds() {
  local method=$1 path=$2
  shift 2
  curl -sf -X "$method" "${DS_API}${path}" \
    -H "Authorization: Bearer $DS_TOKEN" \
    -H "Content-Type: application/json" \
    "$@"
}

# Get zone ID from saved state
zone_id_for() {
  local domain=$1
  jq -r --arg d "$domain" '.[$d].zone_id // empty' "$ZONE_MAP_FILE"
}

# Get nameservers from saved state
ns_for() {
  local domain=$1
  jq -r --arg d "$domain" '.[$d].nameservers[]' "$ZONE_MAP_FILE"
}

# ─── Step 2: Add zones to Cloudflare ─────────────────────────────────────────

step_add_zones() {
  header "Step 2: Add zones to Cloudflare"

  mkdir -p "$STATE_DIR"
  # Initialize or load zone map
  if [[ ! -f "$ZONE_MAP_FILE" ]]; then
    echo '{}' > "$ZONE_MAP_FILE"
  fi

  for domain in "${DOMAINS[@]}"; do
    # Skip if already in state
    local existing_id
    existing_id=$(zone_id_for "$domain")
    if [[ -n "$existing_id" ]]; then
      info "$domain — already added (zone: $existing_id)"
      continue
    fi

    echo -n "  Adding $domain... "
    local result
    result=$(cf POST /zones -d "{\"name\":\"$domain\",\"account\":{\"id\":\"$CF_ACCOUNT\"},\"type\":\"full\"}" 2>&1) || true

    local success
    success=$(echo "$result" | jq -r '.success')

    if [[ "$success" == "true" ]]; then
      local zone_id ns1 ns2
      zone_id=$(echo "$result" | jq -r '.result.id')
      ns1=$(echo "$result" | jq -r '.result.name_servers[0]')
      ns2=$(echo "$result" | jq -r '.result.name_servers[1]')

      # Save to state
      local tmp
      tmp=$(jq --arg d "$domain" --arg z "$zone_id" --arg n1 "$ns1" --arg n2 "$ns2" \
        '.[$d] = {zone_id: $z, nameservers: [$n1, $n2]}' "$ZONE_MAP_FILE")
      echo "$tmp" > "$ZONE_MAP_FILE"

      info "$domain — zone: $zone_id, NS: $ns1, $ns2"
    else
      local error_msg
      error_msg=$(echo "$result" | jq -r '.errors[0].message // "unknown"')

      # Zone may already exist on Cloudflare
      if echo "$error_msg" | grep -qi "already exists"; then
        echo -n "(exists, fetching)... "
        result=$(cf GET "/zones?name=$domain")
        local zone_id ns1 ns2
        zone_id=$(echo "$result" | jq -r '.result[0].id')
        ns1=$(echo "$result" | jq -r '.result[0].name_servers[0]')
        ns2=$(echo "$result" | jq -r '.result[0].name_servers[1]')

        local tmp
        tmp=$(jq --arg d "$domain" --arg z "$zone_id" --arg n1 "$ns1" --arg n2 "$ns2" \
          '.[$d] = {zone_id: $z, nameservers: [$n1, $n2]}' "$ZONE_MAP_FILE")
        echo "$tmp" > "$ZONE_MAP_FILE"

        info "$domain — zone: $zone_id, NS: $ns1, $ns2"
      else
        err "$domain — $error_msg"
      fi
    fi
  done

  echo
  info "Zone map saved to $ZONE_MAP_FILE"
  jq '.' "$ZONE_MAP_FILE"
}

# ─── Step 3: Create DNS records ──────────────────────────────────────────────

# Delete all non-system records from a Cloudflare zone (clear auto-imports)
clear_zone_records() {
  local zone_id=$1 domain=$2
  local records
  records=$(cf GET "/zones/$zone_id/dns_records?per_page=100")
  local ids
  ids=$(echo "$records" | jq -r '.result[].id')

  local count=0
  for id in $ids; do
    cf DELETE "/zones/$zone_id/dns_records/$id" > /dev/null 2>&1 || true
    ((count++))
  done

  if [[ $count -gt 0 ]]; then
    warn "$domain — cleared $count auto-imported records"
  fi
}

# Create a single DNS record on Cloudflare
create_cf_record() {
  local zone_id=$1
  shift
  local result
  result=$(cf POST "/zones/$zone_id/dns_records" -d "$1" 2>&1) || true

  local success
  success=$(echo "$result" | jq -r '.success')
  if [[ "$success" != "true" ]]; then
    local error_msg
    error_msg=$(echo "$result" | jq -r '.errors[0].message // "unknown"')
    err "    Failed: $error_msg"
    return 1
  fi
  return 0
}

step_create_records() {
  header "Step 3: Create DNS records from DNSimple"

  for domain in "${DOMAINS[@]}"; do
    local zone_id
    zone_id=$(zone_id_for "$domain")
    if [[ -z "$zone_id" ]]; then
      err "$domain — no zone ID found, run add-zones first"
      continue
    fi

    echo -e "${BOLD}$domain${NC} (zone: $zone_id)"

    # Clear any auto-imported records
    clear_zone_records "$zone_id" "$domain"

    # Fetch all records from DNSimple
    local ds_records
    ds_records=$(ds GET "/zones/$domain/records?per_page=100")
    local total
    total=$(echo "$ds_records" | jq '.data | length')
    info "  Fetched $total records from DNSimple"

    # Process records
    local created=0 skipped=0

    # Use process substitution to avoid subshell
    while IFS= read -r record; do
      local type name content ttl priority system_record
      type=$(echo "$record" | jq -r '.type')
      name=$(echo "$record" | jq -r '.name')
      content=$(echo "$record" | jq -r '.content')
      ttl=$(echo "$record" | jq -r '.ttl')
      priority=$(echo "$record" | jq -r '.priority // empty')
      system_record=$(echo "$record" | jq -r '.system_record')

      # Skip system records (SOA, NS managed by provider)
      if [[ "$system_record" == "true" ]]; then
        continue
      fi

      # Map empty name to @ for Cloudflare
      local cf_name
      if [[ -z "$name" ]]; then
        cf_name="@"
      else
        cf_name="$name"
      fi

      case "$type" in
        A|AAAA)
          info "  $type $cf_name → $content"
          create_cf_record "$zone_id" \
            "{\"type\":\"$type\",\"name\":\"$cf_name\",\"content\":\"$content\",\"ttl\":1,\"proxied\":false}" \
            && ((created++)) || true
          ;;

        CNAME)
          info "  CNAME $cf_name → $content"
          create_cf_record "$zone_id" \
            "{\"type\":\"CNAME\",\"name\":\"$cf_name\",\"content\":\"$content\",\"ttl\":1,\"proxied\":false}" \
            && ((created++)) || true
          ;;

        ALIAS)
          # Cloudflare supports CNAME at apex via auto-flattening
          info "  CNAME $cf_name → $content (from ALIAS, DNS-only)"
          create_cf_record "$zone_id" \
            "{\"type\":\"CNAME\",\"name\":\"$cf_name\",\"content\":\"$content\",\"ttl\":1,\"proxied\":false}" \
            && ((created++)) || true
          ;;

        MX)
          info "  MX $cf_name → $content (pri: $priority)"
          create_cf_record "$zone_id" \
            "{\"type\":\"MX\",\"name\":\"$cf_name\",\"content\":\"$content\",\"ttl\":1,\"priority\":${priority:-10}}" \
            && ((created++)) || true
          ;;

        TXT)
          # Must properly escape content for JSON
          local json_content
          json_content=$(printf '%s' "$content" | jq -Rs '.')
          info "  TXT $cf_name → ${content:0:60}..."
          create_cf_record "$zone_id" \
            "{\"type\":\"TXT\",\"name\":\"$cf_name\",\"content\":${json_content},\"ttl\":1}" \
            && ((created++)) || true
          ;;

        SRV)
          # DNSimple SRV content format: "weight port target"
          local weight port target
          weight=$(echo "$content" | awk '{print $1}')
          port=$(echo "$content" | awk '{print $2}')
          target=$(echo "$content" | awk '{print $3}' | sed 's/\.$//')

          # Parse service and proto from record name: _service._proto
          local service proto
          service=$(echo "$name" | cut -d. -f1)
          proto=$(echo "$name" | cut -d. -f2)

          info "  SRV $name → $target:$port (pri: ${priority:-0}, w: $weight)"
          create_cf_record "$zone_id" \
            "{\"type\":\"SRV\",\"name\":\"${name}.${domain}\",\"data\":{\"service\":\"$service\",\"proto\":\"$proto\",\"name\":\"$domain\",\"priority\":${priority:-0},\"weight\":$weight,\"port\":$port,\"target\":\"$target\"}}" \
            && ((created++)) || true
          ;;

        URL)
          # URL redirects need a proxied A record + redirect rule (Step 4)
          warn "  URL $cf_name → $content (redirect rule needed)"
          if [[ "$cf_name" != "@" ]]; then
            info "    Creating proxied A record: $cf_name → 192.0.2.1"
            create_cf_record "$zone_id" \
              "{\"type\":\"A\",\"name\":\"$cf_name\",\"content\":\"192.0.2.1\",\"ttl\":1,\"proxied\":true}" \
              && ((created++)) || true
          fi
          ((skipped++))
          ;;

        *)
          warn "  Skipping unknown type: $type $cf_name → $content"
          ((skipped++))
          ;;
      esac
    done < <(echo "$ds_records" | jq -c '.data[]')

    info "  $domain: $created created, $skipped skipped"
    echo
  done
}

# ─── Step 4: Create redirect rules ──────────────────────────────────────────

step_create_redirects() {
  header "Step 4: Create redirect rules"

  # mstrick.com: hire.mstrick.com → https://mstrick.com/hire (301)
  local zone_id
  zone_id=$(zone_id_for "mstrick.com")
  if [[ -z "$zone_id" ]]; then
    err "mstrick.com zone ID not found"
    return 1
  fi

  info "Creating redirect: hire.mstrick.com → https://mstrick.com/hire"

  local result
  result=$(cf POST "/zones/$zone_id/rulesets" -d '{
    "name": "Redirects",
    "kind": "zone",
    "phase": "http_request_dynamic_redirect",
    "rules": [{
      "expression": "(http.host eq \"hire.mstrick.com\")",
      "description": "hire.mstrick.com -> mstrick.com/hire",
      "action": "redirect",
      "action_parameters": {
        "from_value": {
          "status_code": 301,
          "target_url": {
            "value": "https://mstrick.com/hire"
          },
          "preserve_query_string": false
        }
      }
    }]
  }' 2>&1) || true

  local success
  success=$(echo "$result" | jq -r '.success')
  if [[ "$success" == "true" ]]; then
    info "Redirect rule created"
  else
    local error_msg
    error_msg=$(echo "$result" | jq -r '.errors[0].message // "unknown"')
    err "Failed to create redirect: $error_msg"
    echo "$result" | jq '.errors'
  fi
}

# ─── Step 5: Switch nameservers ──────────────────────────────────────────────

step_switch_nameservers() {
  header "Step 5: Switch nameservers at DNSimple"

  echo -e "${RED}${BOLD}WARNING: This changes live DNS for all domains.${NC}"
  echo "DNS propagation can take 1-48 hours. Services may be briefly unreachable."
  echo

  for domain in "${DOMAINS[@]}"; do
    local ns1 ns2
    ns1=$(jq -r --arg d "$domain" '.[$d].nameservers[0]' "$ZONE_MAP_FILE")
    ns2=$(jq -r --arg d "$domain" '.[$d].nameservers[1]' "$ZONE_MAP_FILE")

    if [[ -z "$ns1" || "$ns1" == "null" ]]; then
      err "$domain — no nameservers found in state"
      continue
    fi

    confirm "Switch $domain to Cloudflare NS? ($ns1, $ns2)"

    echo -n "  Updating $domain... "
    local result
    result=$(ds PUT "/registrar/domains/$domain/delegation" \
      -d "[\"$ns1\",\"$ns2\"]" 2>&1) || true

    if echo "$result" | jq -e '.data' > /dev/null 2>&1; then
      info "$domain — nameservers updated"
      echo "$result" | jq '.data'
    else
      err "$domain — failed to update nameservers"
      echo "$result"
    fi

    # Brief pause between domains
    sleep 2
  done
}

# ─── Step 6: Verify ─────────────────────────────────────────────────────────

step_verify() {
  header "Step 6: Verify DNS migration"

  # Zone activation status
  echo -e "${BOLD}Zone activation:${NC}"
  for domain in "${DOMAINS[@]}"; do
    local zone_id
    zone_id=$(zone_id_for "$domain")
    if [[ -z "$zone_id" ]]; then
      err "  $domain — no zone ID"
      continue
    fi
    local status
    status=$(cf GET "/zones/$zone_id" | jq -r '.result.status')
    if [[ "$status" == "active" ]]; then
      info "  $domain: $status"
    else
      warn "  $domain: $status (may need time to propagate)"
    fi
  done

  # Also check runeasy.app
  local runeasy_status
  runeasy_status=$(cf GET "/zones/f922dcb27d4db9d1fa2809a5c8b72a50" | jq -r '.result.status')
  info "  runeasy.app: $runeasy_status"

  # DNS resolution
  echo -e "\n${BOLD}DNS resolution (dig):${NC}"
  for domain in "${DOMAINS[@]}"; do
    echo -n "  $domain: "
    dig +short "$domain" 2>/dev/null | tr '\n' ' '
    echo
  done

  # Key HTTPS endpoints
  echo -e "\n${BOLD}HTTPS checks:${NC}"
  local urls=(
    "https://idlefusion.com"
    "https://www.idlefusion.com"
    "https://ellastrickland.com"
    "https://mstrick.com"
    "https://katiestrickland.com"
    "https://gather25.idlefusion.com"
    "https://runeasy.app"
  )
  for url in "${urls[@]}"; do
    echo -n "  $url: "
    local code
    code=$(curl -so /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "TIMEOUT")
    if [[ "$code" =~ ^(200|301|302)$ ]]; then
      info "$code"
    else
      warn "$code"
    fi
  done

  # Redirect check
  echo -e "\n${BOLD}Redirect checks:${NC}"
  echo -n "  hire.mstrick.com: "
  local location
  location=$(curl -sI --max-time 10 "https://hire.mstrick.com" 2>/dev/null | grep -i '^location:' | tr -d '\r')
  if [[ -n "$location" ]]; then
    info "$location"
  else
    warn "no redirect (may need proxy to activate)"
  fi

  # MX records
  echo -e "\n${BOLD}MX records (idlefusion.com):${NC}"
  dig MX idlefusion.com +short 2>/dev/null | while read -r line; do
    echo "  $line"
  done

  # Nameserver check
  echo -e "\n${BOLD}Current nameservers:${NC}"
  for domain in "${DOMAINS[@]}"; do
    echo -n "  $domain: "
    dig NS "$domain" +short 2>/dev/null | sort | tr '\n' ' '
    echo
  done
}

# ─── Step 7: Unlock domains for transfer ────────────────────────────────────

step_unlock_domains() {
  header "Step 7: Unlock domains for transfer out"

  echo "This will unlock each domain and email the auth/EPP code"
  echo "to the registrant contact (matthew@idlefusion.com)."
  echo
  echo "After receiving the codes, go to:"
  echo "  Cloudflare Dashboard → Registrar → Transfer Domains"
  echo

  local all_domains=("${DOMAINS[@]}" runeasy.app)

  for domain in "${all_domains[@]}"; do
    confirm "Unlock $domain for transfer?"
    echo -n "  Unlocking $domain... "

    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${DS_API}/registrar/domains/$domain/authorize_transfer_out" \
      -H "Authorization: Bearer $DS_TOKEN" \
      -H "Content-Type: application/json")

    if [[ "$http_code" == "204" ]]; then
      info "$domain unlocked — check email for auth code"
    else
      err "$domain — HTTP $http_code"
    fi
  done

  echo
  info "All domains processed."
  echo
  echo "Next steps:"
  echo "  1. Check matthew@idlefusion.com for auth/EPP codes"
  echo "  2. Go to Cloudflare Dashboard → Registrar → Transfer Domains"
  echo "  3. Enter auth code for each domain and confirm payment"
  echo "  4. Transfers take 5-7 days to complete"
  echo
  warn "Note: runeasy.app (registered 2026-01-26) must wait until ~March 27"
  warn "for 60-day transfer eligibility."
}

# ─── Token validation ────────────────────────────────────────────────────────

validate_tokens() {
  echo -n "Validating Cloudflare token... "
  local cf_status
  cf_status=$(cf GET /user/tokens/verify | jq -r '.result.status' 2>/dev/null || echo "failed")
  if [[ "$cf_status" == "active" ]]; then
    info "active"
  else
    err "$cf_status"
    exit 1
  fi

  echo -n "Validating DNSimple token... "
  local ds_plan
  ds_plan=$(ds GET "" | jq -r '.data.plan_identifier' 2>/dev/null || echo "failed")
  if [[ "$ds_plan" != "failed" ]]; then
    info "OK (plan: $ds_plan)"
  else
    err "failed"
    exit 1
  fi
}

# ─── Main ────────────────────────────────────────────────────────────────────

run_all() {
  echo "╔═══════════════════════════════════════════════════╗"
  echo "║   DNSimple → Cloudflare DNS Migration             ║"
  echo "║   Domains: ${DOMAINS[*]}  ║"
  echo "╚═══════════════════════════════════════════════════╝"
  echo

  validate_tokens

  confirm "Step 2: Add zones to Cloudflare?"
  step_add_zones

  confirm "Step 3: Create DNS records (clears auto-imports first)?"
  step_create_records

  confirm "Step 4: Create redirect rules?"
  step_create_redirects

  confirm "Step 5: Switch nameservers at DNSimple (CHANGES LIVE DNS)?"
  step_switch_nameservers

  echo
  info "Nameservers switched. Propagation may take 1-48 hours."

  confirm "Step 6: Run verification checks?"
  step_verify

  confirm "Step 7: Unlock domains for transfer? (auth codes emailed)"
  step_unlock_domains

  echo
  info "Migration script complete!"
  echo
  echo "Remaining manual steps:"
  echo "  1. Enter transfer auth codes in Cloudflare dashboard"
  echo "  2. Wait for transfers to complete (5-7 days)"
  echo "  3. Cancel DNSimple subscription"
}

# ─── CLI entry point ─────────────────────────────────────────────────────────

case "${1:-all}" in
  add-zones)         validate_tokens; step_add_zones ;;
  create-records)    validate_tokens; step_create_records ;;
  create-redirects)  validate_tokens; step_create_redirects ;;
  switch-ns)         validate_tokens; step_switch_nameservers ;;
  verify)
    # Load zone IDs from state or fetch them
    if [[ ! -f "$ZONE_MAP_FILE" ]]; then
      echo "No state file found. Fetching zone IDs from Cloudflare..."
      mkdir -p "$STATE_DIR"
      echo '{}' > "$ZONE_MAP_FILE"
      for domain in "${DOMAINS[@]}"; do
        local result zone_id ns1 ns2
        result=$(cf GET "/zones?name=$domain")
        zone_id=$(echo "$result" | jq -r '.result[0].id // empty')
        ns1=$(echo "$result" | jq -r '.result[0].name_servers[0] // empty')
        ns2=$(echo "$result" | jq -r '.result[0].name_servers[1] // empty')
        if [[ -n "$zone_id" ]]; then
          local tmp
          tmp=$(jq --arg d "$domain" --arg z "$zone_id" --arg n1 "$ns1" --arg n2 "$ns2" \
            '.[$d] = {zone_id: $z, nameservers: [$n1, $n2]}' "$ZONE_MAP_FILE")
          echo "$tmp" > "$ZONE_MAP_FILE"
        fi
      done
    fi
    validate_tokens
    step_verify
    ;;
  unlock)            validate_tokens; step_unlock_domains ;;
  all)               run_all ;;
  *)
    echo "Usage: $0 [add-zones|create-records|create-redirects|switch-ns|verify|unlock|all]"
    exit 1
    ;;
esac
