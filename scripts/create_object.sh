#!/bin/sh
set -eu

STATELESS_BASE_URL="${OBJECTID_STATELESS_URL:-http://host.docker.internal:3002}"
NETWORK="${OBJECTID_NETWORK:-testnet}"
SEED="${OBJECTID_SEED:-}"
CREDIT_TOKEN="${OBJECTID_CREDIT_TOKEN:-}"
OID_CONTROLLER_CAP="${OBJECTID_CONTROLLER_CAP:-}"
DEFAULT_OBJECT_TYPE="${OBJECTID_DEFAULT_TYPE:-image}"
DEFAULT_OP_CODE="${OBJECTID_DEFAULT_OP_CODE:-}"
DEFAULT_GEO_LOCATION="${OBJECTID_DEFAULT_GEO_LOCATION:-}"

FILE_NAME="${1:-}"
IMAGE_URL="${2:-}"
DESCRIPTION="${3:-}"
EXTRA_JSON="${4:-{}}"

if [ -z "$FILE_NAME" ] || [ -z "$IMAGE_URL" ]; then
  echo '{"success":false,"error":"Usage: create_object.sh <fileName> <imageUrl> <description> [extraJson]"}'
  exit 1
fi

case "$SEED:$CREDIT_TOKEN:$OID_CONTROLLER_CAP" in
  ""*|*::|*REPLACE_WITH_SEED*|*REPLACE_WITH_CREDIT_TOKEN*|*REPLACE_WITH_OID_CONTROLLER_CAP*)
    echo '{"success":false,"error":"Configura OBJECTID_SEED, OBJECTID_CREDIT_TOKEN e OBJECTID_CONTROLLER_CAP nelle variabili d ambiente"}'
    exit 1
    ;;
esac

REQUEST_BODY="$({ \
  FILE_NAME="$FILE_NAME" \
  IMAGE_URL="$IMAGE_URL" \
  DESCRIPTION="$DESCRIPTION" \
  EXTRA_JSON="$EXTRA_JSON" \
  NETWORK="$NETWORK" \
  SEED="$SEED" \
  CREDIT_TOKEN="$CREDIT_TOKEN" \
  OID_CONTROLLER_CAP="$OID_CONTROLLER_CAP" \
  DEFAULT_OBJECT_TYPE="$DEFAULT_OBJECT_TYPE" \
  DEFAULT_OP_CODE="$DEFAULT_OP_CODE" \
  DEFAULT_GEO_LOCATION="$DEFAULT_GEO_LOCATION" \
  node <<'NODE'; \
}
const extraRaw = process.env.EXTRA_JSON || "{}";
let extra;
try {
  extra = JSON.parse(extraRaw);
} catch (_error) {
  console.error(JSON.stringify({ success: false, error: "extraJson non valido" }));
  process.exit(1);
}

const base = {
  seed: process.env.SEED,
  network: process.env.NETWORK,
  creditToken: process.env.CREDIT_TOKEN,
  OIDcontrollerCap: process.env.OID_CONTROLLER_CAP,
  object_type: process.env.DEFAULT_OBJECT_TYPE,
  product_url: process.env.IMAGE_URL,
  product_img_url: process.env.IMAGE_URL,
  description: process.env.DESCRIPTION || "",
  op_code: process.env.DEFAULT_OP_CODE,
  immutable_metadata: {
    file_name: process.env.FILE_NAME,
  },
  mutable_metadata: {
    file_name: process.env.FILE_NAME,
    image_url: process.env.IMAGE_URL,
    description: process.env.DESCRIPTION || "",
  },
  geo_location: process.env.DEFAULT_GEO_LOCATION,
};

const payload = {
  ...base,
  ...extra,
  immutable_metadata:
    extra.immutable_metadata && typeof extra.immutable_metadata === "object"
      ? extra.immutable_metadata
      : base.immutable_metadata,
  mutable_metadata:
    extra.mutable_metadata && typeof extra.mutable_metadata === "object"
      ? extra.mutable_metadata
      : base.mutable_metadata,
};

process.stdout.write(JSON.stringify(payload));
NODE
)"

response_file="$(mktemp)"
http_code="$({ curl -sS -o "$response_file" -w "%{http_code}" \
  -X POST "$STATELESS_BASE_URL/create_object" \
  -H "Content-Type: application/json" \
  -d "$REQUEST_BODY"; } )"
response_body="$(cat "$response_file")"
rm -f "$response_file"

case "$http_code" in
  2*)
    printf '%s\n' "$response_body"
    ;;
  *)
    printf '%s\n' "$response_body"
    exit 1
    ;;
esac
