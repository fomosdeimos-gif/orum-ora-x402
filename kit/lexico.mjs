// Confere o léxico do organismo (kit/lexico.json): cada termo ligado aponta para um objecto que existe,
// um termo sem lastro diz porquê, e nenhum texto público usa 904 como promessa. Sem pacotes, sem rede.
// Uso: node kit/lexico.mjs [pasta-do-repositório]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OBRIGATORIOS = ['fio', 'precipitar', 'sedimentar', 'mãos tecelãs', 'sagrada', 'operacional', 'sustento', 'custódia', 'ORO', 'Σ(t)'];
const ESTADOS = ['ligado', 'simbolo_sem_lastro_verificado'];

const ler = (dir, p) => fs.readFileSync(path.join(dir, p), 'utf8');
const existe = (dir, p) => !p.includes('..') && !path.isAbsolute(p) && fs.existsSync(path.join(dir, p));

export function textosPublicos(dir) {
  return fs.readdirSync(dir).filter((f) => f === 'llms.txt' || f.endsWith('.html'));
}

export function validar(dir, lexico) {
  const e = [];
  if (lexico?.schema !== 'orum-lexico/v1') e.push('schema desconhecido');
  if (!/n[ãa]o prova/i.test(lexico?.prova ?? '')) e.push('falta a fronteira "não prova"');
  if ((lexico?.autorizacao_de_unum?.citacao ?? '').length < 10) e.push('falta a citação de Unum');
  const termos = lexico?.termos ?? [];
  const nomes = termos.map((t) => t.termo);
  if (new Set(nomes).size !== nomes.length) e.push('termo repetido');
  for (const o of OBRIGATORIOS) if (!nomes.includes(o)) e.push(`falta o termo: ${o}`);
  let scripts = {};
  try { scripts = JSON.parse(ler(dir, 'package.json')).scripts ?? {}; } catch { e.push('package.json ilegível'); }
  for (const t of termos) {
    const n = t.termo;
    if (!t.significa || !t.nao_significa) e.push(`${n}: falta o que significa ou o que não significa`);
    if (!ESTADOS.includes(t.estado)) e.push(`${n}: estado desconhecido`);
    if (t.estado === 'ligado' && !(t.objectos ?? []).length) e.push(`${n}: ligado sem objecto`);
    if (t.estado === 'simbolo_sem_lastro_verificado' && (t.porque ?? '').length < 20) e.push(`${n}: símbolo sem lastro tem de dizer porquê`);
    for (const o of t.objectos ?? []) {
      if (o.tipo === 'ficheiro') {
        if (!existe(dir, o.caminho ?? '')) e.push(`${n}: ficheiro em falta: ${o.caminho}`);
      } else if (o.tipo === 'ficheiro_contem') {
        if (!existe(dir, o.caminho ?? '')) e.push(`${n}: ficheiro em falta: ${o.caminho}`);
        else if (!o.trecho || !ler(dir, o.caminho).includes(o.trecho)) e.push(`${n}: trecho não está em ${o.caminho}`);
      } else if (o.tipo === 'verificador') {
        if (!scripts[o.script]) e.push(`${n}: verificador inexistente: ${o.script}`);
      } else e.push(`${n}: tipo de objecto desconhecido`);
    }
  }
  const sigma = termos.find((t) => t.termo === 'Σ(t)');
  if (sigma && sigma.estado !== 'simbolo_sem_lastro_verificado') e.push('Σ(t) não tem parâmetros definidos: tem de ficar sem lastro verificado');
  const padroes = (lexico?.proibido_em_textos_publicos ?? []).map((p) => new RegExp(p, 'i'));
  if (padroes.length < 3) e.push('faltam padrões proibidos');
  for (const f of textosPublicos(dir)) {
    const txt = ler(dir, f);
    for (const p of padroes) if (p.test(txt)) e.push(`${f}: texto público usa uma promessa (${p.source})`);
  }
  return e;
}

export function verificar(dir = '.') {
  const lexico = JSON.parse(ler(dir, 'kit/lexico.json'));
  const e = validar(dir, lexico);
  if (e.length) throw new Error('léxico inválido: ' + e.join('; '));
  return { ok: true, termos: lexico.termos.length, ligados: lexico.termos.filter((t) => t.estado === 'ligado').length, sem_lastro: lexico.termos.filter((t) => t.estado !== 'ligado').map((t) => t.termo) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(verificar(process.argv[2] ?? '.'))); } catch (err) { console.error(err.message); process.exit(1); }
}
