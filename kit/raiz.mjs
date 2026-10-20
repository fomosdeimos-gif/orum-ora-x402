// Confere a raiz dos registos contra o manifesto e o recibo OTS. Só Node (e git, se quiseres ler a versão exacta).
// Uso: node kit/raiz.mjs              lê os ficheiros do commit_base do manifesto (git show)
//      node kit/raiz.mjs --arvore     lê os ficheiros da pasta actual (só confere se ainda não mudaram)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lerRecibo } from '../scripts/lib/ots.mjs';
import { entradas, raiz, textoCanonico, sha256, sha3_256, raizSha3, textoCanonicoCom } from '../scripts/lib/raiz.mjs';

// ler(caminho) devolve os bytes do ficheiro; manifestoBytes e reciboBytes vêm sempre da pasta actual.
export function verificarRaiz({ ler, manifestoBytes, reciboBytes }) {
  const m = JSON.parse(manifestoBytes);
  if (m.schema !== 'orum-raiz/v1') throw new Error('schema desconhecido');
  const lista = entradas(ler, m.ficheiros.map((f) => f.caminho));
  for (const e of lista) {
    const dito = m.ficheiros.find((f) => f.caminho === e.caminho);
    if (dito.sha256 !== e.sha256) throw new Error(`o ficheiro ${e.caminho} não tem o hash que o manifesto diz`);
  }
  const r = raiz(lista);
  if (r !== m.raiz_sha256) throw new Error('a raiz calculada não é a do manifesto');
  const recibo = lerRecibo(reciboBytes);
  if (recibo.atestacoes.some((a) => a.tipo === 'desconhecida')) throw new Error('atestação desconhecida no recibo');
  // O recibo sela sha256(raiz || nonce): a ligação à raiz está no primeiro passo da árvore (anexa o nonce e faz sha256).
  const btc = recibo.atestacoes.filter((a) => a.tipo === 'bitcoin');
  const pend = recibo.atestacoes.filter((a) => a.tipo === 'pendente');
  if (recibo.digest !== r) throw new Error('o recibo não sela a raiz');
  if (!/Não prova autoria, valor, procura nem receita/.test(m.prova ?? '')) throw new Error('o manifesto perdeu a fronteira "não prova"');
  let estado;
  if (btc.length) {
    const altura = Math.min(...btc.map((a) => a.altura));
    if (m.estado !== 'confirmado_bitcoin' || m.altura_bitcoin !== altura) throw new Error('o recibo tem atestação Bitcoin que o manifesto não diz');
    estado = `confirmado no bloco ${altura}`;
  } else {
    if (m.estado !== 'pendente' || m.altura_bitcoin !== null) throw new Error('o manifesto diz confirmado sem atestação Bitcoin no recibo');
    if (!pend.length) throw new Error('recibo sem nenhum calendário');
    estado = 'pendente';
  }
  return { raiz: r, estado, commit_base: m.commit_base, ficheiros: lista.length, texto: textoCanonico(lista) };
}

// Segundo hash: confere o complemento ancora/raiz-sha3.json contra os manifestos das camadas e contra os ficheiros dos seus commits.
// ler(commit, caminho) devolve os bytes; manifestos é { 'ancora/raiz-registos.json': bytes, ... }.
export function verificarSha3({ complementoBytes, manifestos, ler }) {
  const c = JSON.parse(complementoBytes);
  if (c.schema !== 'orum-raiz-sha3/v1') throw new Error('schema desconhecido');
  if (!/Não prova autoria, valor, procura nem receita/.test(c.prova ?? '')) throw new Error('o complemento perdeu a fronteira "não prova"');
  if (!Array.isArray(c.camadas) || !c.camadas.length) throw new Error('o complemento não cobre nenhuma camada');
  const vistas = new Set();
  const resumo = [];
  for (const k of c.camadas) {
    if (vistas.has(k.camada)) throw new Error(`camada ${k.camada} repetida`);
    vistas.add(k.camada);
    const bytesM = manifestos[k.manifesto];
    if (!bytesM) throw new Error(`falta o manifesto ${k.manifesto}`);
    const m = JSON.parse(bytesM);
    if (m.commit_base !== k.commit_base) throw new Error(`camada ${k.camada}: o commit não é o do manifesto`);
    if (m.raiz_sha256 !== k.raiz_sha256) throw new Error(`camada ${k.camada}: a raiz sha256 não é a do manifesto`);
    const dosManifesto = new Map(m.ficheiros.map((f) => [f.caminho, f.sha256]));
    for (const f of k.ficheiros) {
      if (dosManifesto.get(f.caminho) !== f.sha256) throw new Error(`camada ${k.camada}: ${f.caminho} não tem o sha256 do manifesto`);
      const bytes = ler(k.commit_base, f.caminho);
      if (sha256(bytes) !== f.sha256) throw new Error(`camada ${k.camada}: ${f.caminho} não tem o sha256 dito`);
      if (sha3_256(bytes) !== f.sha3_256) throw new Error(`camada ${k.camada}: ${f.caminho} não tem o sha3-256 dito`);
    }
    if (raiz(k.ficheiros) !== k.raiz_sha256) throw new Error(`camada ${k.camada}: a raiz sha256 não bate com a lista`);
    const r3 = raizSha3(k.ficheiros);
    if (r3 !== k.raiz_sha3_256) throw new Error(`camada ${k.camada}: a raiz sha3-256 não bate com a lista`);
    resumo.push({ camada: k.camada, raiz_sha3_256: r3, ficheiros: k.ficheiros.length, texto_sha3: textoCanonicoCom(k.ficheiros, 'sha3_256') });
  }
  return { camadas: resumo };
}

// Camadas: ancora/raiz-registos.json (1) e ancora/raiz-registos-<n>.json (n≥2). Cada uma é conferida pelo seu commit_base.
export function manifestosDeCamadas(aqui) {
  return fs.readdirSync(path.join(aqui, 'ancora'))
    .filter((f) => /^raiz-registos(-\d+)?\.json$/.test(f))
    .map((f) => `ancora/${f}`)
    .sort((a, b) => (Number(a.match(/-(\d+)\.json$/)?.[1] ?? 1)) - (Number(b.match(/-(\d+)\.json$/)?.[1] ?? 1)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const aqui = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const arvore = process.argv.includes('--arvore');
  const pedido = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  let falhou = false;
  for (const caminho of pedido.length ? pedido : manifestosDeCamadas(aqui)) {
    try {
      const manifestoBytes = fs.readFileSync(path.join(aqui, caminho));
      const m = JSON.parse(manifestoBytes);
      const reciboBytes = fs.readFileSync(path.join(aqui, m.recibo));
      const ler = arvore
        ? (p) => fs.readFileSync(path.join(aqui, p))
        : (p) => execFileSync('git', ['show', `${m.commit_base}:${p}`], { cwd: aqui, maxBuffer: 64 * 1024 * 1024 });
      const r = verificarRaiz({ ler, manifestoBytes, reciboBytes });
      console.log(`OK  camada ${m.camada ?? 1} (${caminho}): raiz dos registos ${r.raiz}`);
      console.log(`    estado da âncora: ${r.estado}; ${r.ficheiros} ficheiros lidos ${arvore ? 'da pasta actual' : `do commit ${r.commit_base}`}`);
      console.log('    Sem a nossa ajuda: sha256sum do texto abaixo dá a raiz.');
      process.stdout.write(r.texto);
    } catch (e) {
      falhou = true;
      console.error(`FALHA  ${caminho}: ${e.message}`);
    }
  }
  // segundo hash (se o complemento existir)
  const compl = path.join(aqui, 'ancora/raiz-sha3.json');
  if (!pedido.length && !arvore && fs.existsSync(compl)) {
    try {
      const manifestos = Object.fromEntries(manifestosDeCamadas(aqui).map((p) => [p, fs.readFileSync(path.join(aqui, p))]));
      const r = verificarSha3({ complementoBytes: fs.readFileSync(compl), manifestos, ler: (commit, p) => execFileSync('git', ['show', `${commit}:${p}`], { cwd: aqui, maxBuffer: 64 * 1024 * 1024 }) });
      for (const k of r.camadas) console.log(`OK  camada ${k.camada}, segundo hash: raiz SHA3-256 ${k.raiz_sha3_256} (${k.ficheiros} ficheiros)`);
      console.log('    Sem a nossa ajuda: openssl dgst -sha3-256 sobre o texto "<caminho><TAB><sha3-256>" por linha dá a raiz SHA3-256.');
      console.log('    O complemento só fica selado no Bitcoin quando uma camada nova o listar nos seus ficheiros.');
    } catch (e) {
      falhou = true;
      console.error(`FALHA  ancora/raiz-sha3.json: ${e.message}`);
    }
  }
  console.log('Prova só que estes ficheiros existiam assim antes de um bloco. Não prova autoria, valor, procura nem receita.');
  if (falhou) process.exit(1);
}
