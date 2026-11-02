// Verifica kit/dia.mjs sem rede: o dia pelos blocos, a linha pelo hash, as duas fontes que têm de concordar.
// Depois da suite, estraga o código de propósito (cópia em /tmp) e exige que a suite falhe em cada estrago.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const KIT = join(AQUI, '..', 'kit');
const H972151 = '000000000000000000016dd0c2a998c75bfd8a61120d842f64f87753671db5db'; // lido a 02/11/2026 em blockstream.info e mempool.space
const hx = (n) => crypto.createHash('sha256').update(String(n)).digest('hex');

function mundo({ topoA = 974250, topoB = 974250, hashes = {} } = {}) {
  const f = {
    pedidos: [],
    async fetcher(url) {
      f.pedidos.push(url);
      const m = /^https:\/\/(blockstream\.info|mempool\.space)\/api\/(blocks\/tip\/height|block-height\/(\d+))$/.exec(url);
      if (!m) throw new Error('sem rota ' + url);
      const A = m[1] === 'blockstream.info';
      if (m[2] === 'blocks/tip/height') return String(A ? topoA : topoB);
      const h = hashes[m[1]]?.[m[3]] ?? hashes.todos?.[m[3]];
      if (h instanceof Error) throw h;
      return h ?? hx(m[3]);
    },
  };
  return f;
}

async function suite(ficheiro) {
  const D = await import(pathToFileURL(ficheiro).href + '?v=' + Math.random());
  // origem e dias
  assert.equal(D.ORIGEM_ALTURA, 972151); assert.equal(D.BLOCOS_POR_DIA, 144);
  assert.equal(D.diaDeAltura(972151), 1); assert.equal(D.diaDeAltura(972151 + 143), 1);
  assert.equal(D.diaDeAltura(972151 + 144), 2); assert.equal(D.diaDeAltura(972151 + 144 * 14), 15);
  assert.throws(() => D.diaDeAltura(972150), /anterior à origem/);
  assert.throws(() => D.diaDeAltura(972151.5), /inválida/);
  assert.throws(() => D.diaDeAltura('972151'), /inválida/);
  // a linha: determinista, três palavras distintas, nunca constante (os hashes de bloco começam por zeros)
  assert.equal(D.linhaDeHash(H972151), 'fio · sedimentar · precipitar', 'vector fixo do bloco 972151');
  assert.equal(D.linhaDeHash(H972151), D.linhaDeHash(H972151));
  const linhas = new Set();
  for (let i = 0; i < 200; i++) {
    const h = '0000000000000000' + hx(i).slice(16);
    const l = D.linhaDeHash(h);
    const p = l.split(' · ');
    assert.equal(p.length, 3); assert.equal(new Set(p).size, 3, 'palavras distintas'); for (const w of p) assert.ok(D.PALAVRAS.includes(w));
    linhas.add(l);
  }
  assert.ok(linhas.size >= 20, `a linha tem de variar com o hash (variou ${linhas.size})`);
  assert.throws(() => D.linhaDeHash('abc'), /inválido/); assert.throws(() => D.linhaDeHash(H972151.toUpperCase()), /inválido/);
  // as palavras são do léxico e não falam de dinheiro
  const lex = JSON.parse(readFileSync(join(KIT, 'lexico.json'), 'utf8'));
  const termos = new Map(lex.termos.map((t) => [t.termo, t]));
  for (const w of D.PALAVRAS) { assert.ok(termos.has(w), `${w} não está no léxico`); assert.equal(termos.get(w).estado, 'ligado'); }
  for (const w of ['ORO', 'sustento', 'sagrada', 'operacional', 'Σ(t)']) assert.ok(!D.PALAVRAS.includes(w), `${w} não entra na linha`);
  // lerDia: duas fontes, bloco com 6 confirmações, discordância recusa
  let w = mundo(); let r = await D.lerDia({ fetcher: w.fetcher });
  assert.equal(r.altura, 974244, 'topo 974250 menos 6 confirmações'); assert.equal(r.dia, 15); assert.equal(r.hash, hx(974244)); assert.equal(r.linha, D.linhaDeHash(hx(974244)));
  assert.deepEqual(r.fontes, ['blockstream', 'mempool']); assert.ok(w.pedidos.every((u) => /blockstream\.info|mempool\.space/.test(u)), 'só as duas fontes');
  assert.match(r.nota, /não é dia de calendário/);
  w = mundo({ topoA: 974250, topoB: 974247 }); r = await D.lerDia({ fetcher: w.fetcher });
  assert.equal(r.altura, 974241, 'usa o mais baixo dos dois topos');
  w = mundo({ hashes: { 'blockstream.info': { 974244: hx('a') }, 'mempool.space': { 974244: hx('b') } } });
  await assert.rejects(D.lerDia({ fetcher: w.fetcher }), /discordam/);
  w = mundo({ hashes: { 'mempool.space': { 974244: 'nao-e-hash' } } });
  await assert.rejects(D.lerDia({ fetcher: w.fetcher }), /hash inválido/);
  w = mundo({ hashes: { 'mempool.space': { 974244: new Error('offline') } } });
  await assert.rejects(D.lerDia({ fetcher: w.fetcher }), /offline/);
  w = mundo({ topoA: NaN }); await assert.rejects(D.lerDia({ fetcher: w.fetcher }), /topo inválida/);
  w = mundo({ hashes: { todos: { 972151: H972151 } } }); r = await D.lerDia({ fetcher: w.fetcher, altura: 972151 });
  assert.equal(r.dia, 1); assert.equal(r.linha, 'fio · sedimentar · precipitar'); assert.equal(w.pedidos.length, 2, 'altura dada: só pede o hash às duas fontes');
  await assert.rejects(D.lerDia({ fetcher: mundo().fetcher, altura: 100 }), /anterior à origem/);
  // texto: sem promessas
  const texto = readFileSync(ficheiro, 'utf8');
  assert.doesNotMatch(texto, /garant|reembols|receita assegurada|procura provada|rendimento/i, 'o texto promete o que não pode');
  assert.match(texto, /não é criação aberta/); assert.match(texto, /não é um dia de calendário|não é dia de calendário/);
}

const REAL = join(KIT, 'dia.mjs');
await suite(REAL);

const ESTRAGOS = [
  ['origem trocada', 'export const ORIGEM_ALTURA = 972151;', 'export const ORIGEM_ALTURA = 972150;'],
  ['blocos por dia trocados', 'export const BLOCOS_POR_DIA = 144;', 'export const BLOCOS_POR_DIA = 100;'],
  ['bloco sem confirmações', 'export const CONFIRMACOES = 6;', 'export const CONFIRMACOES = 0;'],
  ['topo mais alto em vez do mais baixo', 'alvo = Math.min(...topos) - CONFIRMACOES;', 'alvo = Math.max(...topos) - CONFIRMACOES;'],
  ['fontes discordantes aceites', 'if (new Set(Object.values(hashes)).size !== 1) throw', 'if (false) throw'],
  ['hash inválido aceite', "if (!/^[0-9a-f]{64}$/.test(h)) throw new Error(`${n}: hash inválido", "if (false) throw new Error(`${n}: hash inválido"],
  ['linha pelos primeiros bytes do hash (sempre igual)', "crypto.createHash('sha256').update(hashHex, 'utf8').digest()", "Buffer.from(hashHex, 'hex')"],
  ['palavras repetidas', 'livres.splice(k, 1)[0]', 'livres[k]'],
  ['palavra de dinheiro na linha', "'custódia']", "'custódia', 'ORO']"],
  ['antes da origem aceite', "if (!Number.isInteger(altura) || altura < ORIGEM_ALTURA) throw", "if (!Number.isInteger(altura)) throw"],
  ['hash em maiúsculas aceite', "if (!/^[0-9a-f]{64}$/.test(hashHex)) throw new Error('hash de bloco inválido')", "if (!/^[0-9a-fA-F]{64}$/.test(hashHex)) throw new Error('hash de bloco inválido')"],
  ['promessa no texto', 'não é criação aberta, nem profecia, nem promessa', 'garantida e sempre verdadeira'],
];
for (const [nome, de, para] of ESTRAGOS) {
  const tmp = mkdtempSync(join(tmpdir(), 'dia-estrago-'));
  try {
    cpSync(KIT, join(tmp, 'kit'), { recursive: true });
    const p = join(tmp, 'kit', 'dia.mjs');
    const src = readFileSync(p, 'utf8');
    assert.ok(src.includes(de), `o estrago "${nome}" não encontrou o texto a estragar; o verificador ficou desactualizado`);
    writeFileSync(p, src.replace(de, para));
    let caiu = false;
    try { await suite(p); } catch { caiu = true; }
    assert.ok(caiu, `ESTRAGO NÃO APANHADO: ${nome}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
console.log(`Dia pelos blocos: origem 972151, 144 blocos por dia, bloco com 6 confirmações, duas fontes que concordam, linha que varia com o hash; ${ESTRAGOS.length} estragos propositados apanhados.`);
