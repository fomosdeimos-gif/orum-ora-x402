// Verifica docs/consulta-de-maquinas-v1.md: corre os passos do documento a sério (A, B, C) sobre o pacote real,
// confere que cada ficheiro e comando citado existe, que a camada citada diz o que o documento diz e que as fronteiras estão escritas.
// Depois estraga o documento e o pacote de propósito e exige que a suite falhe em cada estrago. Sem rede.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = join(RAIZ, 'docs', 'consulta-de-maquinas-v1.md');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

function receitaC(docPath) {
  const t = readFileSync(docPath, 'utf8');
  const sec = t.split(/^## 4\./m)[1] ?? '';
  const m = /```\n([\s\S]*?)```/.exec(sec);
  assert.ok(m, 'o passo C não traz a receita num bloco de código');
  return m[1];
}

function passos(raiz, docPath = DOC) {
  const man = join(raiz, 'espelho-maquinas', 'manifesto.json');
  const tar = join(raiz, 'espelho-maquinas', 'orum-maquinas-v1.tar');
  const M = JSON.parse(readFileSync(man, 'utf8'));
  const r = {};
  // Passo A: sha256sum do tar
  r.A = execFileSync('sha256sum', [tar]).toString().split(' ')[0];
  assert.equal(r.A, M.tar.sha256, 'passo A: o tar não é o do manifesto');
  // Passo B: o verificador autónomo
  const b = execFileSync('node', [join(raiz, 'kit', 'espelho-maquinas.mjs'), man, tar], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  assert.match(b, /^OK espelho de máquinas: \d+ ficheiros conferidos; raiz [0-9a-f]{64}/, 'passo B: saída inesperada');
  assert.ok(b.includes(M.raiz_sha256), 'passo B: raiz diferente da do manifesto');
  // Passo C: a receita do documento, literalmente, com tar, find, sort e sha256sum
  const tmp = mkdtempSync(join(tmpdir(), 'consulta-'));
  try {
    cpSync(tar, join(tmp, 'orum-maquinas-v1.tar'));
    mkdirSync(join(tmp, 'pasta'));
    const script = `set -e\ncd "$1"\n${receitaC(docPath)}`;
    r.C = execFileSync('bash', ['-c', script, 'x', tmp], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim().split('\n').pop().split(' ')[0];
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  assert.equal(r.C, M.raiz_sha256, 'passo C: a receita sem o nosso código dá outra raiz');
  return r;
}

function suite(docPath, raiz = RAIZ) {
  const t = readFileSync(docPath, 'utf8');
  // 1. os passos correm e dão o que o documento diz (o passo C corre a receita que está no documento)
  passos(raiz, docPath);
  // 2. todo o caminho do repositório citado em código existe
  const citados = [...t.matchAll(/`((?:kit|ancora|espelho-maquinas|scripts|docs)\/[A-Za-z0-9._\/-]+)`/g)].map((m) => m[1]).filter((p) => !p.includes('<'));
  assert.ok(citados.length >= 5, `o documento cita poucos ficheiros (${citados.length})`);
  for (const p of citados) assert.ok(existsSync(join(raiz, p)), `o documento cita um ficheiro que não existe: ${p}`);
  // 3. todo o comando node citado aponta para um ficheiro que existe
  const cmds = [...t.matchAll(/node (kit\/[A-Za-z0-9._-]+\.mjs)/g)].map((m) => m[1]);
  for (const c of ['kit/espelho-maquinas.mjs', 'kit/blocos.mjs', 'kit/raiz.mjs', 'kit/verificar.mjs']) assert.ok(cmds.includes(c), `falta o comando ${c}`);
  for (const c of cmds) assert.ok(existsSync(join(raiz, c)), `comando para ficheiro inexistente: ${c}`);
  // 4. a camada citada lista o manifesto atual e o estado que o documento diz
  const m = /raiz-registos-(\d+)\.json`/.exec(t.replace(/<n>/g, ''));
  assert.ok(m, 'o documento não diz que camada lista o manifesto');
  const camada = JSON.parse(readFileSync(join(raiz, 'ancora', `raiz-registos-${m[1]}.json`), 'utf8'));
  const linha = camada.ficheiros.find((f) => f.caminho === 'espelho-maquinas/manifesto.json');
  assert.ok(linha, 'a camada citada não lista o manifesto');
  assert.equal(linha.sha256, sha(readFileSync(join(raiz, 'espelho-maquinas', 'manifesto.json'))), 'a camada citada sela outro manifesto');
  assert.ok(['confirmado_bitcoin', 'pendente'].includes(camada.estado), 'estado de camada desconhecido');
  // 5. as fronteiras estão escritas
  for (const f of [/Não pode concluir/, /Que o conteúdo seja verdadeiro/, /Autoria, valor, procura ou receita/, /\*\*pendente\*\*|\*\*`pendente`\*\*/, /Não se afirma âncora/, /duas fontes independentes/, /não verificado/i, /Se o passo B e o passo C discordarem/, /Não pede nem aceita pagamento/, /Não promete receita, reembolso nem procura/, /Se uma dependência falhar/]) {
    assert.match(t, f, `falta no documento: ${f}`);
  }
  // 6. o documento não promete
  assert.doesNotMatch(t, /garant|receita assegurada|procura provada|rendimento (certo|garantido)|vai durar|sempre verdadeir/i, 'o documento promete o que não pode');
  assert.doesNotMatch(t, /(0x[0-9a-fA-F]{40}|bc1[a-z0-9]{20,})/, 'o documento não deve trazer endereços de carteira');
}

suite(DOC);

// Estragos no pacote: o passo A, B e C têm de falhar se um byte mudar.
const tmpP = mkdtempSync(join(tmpdir(), 'consulta-pacote-'));
try {
  cpSync(join(RAIZ, 'espelho-maquinas'), join(tmpP, 'espelho-maquinas'), { recursive: true });
  cpSync(join(RAIZ, 'kit'), join(tmpP, 'kit'), { recursive: true });
  cpSync(join(RAIZ, 'scripts', 'lib'), join(tmpP, 'scripts', 'lib'), { recursive: true });
  passos(tmpP);
  const tarP = join(tmpP, 'espelho-maquinas', 'orum-maquinas-v1.tar');
  const orig = readFileSync(tarP);
  const mexido = Buffer.from(orig); mexido[2000] ^= 1;
  writeFileSync(tarP, mexido);
  assert.throws(() => passos(tmpP), 'ESTRAGO NÃO APANHADO: um byte do tar alterado');
  writeFileSync(tarP, orig);
  const manP = join(tmpP, 'espelho-maquinas', 'manifesto.json');
  const mj = JSON.parse(readFileSync(manP, 'utf8'));
  mj.raiz_sha256 = '0'.repeat(64);
  writeFileSync(manP, JSON.stringify(mj, null, 2));
  assert.throws(() => passos(tmpP), 'ESTRAGO NÃO APANHADO: raiz do manifesto trocada');
} finally { rmSync(tmpP, { recursive: true, force: true }); }

// Estragos no documento.
const ESTRAGOS = [
  ['regra do pendente retirada', 'Não se afirma âncora.', 'Afirma-se âncora.'],
  ['"duas fontes independentes" retirado', 'duas fontes independentes', 'uma fonte'],
  ['fronteira "não pode concluir" retirada', 'Não pode concluir', 'Pode concluir'],
  ['"conteúdo verdadeiro" passa a conclusão', 'Que o conteúdo seja verdadeiro.', 'Que o conteúdo é verdadeiro.|'],
  ['comando para ficheiro inexistente', 'node kit/blocos.mjs', 'node kit/blocos-inexistente.mjs'],
  ['ficheiro citado inexistente', '`espelho-maquinas/manifesto.json`\n- `kit/espelho-maquinas.mjs`', '`espelho-maquinas/manifesto.json`\n- `kit/fantasma.mjs`'],
  ['camada que não lista o manifesto', 'ancora/raiz-registos-24.json', 'ancora/raiz-registos-1.json'],
  ['receita do passo C sem ordenar', "LC_ALL=C sort |", '|'],
  ['promessa no texto', 'Não promete receita, reembolso nem procura.', 'Receita garantida e procura provada.'],
  ['endereço de carteira no texto', 'Não faz do ORO um activo nem lastro.', 'Paga para 0x89460d9e0590559e63860197dfe2ac648A753584.'],
  ['desacordo B/C sem regra', 'Se o passo B e o passo C discordarem, não se conclui nada e diz-se `não verificado`.', 'Se discordarem, escolhe-se o B.'],
  ['dependências sem tabela de falha', '## 7. Se uma dependência falhar', '## 7. Dependências'],
];
for (const [nome, de, para] of ESTRAGOS) {
  const tmp = mkdtempSync(join(tmpdir(), 'consulta-estrago-'));
  try {
    const src = readFileSync(DOC, 'utf8');
    assert.ok(src.includes(de), `o estrago "${nome}" não encontrou o texto a estragar; o verificador ficou desactualizado`);
    const p = join(tmp, 'doc.md');
    writeFileSync(p, src.replace(de, para));
    let caiu = false;
    try { suite(p); } catch { caiu = true; }
    assert.ok(caiu, `ESTRAGO NÃO APANHADO: ${nome}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
console.log(`Consulta de máquinas: passos A, B e C corridos sobre o pacote real, ficheiros e comandos citados existem, camada citada confere; 2 estragos no pacote e ${ESTRAGOS.length} no documento apanhados.`);
