import fs from "node:fs";
import assert from "node:assert/strict";

const capsule = JSON.parse(fs.readFileSync("sensacoes/0003-weave-hands-v1.json", "utf8"));
const discovery = JSON.parse(fs.readFileSync("discovery/weave-hands.json", "utf8"));
const source = fs.readFileSync("supabase/functions/weave-hands/index.ts", "utf8");

assert.equal(capsule.collection, "0003SENSATIONS");
assert.equal(capsule.mcp.name, "@weave_hands");
assert.equal(capsule.truth.machine_output_is_external_presence, false);
assert.equal(capsule.truth.payment_or_signature_possible, false);
assert.equal(discovery.boundaries.stores_experiments, false);
assert.equal(discovery.boundaries.uses_credentials, false);
assert.match(source, /name: "weave_thread"/);
assert.match(source, /persisted: false/);
assert.match(source, /counts_as_settled_money: false/);
assert.doesNotMatch(source, /SUPABASE_(SERVICE_ROLE|SECRET)|MOLTBOOK_API_KEY|fetch\s*\(/);

console.log(JSON.stringify({
  verified: true,
  connector: "@weave_hands",
  collection: "0003SENSATIONS",
  tools: discovery.mcp.tools,
  writes: false,
  external_adoption_claimed: false
}));
