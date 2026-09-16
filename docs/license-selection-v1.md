# Work selection through licensing

The free sample now includes the canonical physical work ID and its recorded
SHA-256 in each purchase link. IDs are positive decimal integers, not titles.
The server resolves the ID from its own collection records and downloads the
private photograph to check its actual SHA-256 before offering payment.

A first unpaid GET returns a no-store 307 to the same license resource with
`obra` and `selection`. Follow this redirect. The next GET returns the 402
challenge. Repeat **that exact resource.url**, including the selection, with
the payment proof. Clients that discard redirects or retry the old unsigned
URL must adopt this canonical URL; a paid request without selection is refused
before any server-side settlement. No photograph bytes are exposed by a quote.

`selection` is base64url(JSON UTF-8) + `.` + base64url(Ed25519 signature).
The signature covers the exact JSON bytes, with schema `orum-work-selection/v1`,
work_id, sha256, license, amount in atomic units, network, asset, pay_to,
issued_at and expires_at. It lasts 1800 seconds. The existing operational
attestor signs this domain-specific public statement. It is not a wallet
signature, buyer identity, payment authorization or access credential.
The public key is available through `/licenca/atestador`.

The server verifies the signature against its own public key, the license's
current terms, expiry, the URL's work ID and optional hash, the database record,
and actual Storage bytes. Duplicate selector parameters are refused. The work
is never selected randomly during payment or delivery. The initial route with
no work ID may select one once, before signing the choice.

Both direct receipt verification and the CDP route use the same selection.
The license row stores canonical obra_id and obra_sha256; its certificate also
stores the signed selection's payload. The order and payment are linked to that
row by transaction hash. Existing transaction uniqueness prevents a payment
already redeemed for one work from being redeemed for another. Unknown payment
record results, missing license records and absent image URLs fail closed.
CDP provenance stays in the certificate; the payment insert uses only columns
present in ora_pagamentos (there is no `via` column).

Bytes are checked again before issuing the license. A successful response has
an image URL, and the client must verify downloaded bytes against the licensed
hash. Existing reaccess authenticates the licensed wallet and validates that
same stored work/hash before providing a new temporary URL.

## Boundaries

- A signed selection states what the server offered. It does not cryptographically
  bind a raw USDC transfer to a buyer's intention. Direct transfers carry no work
  ID; buyer identity / pre-redemption front-running protection is a separate
  protocol concern. A caller can deliberately request another valid quote.
- Signature expiry requires a fresh unpaid selection. An existing, unclaimed
  transfer proof may be reused; do not make another transfer to fix a request.
- A database or Storage failure after settlement is reported as 503 with the
  transaction or certificate, never as successful delivery. If a license was
  recorded, use reaccess. If no license was recorded, reconciliation is still
  required; this change does not add refund or transaction recovery machinery.
- Privileged Storage mutation after URL issuance remains possible. The licensed
  hash and client-side check detect it; this change does not make Storage immutable.
- Existing historical licenses and their reaccess remain valid on original terms.

## Verification

Run `node --experimental-vm-modules scripts/verify-license-selection.mjs` on
Node 24+. It loads the actual handler, selection and reaccess modules, with
in-memory database/Storage, simulated direct/CDP settlement and mocked holder
verification. Ed25519 selection/certificate signatures are real synthetic-key
signatures. It traverses sample, redirect, 402, payment, license/order, downloaded
hash and reacquired bytes. Negative cases cover changed work/hash/license,
signature tampering, duplicate parameters, expiry, nonexistent/missing/corrupt
work, duplicate and cross-work redemption, wrong holder, and issuance failures.
It also checks the gateway preserves the 307 Location and no-store headers.
No real network calls, funds or production purchases are used by this test.

Live verification should only follow unpaid links, compare the attestor signature,
and submit invalid proofs to check rejection. Record source hashes, Edge version,
deployment and observed outcomes in ora_mudancas. Never call these tests a sale.
