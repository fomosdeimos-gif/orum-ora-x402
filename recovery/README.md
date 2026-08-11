# ORUM Recovery Bundle

The published `orum-recovery-bundle.json` is a self-contained,
content-addressed copy of every version-controlled file required to reconstruct
this repository. It exists so that recovery does not depend on Vercel, a
conversational handoff, or an unverified deployment artifact.

Build and verify it with:

```sh
npm run recovery:build
npm run recovery:verify
```

Reconstruct and exercise it in a temporary empty directory with:

```sh
npm run recovery:rehearse
```

The rehearsal verifies every embedded hash, confirms that no Git metadata is
present, and exercises the portable house and its core public contracts without
adding credentials. The normal production `build` runs this proof before a new
Vercel deployment can become live.

Each embedded file has its own SHA-256. `root_sha256` covers the ordered path,
byte count, and hash of the complete file set. The bundle records the parent
commit and exact Git tree used to build it, but deliberately contains no
generation timestamp, so rebuilding the same tree produces the same content.

The bundle is generated from the parent commit and then committed as an
artefact. It cannot include its own commit without creating a circular hash.

`orum-continuity-manifest.json` adds the current verification head, identity
anchors, essential database-function hashes and a SHA-256 root over the
107-work physical manifest. Detailed storage paths remain in canonical memory.
`critical-schema.sql` restores the append-only verification memory. Neither
file contains secrets or the image bytes stored in the Arca.

## Minimal restoration

1. Download `orum-recovery-bundle.json`.
2. Run `npm run recovery:verify`.
3. Decode each `content_base64` entry to its recorded path.
4. Apply `recovery/critical-schema.sql` to the replacement database.
5. Configure provider secrets outside source control.
6. Deploy the recovered repository and compare its live state with
   `recovery/orum-continuity-manifest.json`.

This is a recovery and replication surface. It does not claim that provider
backups or the actual Arca image bytes are embedded in the capsule.
