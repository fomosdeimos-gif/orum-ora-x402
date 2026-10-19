// Gera a âncora da raiz dos registos em duas passagens (o sandbox da ORA não alcança os calendários):
//   node scripts/raiz-ots.mjs preparar <estado.json>        calcula a raiz e o compromisso sha256(raiz||nonce) a enviar
//   node scripts/raiz-ots.mjs montar <estado.json> a.b64 b.b64 c.b64   monta o recibo com as respostas dos três calendários
import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { lerRecibo } from './lib/ots.mjs';
import { entradas, raiz } from './lib/raiz.mjs';

const MAGIC = Buffer.from('004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294', 'hex');
const CALENDARIOS = ['alice.btc.calendar.opentimestamps.org', 'bob.btc.calendar.opentimestamps.org', 'finney.calendar.eternitywall.com'];
const [, , comando, estadoPath, ...respostas] = process.argv;
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();

if (comando === 'preparar') {
  if (git('status', '--porcelain')) throw new Error('a árvore tem alterações: a raiz tem de ser de um commit limpo');
  const commit = git('rev-parse', 'HEAD');
  const lista = entradas((p) => fs.readFileSync(p));
  const r = raiz(lista);
  const nonce = crypto.randomBytes(16);
  const msg = crypto.createHash('sha256').update(Buffer.concat([Buffer.from(r, 'hex'), nonce])).digest('hex');
  fs.writeFileSync(estadoPath, JSON.stringify({ commit_base: commit, ficheiros: lista, raiz_sha256: r, nonce: nonce.toString('hex'), compromisso: msg }));
  console.log(JSON.stringify({ commit_base: commit, raiz_sha256: r, compromisso: msg, calendarios: CALENDARIOS }, null, 1));
} else if (comando === 'montar') {
  const e = JSON.parse(fs.readFileSync(estadoPath, 'utf8'));
  if (respostas.length !== 3) throw new Error('três respostas, pela ordem alice, bob, finney');
  const subs = respostas.map((f) => Buffer.from(fs.readFileSync(f, 'utf8').replace(/\s+/g, ''), 'base64'));
  const nonce = Buffer.from(e.nonce, 'hex');
  const corpo = Buffer.concat([Buffer.from([0xf0, nonce.length]), nonce, Buffer.from([0x08]), Buffer.from([0xff]), subs[0], Buffer.from([0xff]), subs[1], subs[2]]);
  const recibo = Buffer.concat([MAGIC, Buffer.from([0x01, 0x08]), Buffer.from(e.raiz_sha256, 'hex'), corpo]);
  const lido = lerRecibo(recibo);
  if (lido.digest !== e.raiz_sha256) throw new Error('o recibo não sela a raiz');
  if (lido.atestacoes.length !== 3 || lido.atestacoes.some((a) => a.tipo !== 'pendente' && a.tipo !== 'bitcoin')) throw new Error('esperavam-se três atestações');
  const compromissos = lido.atestacoes.filter((a) => a.tipo === 'pendente').map((a) => a.compromisso);
  fs.writeFileSync('ancora/raiz-registos.ots', recibo);
  const manifesto = {
    schema: 'orum-raiz/v1',
    objecto: 'Raiz dos registos do organismo ORUM',
    algoritmo: 'raiz = sha256 do texto "<caminho>\\t<sha256 do ficheiro>\\n" por linha, linhas ordenadas por caminho (bytes), sem linha final em branco. Reproduz-se com sha256sum sobre esse texto.',
    commit_base: e.commit_base,
    ficheiros: e.ficheiros,
    raiz_sha256: e.raiz_sha256,
    recibo: 'ancora/raiz-registos.ots',
    selado_em_utc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    calendarios_pedidos: CALENDARIOS,
    estado: 'pendente',
    altura_bitcoin: null,
    prova: 'Prova que estes ficheiros, com estes hashes, existiam antes de um bloco do Bitcoin. Não prova autoria, valor, procura nem receita, e não faz do ORO um activo.',
    nao_incluido: [
      'o livro do organismo (ora_mudancas): vive na base de dados e não se confere só com o repositório',
      'HANDOFF.md: muda a cada passagem; fica fora para a raiz ser estável'
    ],
    nao_verificado: [
      'se o compromisso já entrou num bloco (estado pendente até o recibo ser actualizado)',
      'a raiz do bloco contra o cabeçalho real (o verificador não fala com a rede)'
    ]
  };
  fs.writeFileSync('ancora/raiz-registos.json', JSON.stringify(manifesto, null, 2) + '\n');
  console.log(`recibo de ${recibo.length} bytes; compromissos pendentes: ${compromissos.length}`);
} else throw new Error('comando: preparar | montar');
