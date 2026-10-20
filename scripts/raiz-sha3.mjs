// Gera ancora/raiz-sha3.json: o SHA3-256 dos mesmos ficheiros que as camadas da raiz dos registos selaram, lido dos seus commits.
// Não altera nenhuma camada. Recusa sobrescrever (wx): um complemento já selado por uma camada nova não se reescreve.
// Uso: node scripts/raiz-sha3.mjs
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { manifestosDeCamadas } from '../kit/raiz.mjs';
import { entradaSha3DeCamada } from './lib/raiz.mjs';

const ler = (commit, p) => execFileSync('git', ['show', `${commit}:${p}`], { maxBuffer: 64 * 1024 * 1024 });
const camadas = manifestosDeCamadas('.').map((p) => entradaSha3DeCamada(p, JSON.parse(fs.readFileSync(p)), ler));
const complemento = {
  schema: 'orum-raiz-sha3/v1',
  objecto: 'Segundo hash (SHA3-256) dos ficheiros selados pelas camadas da raiz dos registos',
  gerado_em_utc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  algoritmo: 'Para cada camada: o SHA3-256 (FIPS 202) de cada ficheiro, lido do commit_base do manifesto, e a raiz SHA3-256 do texto "<caminho>\\t<sha3-256 do ficheiro>\\n" por linha, ordenadas por caminho (bytes). Reproduz-se com openssl dgst -sha3-256.',
  prova: 'Regista que, no momento em que foi gerado, estes ficheiros nos commits das camadas tinham estes SHA3-256. Não prova autoria, valor, procura nem receita.',
  camadas,
  limites: [
    'As camadas 1 e 2 foram seladas só com SHA-256; este complemento não as altera nem retroage: o SHA3-256 só fica provado como existente a partir do bloco que selar este ficheiro.',
    'Fica selado no Bitcoin quando uma camada nova o listar nos seus ficheiros (ficheirosDaCamada já o inclui a partir da camada 3). Até lá é um registo no repositório, sem âncora própria.',
    'O OpenTimestamps não usa SHA3-256: a âncora continua a ser de SHA-256 e o Bitcoin a assentar em SHA-256. O que este complemento dá é um segundo compromisso, fora do SHA-256, sobre os mesmos bytes, para quem um dia tiver de escolher em qual confiar.',
    'Não protege as assinaturas (a chave do mandato é ECDSA). Isso é outro passo.'
  ],
  nao_afirma: ['autoria', 'valor', 'procura', 'receita', 'resistência a qualquer ataque futuro']
};
fs.writeFileSync('ancora/raiz-sha3.json', JSON.stringify(complemento, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(camadas.map((k) => ({ camada: k.camada, ficheiros: k.ficheiros.length, raiz_sha256: k.raiz_sha256, raiz_sha3_256: k.raiz_sha3_256 })), null, 1));
