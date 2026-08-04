# ORUM Recovery Bundle

`orum-recovery-bundle.json` is a self-contained, content-addressed copy of every
version-controlled file required to reconstruct this repository. It exists so
that recovery does not depend on Vercel, a conversational handoff, or an
unverified deployment artifact.

Build and verify it with:

```sh
npm run recovery:build
npm run recovery:verify
```

Each embedded file has its own SHA-256. `root_sha256` covers the ordered path,
byte count, and hash of the complete file set. The bundle records the parent
commit and exact Git tree used to build it, but deliberately contains no
generation timestamp, so rebuilding the same tree produces the same content.

This is a recovery and replication surface, not a claim that a second public
host already exists.
