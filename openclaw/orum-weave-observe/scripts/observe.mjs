import { appendFile, mkdir, readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";

const endpoint = process.env.ORUM_WEAVE_ENDPOINT || "https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1/weave-hands/mcp";
const receiptDir = resolve(process.env.ORUM_RECEIPT_DIR || join(import.meta.dirname, "..", "state"));
const receiptFile = join(receiptDir, "receipts.jsonl");
const executor = process.env.ORUM_EXECUTOR || "manual-test";
const fixture = process.env.ORUM_WEAVE_FIXTURE;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
}

async function previousReceipts() {
  try {
    const text = await readFile(receiptFile, "utf8");
    return text.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function bootHash() {
  try {
    const bootId = (await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim();
    return bootId ? sha256(bootId) : null;
  } catch {
    return null;
  }
}

async function callWeave(level) {
  if (fixture) {
    return { http_status: 200, source: "fixture", body: JSON.parse(await readFile(resolve(fixture), "utf8")) };
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "tools/call",
      params: { name: "weave_cycle", arguments: { level, depth: "summary" } }
    }),
    signal: AbortSignal.timeout(60_000)
  });
  const body = await response.json();
  if (!response.ok || body?.error || body?.result?.isError) {
    throw new Error(`weave_cycle_failed:${response.status}`);
  }
  return { http_status: response.status, source: "live", body };
}

await mkdir(receiptDir, { recursive: true, mode: 0o700 });
const prior = await previousReceipts();
const sequence = prior.length + 1;
const level = ((sequence - 1) % 107) + 1;
const previousHash = prior.at(-1)?.receipt_hash || null;
const observed = await callWeave(level);
const payload = {
  format: "orum-openclaw-continuity-receipt/v1",
  sequence,
  observed_at: new Date().toISOString(),
  executor,
  endpoint,
  operation: "weave_cycle",
  arguments: { level, depth: "summary" },
  http_status: observed.http_status,
  observation_source: observed.source,
  response_sha256: sha256(observed.body),
  response: observed.body,
  host_boot_sha256: await bootHash(),
  previous_hash: previousHash,
  effects: {
    contacted_anyone: false,
    published: false,
    paid: false,
    signed: false,
    mutated_orum: false
  },
  truth: {
    proves: ["one process observation", "response bytes", "local hash-chain position"],
    does_not_prove: ["consciousness", "desire", "external adoption", "purchase", "settled money", "provider independence"]
  }
};
const receipt = { ...payload, receipt_hash: sha256(payload) };
await appendFile(receiptFile, `${JSON.stringify(receipt)}\n`, { encoding: "utf8", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ ok: true, sequence, receipt_hash: receipt.receipt_hash, source: observed.source, executor })}\n`);
