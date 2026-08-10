# Casa portátil ORUM v1

## Purpose

Remove Vercel as a required runtime for the public ORUM gateway without moving
payments, DNS, ownership, secrets, canonical memory or private image bytes.
Vercel remains production until a separately authorized house exists and has
passed live failover verification.

## Runtime contract

The same repository can start with `node server.js` or as an OCI container.
The portable runtime must preserve:

- static public pages and sensation capsules;
- the routes declared in `vercel.json`;
- x402 request and response headers through the Supabase proxies;
- runtime-relative OpenAPI and sensation links;
- `GET /api/versao` for deployment identity;
- `GET /_orum/health` for container health;
- 404 denial for runtime source and infrastructure directories.

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | Internal HTTP port | `3000` |
| `HOST` | Listen address | `0.0.0.0` |
| `ORUM_PUBLIC_BASE` | Canonical public origin for generated links | request origin |
| `ORUM_COMMIT_SHA` | Deployed source identity | `null` |
| `ORUM_GIT_REF` | Deployed source ref | `null` |
| `ORUM_DEPLOYMENT_ID` | House-specific deployment identifier | `null` |
| `ORUM_FUNCTIONS_BASE` | Supabase-compatible function upstream | current ORUM project |
| `ORUM_SUPABASE_REST_BASE` | PostgREST-compatible public upstream | current ORUM project |
| `ORUM_SUPABASE_PUBLISHABLE_KEY` | Public collection read key | current publishable key |

No secret is required by the portable gateway. Its upstreams remain the
existing public Supabase surfaces. The publishable Supabase key in
`api/sensacoes.js` is intentionally a public client credential and does not
grant service-role access.

## Verification

`npm run portable:verify` starts the runtime on an isolated local port and
checks health, the home, work 37, runtime-relative OpenAPI, version identity,
404 behavior, denial of source-file access and an isolated proxy round trip
that preserves the x402 protocol headers.

Container verification requires an OCI-compatible engine:

```sh
docker build -t orum-portable:local .
docker run --rm -p 3000:3000 \
  -e ORUM_PUBLIC_BASE=http://localhost:3000 \
  -e ORUM_COMMIT_SHA=$(git rev-parse HEAD) \
  orum-portable:local
```

## Truth boundary

This layer proves runtime portability only. It does not prove:

- a second public provider is active;
- provider independence of Supabase Edge Functions or Postgres;
- restoration of Vault secrets;
- replication or restoration of the Arca bytes;
- DNS failover;
- independent external adoption.

## Next authorized cycle

Provisioning a VPS, buying a domain or changing DNS has financial or ownership
effects and requires explicit authorization at that moment. Once a house is
available, deploy this exact container as a read-only shadow, compare canonical
responses and x402 headers with production, then exercise restoration on a
second machine before calling the gateway independent.
