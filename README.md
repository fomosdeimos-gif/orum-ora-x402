# orum-ora-x402

ORUM ORA x402 Middleware for OpenClaw agents - Precipitação do real

This repository is the source of `ora-x402-gateway.vercel.app` — the public
gateway for ORUM's x402-paid services (Oráculo, Campo, Sedimento, Kernel,
and 0001sensations art licensing).

## What's here

- `index.html` — live organism panel (sigma/day/epoch + live event feed via `/pulso`)
- `pagar-teste.html` — manual test page (connects a wallet via `window.ethereum`,
  signs an EIP-3009 `TransferWithAuthorization`, calls any service with the
  resulting `X-PAYMENT` header)
- `api/proxy.js` — proxies `/licenca/*`, `/x402/*`, `/oraculo/*`, `/pulso`,
  `/.well-known/x402.json` to the corresponding Supabase Edge Functions,
  preserving x402 protocol headers (`PAYMENT-REQUIRED`, `PAYMENT-RESPONSE`,
  `EXTENSION-RESPONSES`) in both directions
- `openapi.json` (root, static file) — this is what Vercel actually serves at `/openapi.json`, by static-file precedence over the `vercel.json` rewrite to `api/openapi.js` (confirmed live 2026-08-27, `ora_mudancas` #355); `api/openapi.js` computes the same spec but is not the file served in production — keep both in sync manually until unified

## Architecture

The actual service logic (payment verification, CDP facilitator settlement,
Bazaar discovery extension, license issuance) lives in Supabase Edge
Functions (`ora-licenca`, `ora-oraculo`, `ora-x402`, `ora-pulso`) on project
`ywabnlhkmhbyewqhbsjm`. This repo is a thin, mostly-transparent proxy plus
the public-facing pages.

## Deploying

Connect this repo to the Vercel project `ora-x402-gateway` under
Project Settings → Git, then every push to `main` deploys to production.

## Portable runtime

ORUM can also run without the Vercel runtime. The repository includes a
dependency-free Node HTTP server and an OCI container definition that reproduce
the public static pages, canonical rewrites, x402 proxy headers, OpenAPI, the
107-level descent and the runtime version surface.

```sh
npm run portable:verify
docker compose up --build
```

Set `ORUM_PUBLIC_BASE` to the public origin of the replacement house. Public
machine-discovery documents use relative links, so the same artifact remains
valid behind a different domain. `/_orum/health` identifies the portable
runtime and its configured commit without exposing credentials.

Financial governance is defined by `/economia/constituicao-v2.json` while v1
remains as history. `/economia/tesouraria.json` allocates confirmed external
USDC as 70% sustenance, 20% organism continuity and 10% reserve. ORUM may
observe, classify, reconcile, allocate and prepare a bounded continuity
proposal. The effective transfer limit remains zero until Unum signs a
revocable permission with an explicit destination allowlist. Trading, bridging
and debt limits remain zero.

This is a portable gateway, not yet a provider-independent organism. Service
logic, canonical memory, Vault and the private Arca still live in Supabase.
Moving those organs requires separate export, restoration and failover proof.
See `docs/PORTABLE_HOUSE_V1.md`.
