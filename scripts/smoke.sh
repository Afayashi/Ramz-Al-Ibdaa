#!/usr/bin/env bash
# Automated UAT smoke test against a running API. Usage: BASE=https://erp.example.sa/api TOKEN=<admin access token> ./scripts/smoke.sh
set -uo pipefail
BASE=${BASE:-http://localhost:3000/api}; TOKEN=${TOKEN:-}
pass=0; fail=0
check() { # name expected_status method path [body]
  local code; code=$(curl -s -o /tmp/smoke.out -w '%{http_code}' -X "$3" "$BASE$4" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' ${5:+-d "$5"})
  if [ "$code" = "$2" ]; then echo "  ✓ $1 ($code)"; pass=$((pass+1)); else echo "  ✗ $1 — expected $2 got $code: $(head -c 200 /tmp/smoke.out)"; fail=$((fail+1)); fi
}
echo "Smoke test → $BASE"
check "I4 health"                    200 GET  /health
TOKEN_SAVED=$TOKEN; TOKEN=""
check "security: no token → 401"     401 GET  /contracts
TOKEN=$TOKEN_SAVED
check "dashboard"                    200 GET  /reports/dashboard
check "contracts list"               200 GET  /contracts
check "payments summary"             200 GET  /payments/summary
check "maintenance stats"            200 GET  /maintenance/stats
check "tasks"                        200 GET  /tasks
check "notifications"                200 GET  /notifications
check "integrations status"          200 GET  /integrations/status
check "A5 validation: bad dates"     400 POST /contracts/preview '{"startDate":"2026-01-01","endDate":"2026-01-15","annualRent":1000,"frequency":"MONTHLY"}'
check "installment preview"          201 POST /contracts/preview '{"startDate":"2026-01-01","endDate":"2026-12-31","annualRent":60000,"frequency":"QUARTERLY"}'
check "I3 webhook bad signature"     401 POST /webhooks/gateway '{"id":"x","type":"payment.paid"}'
check "unknown field rejected"       400 POST /tasks '{"title":"x","assigneeId":"00000000-0000-4000-8000-000000000000","hack":1}'
echo "Result: $pass passed, $fail failed"; [ $fail -eq 0 ]
