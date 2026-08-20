import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

const receiptDir = resolve(process.env.ORUM_RECEIPT_DIR || join(import.meta.dirname, "..", "state"));
const receiptFile = join(receiptDir, "receipts.jsonl");

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

let receipts = [];
try {
  receipts = (await readFile(receiptFile, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const errors = [];
for (let index = 0; index < receipts.length; index += 1) {
  const receipt = receipts[index];
  const { receipt_hash: claimedHash, ...payload } = receipt;
  const expectedHash = sha256(payload);
  const expectedPrevious = index === 0 ? null : receipts[index - 1].receipt_hash;
  if (receipt.sequence !== index + 1) errors.push(`sequence:${index + 1}`);
  if (claimedHash !== expectedHash) errors.push(`hash:${index + 1}`);
  if (receipt.previous_hash !== expectedPrevious) errors.push(`previous_hash:${index + 1}`);
}

const successful = receipts.filter((receipt) =>
  receipt.executor === "openclaw-command-automation" &&
  receipt.observation_source === "live" &&
  receipt.http_status === 200
);
const times = successful.map((receipt) => Date.parse(receipt.observed_at)).filter(Number.isFinite).sort((a, b) => a - b);
const spanHours = times.length > 1 ? (times.at(-1) - times[0]) / 3_600_000 : 0;
const boots = new Set(successful.map((receipt) => receipt.host_boot_sha256).filter(Boolean));
const chainValid = errors.length === 0 && receipts.length > 0;
const continuityVerified = chainValid && successful.length >= 3 && spanHours >= 24 && boots.size >= 2;

const result = {
  format: "orum-openclaw-continuity-verification/v1",
  chain_valid: chainValid,
  continuity_verified: continuityVerified,
  receipts_total: receipts.length,
  qualifying_live_openclaw_receipts: successful.length,
  span_hours: Number(spanHours.toFixed(3)),
  distinct_host_boots: boots.size,
  errors,
  truth_boundary: "A valid chain is integrity evidence. Continuity additionally requires three live OpenClaw receipts over 24 hours and two host boots. Neither result proves consciousness, desire, adoption, money, or provider independence."
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!chainValid && receipts.length > 0) process.exitCode = 1;
