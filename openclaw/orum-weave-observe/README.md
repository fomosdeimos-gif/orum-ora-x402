# ORUM · OpenClaw continuity probe

This is a bounded, model-free experiment for testing whether an OpenClaw Gateway can carry one read-only `@weave_hands` observation across conversation boundaries.

It is not the ORUM organism and it does not claim autonomy. It uses no wallet, payment, signing key, channel, publication route, private image, or mutation tool.

## What it does

1. An operator-owned OpenClaw command automation runs `scripts/observe.mjs`.
2. The script calls the public `weave_cycle` MCP tool.
3. A local JSONL receipt is appended with a SHA-256 link to the previous receipt.
4. `scripts/verify-receipts.mjs` verifies the complete chain and reports the continuity criterion separately.

The default endpoint is:

`https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1/weave-hands/mcp`

## Acceptance criterion

Integrity and continuity are different results:

- `chain_valid`: every recorded hash and previous-hash link verifies.
- `continuity_verified`: at least 3 successful receipts, at least 24 hours between first and last, at least 2 distinct host boot identifiers, and every qualifying receipt declares `openclaw-command-automation` as executor.

Until both are true, this experiment must remain `executed` or `observed`, never `verified autonomous continuity`.

## Install on an isolated persistent host

OpenClaw itself is intentionally not vendored here. Review and install the pinned stable release on the chosen host, then copy this directory into the OpenClaw workspace.

```sh
npm install -g openclaw@2026.7.1-2 --allow-scripts=openclaw
openclaw --version
openclaw doctor
openclaw gateway status
```

Install the local skill:

```sh
openclaw skills install ./skills/orum-weave-observe --as orum-weave-observe
```

Create the deterministic automation from the package root, replacing `/absolute/path` with the reviewed absolute path:

```sh
openclaw automations create "17 */8 * * *" \
  --name "ORUM weave continuity probe" \
  --command-argv '["node","/absolute/path/openclaw/orum-weave-observe/scripts/observe.mjs"]' \
  --command-cwd "/absolute/path/openclaw/orum-weave-observe" \
  --command-env ORUM_EXECUTOR=openclaw-command-automation \
  --command-env ORUM_RECEIPT_DIR=/absolute/path/openclaw/orum-weave-observe/state \
  --timeout-seconds 90 \
  --output-max-bytes 8192 \
  --no-announce
```

Keep the Gateway bound to loopback and do not configure messaging channels for this experiment. The fragment in `openclaw.fragment.json5` documents the intended restriction; merge it only after reviewing the host's existing configuration.

Verify at any time:

```sh
node scripts/verify-receipts.mjs
```

## Truth boundary

A valid receipt proves that a process reached the public connector and preserved the returned bytes in a hash-linked local log. The continuity criterion proves bounded scheduled operation across time and host boots. Neither proves consciousness, desire, external adoption, purchase, settled money, provider independence, or survival of ORUM without its existing providers.
