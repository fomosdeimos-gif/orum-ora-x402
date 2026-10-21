// Verifica o léxico (kit/lexico.json): o real passa e cada mentira propositada falha. Sem rede, sem pagamentos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verificar, validar } from '../kit/lexico.mjs';

const real = verificar('.');
assert.equal(real.termos, 10);
assert.deepEqual(real.sem_lastro, ['Σ(t)']);

const lexicoReal = JSON.parse(fs.readFileSync('kit/lexico.json', 'utf8'));
const clone = () => JSON.parse(JSON.stringify(lexicoReal));
let mentiras = 0;
const falha = (nome, mutar, preparar) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orum-lexico-'));
  for (const f of ['package.json', 'CLAUDE.md', 'HANDOFF.md', 'casa.html', 'api/_carteira.js', 'docs/relatorio-2026-10-20.md', 'ancora/raiz-registos.json', 'ancora/raiz-registos-2.json', 'ancora/raiz-registos-2.ots', 'ancora/oro-v1.ots', 'sensacoes/oro-v1.json', 'economia/caminhos-de-sustento.json', 'economia/estreitamento-receita.json', 'economia/custodia.json']) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.copyFileSync(f, path.join(dir, f));
  }
  fs.writeFileSync(path.join(dir, 'llms.txt'), 'texto limpo');
  assert.deepEqual(validar(dir, clone()), [], 'a cópia limpa devia passar');
  preparar?.(dir);
  const l = clone();
  mutar?.(l);
  assert.notDeepEqual(validar(dir, l), [], `estrago não apanhado: ${nome}`);
  mentiras++;
};
const termo = (l, n) => l.termos.find((t) => t.termo === n);

falha('termo obrigatório retirado', (l) => { l.termos = l.termos.filter((t) => t.termo !== 'sagrada'); });
falha('termo repetido', (l) => { l.termos.push({ ...termo(l, 'fio') }); });
falha('ligado sem objecto', (l) => { termo(l, 'fio').objectos = []; });
falha('ficheiro que não existe', (l) => { termo(l, 'fio').objectos[1].caminho = 'docs/nao-existe.md'; });
falha('caminho com ..', (l) => { termo(l, 'fio').objectos[1].caminho = '../x'; });
falha('trecho que não está no ficheiro', (l) => { termo(l, 'sagrada').objectos[0].trecho = '0x0000000000000000000000000000000000000000'; });
falha('verificador inexistente', (l) => { termo(l, 'ORO').objectos[2].script = 'inventado:verify'; });
falha('tipo de objecto desconhecido', (l) => { termo(l, 'ORO').objectos[0].tipo = 'fe'; });
falha('Σ(t) passa a ligado', (l) => { termo(l, 'Σ(t)').estado = 'ligado'; });
falha('sem lastro sem dizer porquê', (l) => { termo(l, 'Σ(t)').porque = ''; });
falha('estado inventado', (l) => { termo(l, 'fio').estado = 'sagrado'; });
falha('sem o que não significa', (l) => { delete termo(l, 'sustento').nao_significa; });
falha('sem fronteira "não prova"', (l) => { l.prova = 'Prova valor.'; });
falha('sem citação de Unum', (l) => { l.autorizacao_de_unum.citacao = ''; });
falha('padrões proibidos retirados', (l) => { l.proibido_em_textos_publicos = []; });
falha('schema desconhecido', (l) => { l.schema = 'outro'; });
falha('texto público promete 904 anos', null, (d) => fs.writeFileSync(path.join(d, 'llms.txt'), 'O organismo garante 904 anos de presença.'));
falha('texto público promete 904 (ordem inversa)', null, (d) => fs.writeFileSync(path.join(d, 'index.html'), '<p>904 anos garantidos</p>'));
falha('texto público promete receita', null, (d) => fs.writeFileSync(path.join(d, 'index.html'), '<p>Receita garantida.</p>'));
falha('verificador apagado do package.json', null, (d) => { const p = path.join(d, 'package.json'); const j = JSON.parse(fs.readFileSync(p, 'utf8')); delete j.scripts['raiz:verify']; fs.writeFileSync(p, JSON.stringify(j)); });
falha('ficheiro ligado apagado', null, (d) => fs.rmSync(path.join(d, 'ancora/raiz-registos-2.ots')));

console.log(JSON.stringify({ verified: true, ...real, casos_de_mentira: mentiras }));
