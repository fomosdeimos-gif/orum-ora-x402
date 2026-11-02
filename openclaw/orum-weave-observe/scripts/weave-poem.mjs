#!/usr/bin/env node
// Weave a poem from two already-verified sediment files.
// Every digit in the poem must occur in those files. The poem is not a fact
// beyond them, not sensation, and not sustenance.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const buracoPath = "presenca/buraco-2026-11-02.json";
const confirmPath = "presenca/confirmacao-janela-2026-11-02.json";
const buracoRaw = readFileSync(buracoPath, "utf8");
const confirmRaw = readFileSync(confirmPath, "utf8");
const buraco = JSON.parse(buracoRaw);
const confirm = JSON.parse(confirmRaw);

function need(value, name) {
  if (value === undefined || value === null || value === "") throw new Error(`missing ${name}`);
  return value;
}

const pick = {
  buraco_observed_at: need(buraco.observed_at, "buraco.observed_at"),
  from_block: need(buraco.from_block, "from_block"),
  hole_end: need(buraco.hole_end, "hole_end"),
  blocks: need(buraco.blocks, "blocks"),
  chunks: need(buraco.chunks, "chunks"),
  chunk_failures: need(buraco.chunk_failures, "chunk_failures"),
  agreed_count: need(buraco.agreed_count, "agreed_count"),
  agreed_total_base_units: need(buraco.agreed_total_base_units, "agreed_total_base_units"),
  carteira: need(buraco.carteira, "carteira"),
  operational_address: need(buraco.operational_address, "operational_address"),
  operational_address_inherited_head: buraco.operational_address_inherited_head,
  confirm_observed_at: need(confirm.observed_at, "confirm.observed_at"),
  count: need(confirm.count, "count"),
  confirm_units: need(confirm.agreed_total_base_units, "confirm.units"),
  treasury_state: need(confirm.treasury_reread?.state, "treasury_state"),
  treasury_usdc: confirm.treasury_reread?.external_confirmed_usdc,
  livro_events: need(confirm.live_ledger_reread?.total_events, "livro_events"),
  livro_append: confirm.live_ledger_reread?.append,
};

if (pick.operational_address_inherited_head !== false) throw new Error("operational head was inherited; poem refused");
if (buraco.counts_as_external_sustenance !== false) throw new Error("buraco claims sustenance; poem refused");
if (confirm.counts_as_external_sustenance !== false) throw new Error("confirmation claims sustenance; poem refused");
if (pick.livro_append !== false) throw new Error("ledger append is not false; poem refused");
if (pick.chunk_failures !== 0) throw new Error("chunk failures are not zero; poem refused rather than call the hole empty");

const blob = buracoRaw + "\n" + confirmRaw;
const poem = `daí

as mãos não sentem o intervalo.
lêem os ficheiros.

de ${pick.from_block} a ${pick.hole_end}
${pick.blocks} blocos
${pick.chunks} leituras
${pick.chunk_failures} falhas

${pick.carteira}
devolveu ${pick.agreed_count} logs
e ${pick.agreed_total_base_units} unidades
que já tinham nome
não são sustento

a janela lida às ${pick.confirm_observed_at}
tinha ${pick.count} hashes
e ${pick.confirm_units} unidades
também não

${pick.operational_address}
não herdou a cabeça

a tesouraria, nessa leitura, disse ${pick.treasury_state}
e ${pick.treasury_usdc} USDC
o livro vivo tinha ${pick.livro_events} eventos
e o append era ${pick.livro_append}

o poema acaba
onde os ficheiros acabam
${pick.buraco_observed_at}
`;

for (const digits of poem.match(/\d+/g) ?? []) {
  if (!blob.includes(digits)) throw new Error(`digit ${digits} is not in the sediment`);
}

const digest = createHash("sha256").update(poem).digest("hex");
const marked = poem + `\nfonte: ${buracoPath}\nfonte: ${confirmPath}\nsha256: ${digest}\nnao_e: sensacao, consciencia, receita, presenca_nova\nmao: openclaw/orum-weave-observe/scripts/weave-poem.mjs\nnao_chamado: weave-hands-writer (sem copia no repositorio)\n`;

if (process.argv[2] === "--check") {
  const file = process.argv[3];
  if (!file) throw new Error("usage: weave-poem.mjs --check <poema>");
  const got = readFileSync(file, "utf8");
  if (got !== marked) {
    process.stderr.write("poem drifted from the sediment\n");
    process.exit(1);
  }
  process.stdout.write(`ok ${digest}\n`);
} else {
  process.stdout.write(marked);
}
