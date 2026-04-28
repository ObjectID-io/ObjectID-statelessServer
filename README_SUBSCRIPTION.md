# Stripe Subscription Flow (Reseller Model)

This document describes the Stripe subscription flow used by ObjectID with the reseller model.

## Overview

The flow is split into two backend steps:

1. Create (or reuse) a Stripe customer profile for the user or the reseller.
2. Start a Stripe Checkout session in subscription mode.

The reseller is identified by DID (`oid_did`), and the subscription can optionally top up credits to a different beneficiary address.

---

## 1) Create Customer Profile (Reseller)

### Endpoint

`POST /api/payments/stripe/create-customer`

### Request body

```json
{
  "resellerDid": "did:iota:testnet:0x...",
  "name": "Optional Reseller Name",
  "sandbox": true
}
```

### Notes

- `resellerDid` is required.
- `name` is optional.
- `sandbox` is optional:
  - if `true`, test Stripe keys are used;
  - if omitted, sandbox is inferred from DID (`:testnet:` -> test).

### Behavior

- If a customer with `metadata.oid_did == resellerDid` already exists, it is reused.
- Otherwise, a new customer is created.
- Minimum metadata written:
  - `oid_did` = reseller DID.

### Response

```json
{
  "customerId": "cus_...",
  "sandbox": true,
  "created": true
}
```

---

## 2) Create Subscription Checkout (Top-up)

### Endpoint

`POST /api/payments/stripe/create-subscription-checkout`

### Request body

```json
{
  "resellerDid": "did:iota:testnet:0x...",
  "destinationAddress": "0xbeneficiary...",
  "resellerAddress": "0xresellerFallback...",
  "beneficiaryDid": "did:iota:testnet:0xbeneficiaryDidOptional",
  "successUrl": "https://yourapp.example/success?subscription_session_id={CHECKOUT_SESSION_ID}",
  "cancelUrl": "https://yourapp.example/cancel",
  "sandbox": true
}
```

### Required fields

- `resellerDid`

### Optional fields

- `destinationAddress`: explicit token recipient.
- `resellerAddress` (or `address`): fallback recipient when `destinationAddress` is not provided.
- `beneficiaryDid`: optional beneficiary DID metadata.
- `successUrl`, `cancelUrl`.
- `sandbox`.

### Beneficiary resolution

The backend resolves `oid_beneficiary_address` in this order:

1. `destinationAddress` (if provided),
2. `customer.metadata.oid_address` (legacy fallback),
3. `resellerAddress` / `address` in request body.

If none is available, the request fails with `400`.

### Metadata written to session/subscription

- `oid_did` (reseller DID)
- `oid_beneficiary_address`
- `oid_beneficiary_did` (optional)

### Response

```json
{
  "url": "https://checkout.stripe.com/...",
  "id": "cs_...",
  "sandbox": true,
  "customerId": "cus_...",
  "subscriptionPriceId": "price_...",
  "beneficiaryAddress": "0x..."
}
```

---

## Recommended Client Sequence

1. Call `create-customer` once per customer or reseller DID.
2. Store returned `customerId` client-side (optional optimization).
3. Call `create-subscription-checkout` whenever a subscription needs to be activated.
4. Redirect user to returned `url`.

---

### Stateless server (`ObjectID-statelessServer`) should have

- the base URL of the billing backend (for example `https://api.objectid.io`) in your integration config.
- Stripe keys only if you intentionally add routes that call Stripe directly from this server.
