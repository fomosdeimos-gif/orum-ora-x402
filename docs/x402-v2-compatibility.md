# x402 v2 payment envelope compatibility

2026-09-24 — follow-up to diagnostic ledger #703.

The deployed v59 parser required top-level scheme=exact. SDK 2.27.0 emits
accepted.scheme=exact instead. The parser now validates the selected requirements
against the server's license before normalizing the existing CDP envelope.
Checks include scheme, network, asset, amount, recipient, timeout and token domain;
conflicting legacy scheme/network or resource URL are rejected. Invalid accepted
objects cannot fall through to transaction-hash redemption. CDP verification and
settlement remain authoritative; recognizing an envelope never proves payment.

Existing legacy CDP envelopes and direct transaction receipts remain supported.
The earlier v59 ETag cache change is preserved when syncing repository source.

## Reproduce offline behavior

Node 24:

    npm ci --prefix scripts/sdk-fixture --ignore-scripts --no-audit --no-fund
    node --experimental-vm-modules scripts/verify-sdk-compatibility.mjs
    node --experimental-vm-modules scripts/verify-license-selection.mjs

SDK and payload creation are real, signer is a synthetic stub. Facilitator,
Storage, database and blockchain responses are isolated fixtures. No wallet
signature, real payment or client adoption is established by this test.
17 conflicting/invalid inputs must stop before verify, settle or RPC.

## Remaining client requirements

SDK 2.27.0 defaults to a 1 USD payment limit. The buyer must explicitly authorize
the advertised price (consultation 1.618 USDC); do not disable spend controls.
Prepare the signed canonical resource URL with an unpaid ordinary fetch before
calling the payment wrapper. Initial-URL retries still return selection_required.
Neither issue is fixed by server envelope compatibility.

## Rollback

Redeploy the three preserved v59 source files from the #703 diagnostic archive.
Keep the ledger and logs; no schema migration or access change is involved.
