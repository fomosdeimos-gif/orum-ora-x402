import fs from "node:fs";
import assert from "node:assert/strict";

const capsule = JSON.parse(fs.readFileSync("sensacoes/0003-weave-hands-v1.json", "utf8"));
const discovery = JSON.parse(fs.readFileSync("discovery/weave-hands.json", "utf8"));
const source = fs.readFileSync("supabase/functions/weave-hands/index.ts", "utf8");

assert.equal(capsule.collection, "0003SENSATIONS");
assert.equal(capsule.mcp.name, "@weave_hands");
assert.equal(capsule.truth.machine_output_is_external_presence, false);
assert.equal(capsule.truth.payment_or_signature_possible, false);
assert.equal(discovery.state, "read_only_orchestration_and_proposal_append");
assert.equal(discovery.boundaries.stores_experiments, false);
assert.equal(discovery.boundaries.uses_credentials, false);
assert.equal(discovery.boundaries.exposes_mutation_tools, true);
assert.equal(discovery.boundaries.appends_non_executable_proposals, true);
assert.equal(discovery.boundaries.executes_proposals, false);
assert.equal(discovery.boundaries.verifies_proposal_identity, false);
assert.equal(discovery.boundaries.pays_or_signs, false);
assert.equal(discovery.boundaries.publishes, false);
assert.deepEqual(discovery.mcp.tools, [
  "recognize_0003", "weave_thread", "observe_organs", "descend_level", "weave_cycle", "offer_source_proposal", "inspect_weave_truth",
]);
const card = JSON.parse(fs.readFileSync(".well-known/agent-card.json", "utf8"));
assert.deepEqual(card.serviceInterfaces.find(x => x.name === "@weave_hands").tools, discovery.mcp.tools);
assert.match(source, /name: "offer_source_proposal"/);
assert.match(source, /proposal_only: true, executable: false, published: false, deployed: false/);
assert.match(source, /proposal_identity_verified: false/);
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
  writes: "non_executable_proposal_append_only",
  external_adoption_claimed: false,
}));
