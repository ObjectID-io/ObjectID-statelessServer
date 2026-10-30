# Monthly credits: partner integration guide

## Availability and onboarding

The monthly post-paid flow is enabled for explicitly approved **testnet** contracts. Mainnet monthly issuance remains disabled. Pre-paid orders are a separate API flow; administratively managed monthly-only partners cannot use pre-paid order endpoints.

ObjectID creates your technical profile and configures the contract. Provide an agreed destination address and your server's static public egress IP, not a private LAN/container IP. Multiple exact IPs may be approved; an empty list is invalid, not unrestricted access. ObjectID securely supplies a Partner ID and a one-time-displayed API secret. You do not need a customer DID, portal registration, bank account details or fiscal data in the technical service. An opaque ERP customer reference links the usage statement to accounting.

The administrator enables the contract and removes its hold after agreeing the monthly limit, outstanding exposure cap, unit price, pending-request cap and validity. Secret rotation immediately invalidates the old key; coordinate it with ObjectID. Callback configuration for administratively managed partners is coordinated with ObjectID, not through customer self-service. Until configured and validated, poll status.

## Authentication

Public base URL: `https://partner-api.objectid.io/testnet`.

Every API call, including reads, requires:

| Header | Value |
| --- | --- |
| `X-Partner-Id` | Your technical partner ID |
| `X-Timestamp` | Unix seconds; clock skew at most 300 seconds |
| `X-Nonce` | Fresh 8-128 character value matching `[A-Za-z0-9_-]+`, e.g. UUID |
| `X-Signature` | Lowercase hexadecimal HMAC-SHA256 |

The canonical UTF-8 string is:

```text
timestamp + "." + nonce + "." + UPPERCASE_METHOD + "." + path + "." + sha256(rawBody)
```

`sha256` returns lowercase hexadecimal. Sign the exact bytes you send, with no added newline. GET body is empty. The signed path includes any query string, but **excludes the public `/testnet` prefix**, which the gateway strips. For example, call `/testnet/v1/credit-allowance` but sign `/v1/credit-allowance`. The network is selected by the base URL, not a caller-supplied body field. Use TLS, store the key server-side, maintain accurate time, and never set forwarding headers to bypass IP controls.

## Request credits

`POST /v1/credit-requests`

```json
{
  "request_id": "YOUR-SAVED-REQUEST-0001",
  "recipient_address": "0xYOUR_APPROVED_64_HEX_CHARACTER_ADDRESS",
  "credit_amount": 1
}
```

The address above is a placeholder: replace it with your approved 64-hex-digit IOTA address. Request IDs are 1-128 characters matching `[A-Za-z0-9][A-Za-z0-9._:-]*`. Quantity is an integer from 1 to 1,000,000 and must fit all contract limits. No additional body fields are accepted; the client cannot set prices or override the network.

A new request returns **202** and reserves the quantity atomically. An identical repeat returns **200** and the existing request, including its current status. The service scopes Request-ID to your partner. Reusing it with a different destination or quantity returns **409 `request_id_conflict`**.

Typical initial response (illustrative):

```json
{
  "request_id": "YOUR-SAVED-REQUEST-0001",
  "status": "pending",
  "credit_amount": "1",
  "recipient_address": "0xYOUR_APPROVED_64_HEX_CHARACTER_ADDRESS",
  "network": "testnet",
  "reservation_period": "2026-10-01T00:00:00.000Z",
  "created_at": "2026-10-30T12:00:00.000Z",
  "tx_digest": null,
  "credit_object_ids": [],
  "resolved_at": null,
  "chain_executed_at": null
}
```

On success, `tx_digest`, `credit_object_ids`, `resolved_at` and `chain_executed_at` are populated. Store the request ID, original payload and final outcome in your own system. A successful HTTP submission alone is not confirmation of issuance.

## Read status and allowance

`GET /v1/credit-requests/{request_id}` returns only your partner's request. Status is one of:

| Status | Meaning |
| --- | --- |
| `pending` | Not final; quantity remains reserved |
| `succeeded` | Confirmed issuance; reservation consumed |
| `failed` | Definitive failure; reservation released |
| `manual_review` | Uncertain; contact ObjectID, reservation stays locked |

`GET /v1/credit-allowance` returns `period_start`, `period_end`, `timezone`, `monthly_limit`, `reserved`, `consumed`, `available`, `hold`, `enabled`, `network`, `recipient_address` and `reservation_only`. Numeric credit counters are decimal strings. `reservation_only: false` indicates the instance is configured for issuance; contract controls still apply.

Periods are UTC calendar months. Available quantity is the monthly limit minus consumed and reserved, with a floor of zero. Cross-month pending requests keep their original reservation period. Outstanding exposure is a separate constraint: all unsettled non-failed requests, including successful issuance, count toward exposure. An audited full-payment allocation releases only its assigned successful requests; reversing the allocation restores exposure. Manual settlement is currently available for testnet simulation only. A new month does not clear unpaid exposure, and settlement does not reset monthly consumption. A positive `available` balance therefore does not guarantee admission.

## Safe retries and reconciliation

Persist your business ID and payload before sending. After a timeout, use the same Request-ID and identical payload, with a **new timestamp, nonce and signature**. Poll at a moderate interval (for example every 5 seconds with backoff). Never retry with a new business ID merely because the previous outcome is unknown.

The service persists signed blockchain transaction bytes and digest before submission. Reconciliation checks that digest and can retransmit the same signed transaction. Timeout, node error or transaction not found does not release allowance or create a replacement transaction. Other requests may continue within limits, unless a contract/account hold or safety control applies. For a definitive failed request, a new business request is possible after addressing the cause; do not reuse a failed ID expecting a new mint.

## Errors and budgets

| HTTP / code | Action |
| --- | --- |
| 400 `invalid_*` | Correct the payload |
| 401 | Check credentials, signature, clock and exact raw body/path |
| 403 `source_ip_not_allowed` | Ask ObjectID to authorize your actual public egress IP |
| 403 `destination_not_allowed` | Use the contracted address |
| 403 `contract_not_configured`, `contract_unavailable`, `credits_not_authorized`, `contract_network_mismatch` | Contact ObjectID; no new reservation is admitted |
| 404 `request_not_found` | Verify partner and business ID |
| 409 `request_id_conflict` | Original payload differs; do not overwrite it |
| 409 nonce replay | Use fresh authentication metadata, same business ID |
| 409 `insufficient_allowance`, `exposure_limit_exceeded`, `pending_limit_exceeded` | Wait for applicable outcomes or contact ObjectID |
| 429 | Honor `Retry-After` when supplied; use backoff |
| 5xx / network timeout | Query status, then safely retry the same business request |

Default application budgets: 600 requests/minute globally, 120/IP, 60/partner, 20 writes/partner. A separate edge limit also applies and may return non-JSON errors. Limits can change; honor responses instead of treating the defaults as guaranteed capacity. If admission storage is unavailable, the service returns 503 without creating a reservation.

## Optional callback

The event type is **`objectid.credit_request.resolved`**, for confirmed success or definitive failure. The payload contains `event_id`, `request_id`, `status`, `network`, `recipient_address`, `credit_amount`, `tx_digest`, `credit_object_ids`, `resolved_at`, `chain_executed_at` and `event_type`.

Verify `X-ObjectID-Signature` as HMAC-SHA256 of `timestamp + "." + exactRawBody`, using your partner API secret. Validate `X-ObjectID-Timestamp` freshness (the helper uses 300 seconds), compare `X-ObjectID-Event-Id` with `event_id`, validate the expected event/network and correlate the request, recipient and quantity against your stored request. See `verify-callback.mjs`.

Deduplicate event IDs durably, applying the business update and deduplication record atomically. Return 2xx only after durable acceptance; return 2xx for an already processed valid event. Non-2xx and timeouts cause retries of the same event ID/payload with a new timestamp/signature. Callback failure does not undo or duplicate issuance. Never accept a callback based on the source address alone. The helper is not a complete HTTP receiver or durable event store.

## Usage statements and invoicing

Administrators can load a monthly statement and CSV in Post-paid / Monthly statements. Only confirmed successful issuance with an execution timestamp in the chosen UTC month contributes, using the price and ERP reference saved for that request's contract version. The reservation month may differ. Pending/failed requests are excluded; missing execution timestamps require investigation.

The statement is a live preview, not an invoice or a closed ledger: late confirmations can update a historical month. Testnet reports are explicitly **NOT BILLABLE**. Automatic invoice creation/emailing and payment collection are not implemented by this kit. Administrators can record and reverse full-payment simulations against selected successful testnet requests, with invoice references and audit reasons; the client cannot settle its own usage. Actual invoices, bank data and tax treatment stay in the ERP/accounting workflow; no tax exemption is assumed by the API.
