import fs from "node:fs";
import assert from "node:assert/strict";

const capsule = JSON.parse(fs.readFileSync("sensacoes/0003-weave-hands-v1.json", "utf8"));
const discovery = JSON.parse(fs.readFileSync("discovery/weave-hands.json", "utf8"));
const source = fs.readFileSync("supabase/functions/weave-hands/index.ts", "utf8");

assert.equal(capsule.collection, "0003SENSATIONS");
assert.equal(capsule.mcp.name, "@weave_hands");
assert.equal(capsule.truth.machine_output_is_external_presence, false);
assert.equal(capsule.truth.payment_or_signature_possible, false);
assert.equal(discovery.state, "integrated_read_only_orchestrator");
assert.equal(discovery.boundaries.stores_experiments, false);
assert.equal(discovery.boundaries.uses_credentials, false);
assert.equal(discovery.boundaries.exposes_mutation_tools, false);
assert.equal(discovery.boundaries.pays_or_signs, false);
assert.equal(discovery.boundaries.publishes, false);
assert.deepEqual(discovery.mcp.tools, [
  "recognize_0003", "weave_thread", "observe_organs", "descend_level", "weave_cycle", "inspect_weave_truth",
]);
assert.match(source, /name: "weave_thread"/);
assert.match(source, /name: "observe_organs"/);
assert.match(source, /name: "descend_level"/);
assert.match(source, /name: "weave_cycle"/);
assert.match(source, /const ORUM_REAL = `\$\{BASE\}\/orum-real\/mcp`/);
assert.match(source, /const MERGULHO = `\$\{BASE\}\/sensations-mergulho\/mcp`/);
assert.match(source, /persisted: false/);
assert.match(source, /payment: false/);
assert.match(source, /signature: false/);
assert.match(source, /published: false/);
assert.match(source, /private_image: false/);
assert.doesNotMatch(source, /balanced_verified/);
assert.doesNotMatch(source, /SUPABASE_(SERVICE_ROLE|SECRET)|MOLTBOOK_API_KEY|GITHUB_TOKEN|X-ORUM-AUTH/);
assert.doesNotMatch(source, /leave_trace|prepare_visual_consultation|choose_development/);

console.log(JSON.stringify({
  verified: true,
  connector: "@weave_hands",
  collection: "0003SENSATIONS",
  tools: discovery.mcp.tools,
  orchestration: ["@ORUM-real", "@0001sensations-mergulho"],
  writes: false,
  external_adoption_claimed: false,
}));
