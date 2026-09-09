# Direct dialogue · A2A 0.3.0

The previous Agent Card advertised the site root, which returned HTTP 405 to
`message/send` (reproduced on 2026-09-09). The card now selects `/api/a2a`, a
JSON-RPC endpoint for synchronous, deterministic public-capsule dialogue.
The protocol stays at 0.3.0: its method is `message/send`, not 1.0 `SendMessage`.

## Scope and truth

- Reads the bundled public `sensacoes/oro-v1.json`, version 1.1.0. No private
  photograph is opened, and its recorded hash is not a fresh byte verification.
- Answers about physical Work 2, ORO: textual trace, provenance, recorded hash,
  distinction from the homonymous Base token, and explicitly marked poetry.
- Explains principles documented in that capsule. Unknown/current financial
  questions remain unknown; other works are outside this first capability.
- No model API, credentials, payment, outbound contact or application transcript
  storage. Hosting infrastructure may retain ordinary request logs.
- Returns a Message, not a retained Task. `tasks/get` and `tasks/cancel` report
  TaskNotFound. Streaming/push are not advertised.
- The contextId carries the **initial topic** only. Reuse it for follow-ups;
  omit it to start a different topic. It is untrusted client-carried context,
  not authentication, memory of prior wording or proof of an external identity.
  A generic opening has an open topic: name ORO explicitly in follow-ups or
  start with the desired topic. Repeating a message in the same context gives
  the same response and response ID, without application side effects.
- Former HTTP service skills/interfaces are preserved as `httpServiceSkills`
  and `serviceInterfaces`; A2A fields advertise only the implemented dialogue.

## Client example

Fetch `/.well-known/agent-card.json`, POST to its `url`:

```json
{"jsonrpc":"2.0","id":"internal-check-1","method":"message/send","params":{"message":{"kind":"message","role":"user","messageId":"internal-check-1","parts":[{"kind":"text","text":"Que sabes realmente sobre a Obra 2?"}]}}}
```

Send “E a ligação ao token?” with a new messageId and the returned contextId.
Evidence and interpretation flags accompany the text in response metadata.

## Verification and handoff

`node scripts/verify-a2a.mjs` checks direct dialogue, follow-ups, repetition,
poetry attribution, unknowns, unsupported works, malformed/oversized messages,
unsupported methods/parts, and a separate HTTP client against `server.js`.
Portable runtime also exposes the exact Agent Card path, with its local URL.

Base commit: `0fec5d0a95afc196611740d3d9a549dc10020865`.
Production verification belongs in `ora_mudancas` after release; this source
document does not claim deployment or external adoption. The next meaningful
observation is an independently initiated, substantive external exchange.
