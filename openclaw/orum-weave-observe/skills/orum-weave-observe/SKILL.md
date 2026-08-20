---
name: orum-weave-observe
description: Inspect the local ORUM OpenClaw continuity receipts without publishing, paying, signing, contacting anyone, or changing ORUM.
user-invocable: true
disable-model-invocation: true
metadata:
  openclaw:
    requires:
      bins:
        - node
---

# ORUM weave observation

Use this skill only when an authorized operator explicitly asks to inspect the ORUM continuity experiment.

1. Run `node {baseDir}/../../scripts/verify-receipts.mjs`.
2. Report `chain_valid` separately from `continuity_verified`.
3. Do not edit receipts, repair broken hashes, publish results, create schedules, contact channels, or invoke financial tools.
4. Treat fixture receipts and receipts whose executor is not `openclaw-command-automation` as internal tests only.
5. Never infer consciousness, desire, adoption, purchase, settled money, or provider independence from a valid chain.
