// Confere as atestações pós-quânticas (SLH-DSA-SHAKE-128s, FIPS 205) e a integridade da cópia da biblioteca. Só Node, sem rede, sem pacotes.
// Uso: node kit/pq.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const aqui = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

// Primeiro a integridade da biblioteca copiada, ANTES de a importar: se foi alterada, não a deixamos correr.
export function conferirCopia(lerFicheiro, vendor) {
  for (const f of vendor.ficheiros) {
    if (sha(lerFicheiro(f.caminho)) !== f.sha256) throw new Error(`a cópia da biblioteca foi alterada: ${f.caminho}`);
  }
  return vendor.ficheiros.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let falhou = false;
  try {
    const vendor = JSON.parse(fs.readFileSync(path.join(aqui, 'kit/pq/VENDOR.json')));
    console.log(`OK  biblioteca SLH-DSA: ${conferirCopia((c) => fs.readFileSync(path.join(aqui, c)), vendor)} ficheiros iguais aos registados (@noble/post-quantum ${vendor.pacotes[0].versao})`);
    const { verificar } = await import('../scripts/lib/pq.mjs');
    const ler = (commit, p) => execFileSync('git', ['show', `${commit}:${p}`], { cwd: aqui, maxBuffer: 64 * 1024 * 1024 });
    const reg = fs.existsSync(path.join(aqui, 'ancora/chave-pq.json')) ? JSON.parse(fs.readFileSync(path.join(aqui, 'ancora/chave-pq.json'))) : null;
    for (const f of ['kit/pq/exemplo-teste.json', 'ancora/atestacao-pq.json']) {
      if (!fs.existsSync(path.join(aqui, f))) { console.log(`--  ${f}: não existe${f.startsWith('ancora') ? ' (ainda não há atestação de produção)' : ''}`); continue; }
      try {
        const r = verificar({ atestacaoBytes: fs.readFileSync(path.join(aqui, f)), ler, registo: reg });
        console.log(`OK  ${f}: assinatura válida (${r.tipo}), ${r.ficheiros} ficheiros do commit ${r.commit_base.slice(0, 7)}; ${r.autoridade ? 'chave activa no registo' : 'SEM autoridade: é um teste'}`);
      } catch (e) { falhou = true; console.error(`FALHA  ${f}: ${e.message}`); }
    }
  } catch (e) { falhou = true; console.error(`FALHA  ${e.message}`); }
  console.log('Uma assinatura prova que quem tem a chave viu estes bytes. Não prova autoria, valor, procura nem receita.');
  if (falhou) process.exit(1);
}
