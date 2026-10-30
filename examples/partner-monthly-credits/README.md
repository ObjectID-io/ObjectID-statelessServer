# ObjectID Partner API integration examples

Server-to-server monthly credit integration, **testnet and approved mainnet contracts**. The examples default to testnet. Mainnet issuance requires both a configured mainnet contract and independent signer approval. This directory contains public examples for the separate ObjectID Partner API service; it does not change the stateless server or contain backend code or credentials. Node.js 24+, no dependencies.

See the [complete integration guide](docs/monthly-credits.md) and [Partner Program Docs](https://partner-portal.objectid.io/docs#monthly-allowance).

## Start

ObjectID creates your technical partner profile administratively. Obtain your Partner ID and secret through an agreed secure channel; no customer DID or self-service registration is needed. Ask ObjectID to enable the contract with your exact destination address, public server egress IP, validity dates and agreed credit limits. Empty IP lists do not allow all IPs.

Set `OBJECTID_PARTNER_ID` and `OBJECTID_PARTNER_SECRET` in your server's secret store or environment. `.env.example` lists variable names only; the CLI does not load `.env` automatically. Never commit, log or share your actual secret in chat. Do not use these examples in a browser.

```sh
node cli.mjs allowance
```

For an explicitly authorized test mint, set `OBJECTID_RECIPIENT`, `OBJECTID_REQUEST_ID` (a stable ID saved in your own database), and `OBJECTID_CREDIT_AMOUNT`, then run:

```sh
node cli.mjs request
node cli.mjs status
```

`request` can mint credits on the selected network. Keep `OBJECTID_NETWORK=testnet` for tests. For an authorized real request set `OBJECTID_NETWORK=mainnet` and `OBJECTID_ALLOW_MAINNET_REQUEST=true`; use separately issued mainnet credentials. Rerunning with the same ID and identical payload retrieves the original request. Never create a new ID to work around a timeout. `allowance` is the default command and performs no issuance. These examples intentionally do not retry automatically.

```sh
npm test
```

Tests are offline: no credentials, network access or minting required. For live acceptance, start with an allowance read, submit one agreed small request, poll status, then repeat the identical business request and check the digest is unchanged. Use a fresh authentication nonce on every HTTP attempt.

## Files

- `monthly-client.mjs`: signing and request/status/allowance client.
- `cli.mjs`: explicit commands using environment credentials.
- `verify-callback.mjs`: raw-body callback signature verification helper. Integrate durable event deduplication in your application before returning 2xx.
- `docs/monthly-credits.md`: API contract, retry and billing rules.

Bank details, invoices and tax treatment remain in the accounting system. Testnet usage is not billable; mainnet usage statements support manual invoicing and audited full-payment acknowledgements. No license grant for the ObjectID service or backend is implied by these examples.
