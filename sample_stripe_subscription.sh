#!/usr/bin/env bash
set -euo pipefail

# Sample script:
# 1) Create (or reuse) Stripe customer by reseller DID
# 2) Create Stripe subscription checkout session
#
# Requires:
# - curl
# - jq
#
# Usage:
#   chmod +x sample_stripe_subscription.sh
#   ./sample_stripe_subscription.sh

API_BASE_URL="${API_BASE_URL:-https://api.objectid.io}"
RESELLER_DID="${RESELLER_DID:-did:iota:testnet:0xREPLACE_ME}"
RESELLER_NAME="${RESELLER_NAME:-Sample Reseller}"
DESTINATION_ADDRESS="${DESTINATION_ADDRESS:-0xREPLACE_DESTINATION}"
RESELLER_ADDRESS="${RESELLER_ADDRESS:-0xREPLACE_RESELLER}"
BENEFICIARY_DID="${BENEFICIARY_DID:-}"
SUCCESS_URL="${SUCCESS_URL:-https://objectid.io/buyCredits?subscription_session_id={CHECKOUT_SESSION_ID}}"
CANCEL_URL="${CANCEL_URL:-https://objectid.io/buyCredits}"
SANDBOX="${SANDBOX:-true}"

if ! command -v curl >/dev/null 2>&1; then
  echo "Error: curl is required"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required"
  exit 1
fi

if [[ "$RESELLER_DID" == "did:iota:testnet:0xREPLACE_ME" ]]; then
  echo "Error: set RESELLER_DID before running."
  exit 1
fi

if [[ "$DESTINATION_ADDRESS" == "0xREPLACE_DESTINATION" && "$RESELLER_ADDRESS" == "0xREPLACE_RESELLER" ]]; then
  echo "Error: set DESTINATION_ADDRESS or RESELLER_ADDRESS before running."
  exit 1
fi

echo "Step 1/2 - create-customer"
CREATE_CUSTOMER_PAYLOAD="$(jq -n \
  --arg resellerDid "$RESELLER_DID" \
  --arg name "$RESELLER_NAME" \
  --argjson sandbox "$SANDBOX" \
  '{resellerDid:$resellerDid, name:$name, sandbox:$sandbox}')"

CREATE_CUSTOMER_RESPONSE="$(curl -sS -X POST \
  "$API_BASE_URL/api/payments/stripe/create-customer" \
  -H "Content-Type: application/json" \
  -d "$CREATE_CUSTOMER_PAYLOAD")"

echo "$CREATE_CUSTOMER_RESPONSE" | jq .

CUSTOMER_ID="$(echo "$CREATE_CUSTOMER_RESPONSE" | jq -r '.customerId // empty')"
if [[ -z "$CUSTOMER_ID" ]]; then
  echo "Error: customerId not returned by create-customer"
  exit 1
fi

echo "Step 2/2 - create-subscription-checkout"
CREATE_SUBSCRIPTION_PAYLOAD="$(jq -n \
  --arg resellerDid "$RESELLER_DID" \
  --arg destinationAddress "$DESTINATION_ADDRESS" \
  --arg resellerAddress "$RESELLER_ADDRESS" \
  --arg beneficiaryDid "$BENEFICIARY_DID" \
  --arg successUrl "$SUCCESS_URL" \
  --arg cancelUrl "$CANCEL_URL" \
  --argjson sandbox "$SANDBOX" \
  '{
    resellerDid:$resellerDid,
    destinationAddress:$destinationAddress,
    resellerAddress:$resellerAddress,
    successUrl:$successUrl,
    cancelUrl:$cancelUrl,
    sandbox:$sandbox
  }
  + (if $beneficiaryDid == "" then {} else {beneficiaryDid:$beneficiaryDid} end)')"

CREATE_SUBSCRIPTION_RESPONSE="$(curl -sS -X POST \
  "$API_BASE_URL/api/payments/stripe/create-subscription-checkout" \
  -H "Content-Type: application/json" \
  -d "$CREATE_SUBSCRIPTION_PAYLOAD")"

echo "$CREATE_SUBSCRIPTION_RESPONSE" | jq .

CHECKOUT_URL="$(echo "$CREATE_SUBSCRIPTION_RESPONSE" | jq -r '.url // empty')"
if [[ -z "$CHECKOUT_URL" ]]; then
  echo "Error: checkout url not returned by create-subscription-checkout"
  exit 1
fi

echo
echo "Subscription checkout created successfully."
echo "Open this URL to complete payment:"
echo "$CHECKOUT_URL"
