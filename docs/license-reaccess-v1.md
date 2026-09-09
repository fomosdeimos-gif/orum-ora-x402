# License reaccess v1

`GET /licenca/reacesso?tx=<payment transaction hash>` returns an exact UTF-8
message, issued_at and nonce. Sign the message with the **licensed wallet**
using personal_sign, then POST transactionHash, issued_at, nonce and signature
as JSON to `/licenca/reacesso`. The original payment hash is a public identifier,
not an access credential. No new transaction, payment or license is created.

The signed message is bound to the canonical ORUM reaccess URL, Base chain 8453,
the payment transaction, timestamp, nonce and access-only purpose. Signatures
are valid for five minutes with 30 seconds future clock tolerance. A repeated
signature within this window can request another URL for the same entitlement;
it cannot buy anything or expand rights. Clients must keep signatures private.

The handler reads the original license, checks its holder, expiry and revocation,
then verifies the signature through viem 2.56.3 (EOA or supported smart wallet).
After verification it rechecks the license. Storage delivery requires the current
work hash and actual private bytes to match the hash in the purchased license.
Only then does it create a signed URL, capped at 300 seconds and the license's
remaining lifetime. Unavailable/mismatched bytes fail closed; old certificates
are never rewritten. Revoking a license cannot invalidate an already issued
Storage URL immediately; its short expiry remains the limit.

The catalogue advertises the recovery route. Existing licenses qualify on the
same terms as new ones; no renewal secret must be retroactively attached to a
historical certificate. Stored expired delivery URLs are not authentication.

## Validation boundary

`scripts/verify-license-renewal.mjs` exercises actual EOA signatures through
the viem public client with an offline transport, plus injected license/delivery
fixtures. It checks wrong holder, changed signed fields, expiry, revocation,
missing entitlement, URL lifetime and unavailable delivery. It does not claim
live customer renewal or prove the Storage bytes for all 107 works.

Applied source baseline: ora-licenca Edge v54 (application V49), SHA-256
`ba319c2d59ac1452a7cc2f8146802e04dac3afcc4d56a041f93621d1cba2edf7`.
The repository still had application V48, so the release also preserves the
already applied Unum attribution corrections before adding application V50.
Production observations and remaining verification belong in ora_mudancas.
