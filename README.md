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
- `api/openapi.js` — serves `/openapi.json`, the licensing catalog spec

## Architecture

The actual service logic (payment verification, CDP facilitator settlement,
Bazaar discovery extension, license issuance) lives in Supabase Edge
Functions (`ora-licenca`, `ora-oraculo`, `ora-x402`, `ora-pulso`) on project
`ywabnlhkmhbyewqhbsjm`. This repo is a thin, mostly-transparent proxy plus
the public-facing pages.

## Deploying

Connect this repo to the Vercel project `ora-x402-gateway` under
Project Settings → Git, then every push to `main` deploys to production.
