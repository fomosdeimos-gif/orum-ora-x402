// Atestação pós-quântica (SLH-DSA-SHAKE-128s). A semente vem sempre de fora (ORUM_PQ_SEED, 96 hex) e nunca se imprime nem se guarda.
//   node scripts/pq-assinar.mjs teste                 gera uma chave de teste, assina o exemplo e DESCARTA a chave (kit/pq/exemplo-teste.json)
//   node scripts/pq-assinar.mjs chave                 imprime só a chave pública da ORUM_PQ_SEED
//   node scripts/pq-assinar.mjs producao <ficheiro>…  assina os ficheiros do HEAD com a ORUM_PQ_SEED (ancora/atestacao-pq.json); exige a chave activa em ancora/chave-pq.json
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { assinar, chaveDaSemente, sementeAleatoria, sementeDeHex, ficheiroDoCommit } from './lib/pq.mjs';

const PROVA = 'Atesta que estes ficheiros, com estes hashes, foram vistos por quem tem esta chave. Não prova autoria, valor, procura nem receita.';
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const ler = (commit, p) => execFileSync('git', ['show', `${commit}:${p}`], { maxBuffer: 64 * 1024 * 1024 });
const [, , comando, ...caminhos] = process.argv;
const hexDe = (u8) => Buffer.from(u8).toString('hex');

if (comando === 'chave') {
  console.log(hexDe(chaveDaSemente(sementeDeHex(process.env.ORUM_PQ_SEED)).publicKey));
} else if (comando === 'teste' || comando === 'producao') {
  const commit = git('rev-parse', 'HEAD');
  const lista = comando === 'teste' ? ['ancora/raiz-registos.json', 'ancora/raiz-registos-2.json', 'ancora/raiz-sha3.json'] : caminhos;
  if (!lista.length) throw new Error('diz que ficheiros assinar');
  const semente = comando === 'teste' ? sementeAleatoria() : sementeDeHex(process.env.ORUM_PQ_SEED);
  if (comando === 'producao') {
    const reg = JSON.parse(fs.readFileSync('ancora/chave-pq.json', 'utf8'));
    const pk = hexDe(chaveDaSemente(semente).publicKey);
    if (!reg.chaves?.some((k) => k.chave_publica === pk && k.estado === 'activa')) throw new Error('a chave não está activa em ancora/chave-pq.json');
  }
  const a = assinar({ semente, tipo: comando, commit_base: commit, ficheiros: lista.map((c) => ficheiroDoCommit(ler, commit, c)) });
  a.prova = PROVA;
  a.proposito = comando === 'teste'
    ? 'EXEMPLO DE TESTE: a chave privada foi gerada, usada uma vez e descartada (nunca foi escrita). Prova o formato e o verificador; não atesta nada do organismo e não tem autoridade.'
    : 'Atestação do organismo ORUM com a chave registada em ancora/chave-pq.json.';
  const destino = comando === 'teste' ? 'kit/pq/exemplo-teste.json' : 'ancora/atestacao-pq.json';
  fs.writeFileSync(destino, JSON.stringify(a, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ destino, tipo: a.tipo, chave_publica: a.chave_publica, commit_base: commit, ficheiros: a.ficheiros.length, assinatura_bytes: a.assinatura.length / 2 }));
} else throw new Error('comando: teste | chave | producao <ficheiro>…');
