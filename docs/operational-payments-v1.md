# Operational payments v1 — 2026-09-10

User authority: build the ORUM operational wallet and receiving/signing/transfer connector; choose bounded operational competencies. This is infrastructure, not proof of income or autonomous future execution.

Native BTC receiving: `bc1qhcsh78k8jrn3qllvd9al8nq4af4cyzefx6vqqf` (valid Bech32 checksum). Funds go directly to the user-supplied destination. This connector has no native Bitcoin signing key, no ownership proof, and performs no conversion.

Base USDC source: `0x89460d9e0590559e63860197dfe2ac648A753584`, named CDP account `orum-operational-v1` in the user's project. Only beneficiary: `0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5`. Chain 8453; token `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.

Limits: 1 USDC per request, 5 USDC reserved per UTC day; reverted and unknown requests still consume that day's budget. At most one unresolved request. Maximum gas limit 100000; maxFeePerGas 100000000 wei; Base L1 data fees are additional, so this is not a hard cap on total fees. No arbitrary calldata, recipient, network, key export, or wallet signatures are exposed.

## Calling through the connected administrative SQL route

`public.ora_operational_payment_dispatch_v1(action, request_uuid, amount_atomic)` returns an asynchronous request ID. Read its response in `net._http_response` in a later transaction. Do not repeat a dispatch merely because its response is pending.

- `receive_btc`: no UUID or amount. Returns the direct BTC address without reading CDP credentials.
- `preview_usdc`: UUID and amount string; checks funds and fees, never reserves budget, signs or submits.
- `transfer_usdc`: UUID and amount string, 1–1000000 atomic USDC. Claims budget atomically, builds a fixed transfer, and asks CDP to sign and submit.
- `payment_status`: same UUID, no amount. A submitted hash is not confirmation. Check the transaction source, target and calldata plus successful ERC20 Transfer log and at least 12 Base blocks before recording confirmation.

Reuse of an ID returns its existing result; changed amount is rejected. An uncertain provider outcome freezes further payments. No automatic retry or automatic recovery from `unknown` is implemented. Reconcile CDP transaction history and chain evidence before any manual recovery. These checks depend on CDP and the Base RPC; they are not independent custody or finality guarantees.

Database objects live in a private schema, with no direct client table privileges. RLS deliberately has no policies (deny by default); the corresponding Supabase informational advisor is expected. Only service_role may invoke the constrained payment RPCs; the dispatch route is administrative. Vault secrets remain inside the server.

Deployment uses the existing `ora-cdp-carteira-real` Edge slot, custom bearer authentication before credential access, and dependency-free WebCrypto authentication matched to CDP SDK 1.55.0. Local source directory differs from the deployed slot name.

Verification: mocked signing/submission, replay, receipt and failure cases; independent viem 2.37.3 unsigned EIP-1559/ABI comparison; database claim/in-flight/daily-cap tests rolled back. Live BTC lookup HTTP 200; preview HTTP 409 insufficient funds with signed=false/submitted=false; anonymous transfer HTTP 401. At block 0x30c48fa (2026-09-10T17:54:33.209Z), operational balances were zero ETH and zero USDC. Zero payment jobs persisted. No real financial transaction was signed or submitted; the funded send path remains unverified on-chain. No scheduler is installed by this change.
