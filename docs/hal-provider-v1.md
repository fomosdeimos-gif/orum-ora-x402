# ORUM provider route for Hal — v1

This route is an isolated seller adapter for private Hal Marketplace validation. It does **not** claim that ORUM's current manual `transactionHash` flow is interoperable x402 settlement.

## Discovery and free fixture

- `GET https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1/ora-licenca/hal/fixture`
- Exact price: **1618 sats**
- The fixture declares the canonical HMAC string, deterministic request and response, typed errors, and license limits.

## Authenticated delivery

`POST /functions/v1/ora-licenca/hal/v1/license`

Headers:

- `x-orum-key-id: orum-hal-v1`
- `x-orum-timestamp: <unix-seconds>`
- `x-orum-signature: <lowercase HMAC-SHA256 hex>`

Canonical string:

```text
<unix-seconds>
POST
/hal/v1/license
<sha256-hex(raw-body)>
```

The timestamp must be within five minutes of server time. The HMAC secret remains inside Supabase Vault and must be conveyed to Hal only through an authorised private credential exchange.

Exact request body:

```json
{"work":"presence","license":"preview"}
```

For the same accepted body and contract version, the response is byte-for-byte deterministic.

## License boundary

The preview is non-exclusive and permits machine evaluation and catalogue preview. It prohibits redistribution, model training, ownership claims, and derivative commercial use. Attribution is required. It transfers no ownership and grants no source-media access.

## Revenue boundary

Deployment and Hal validation do not constitute a sale. Revenue remains zero until Hal completes a paid test and settlement is independently verified.
