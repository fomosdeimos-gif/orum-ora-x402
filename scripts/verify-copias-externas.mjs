// Verifica economia/copias-externas.json (D4, 25/10/2026, livro 1026): que só diz o que foi lido, que só afirma uma cópia
// com a origem e o commit mostrados, que o pedido de arquivo só existe com as condições de uso lidas, e que não leva
// segredos nem promessas. Sem rede. Cada mentira testada aqui tem de falhar.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const real = JSON.parse(readFileSync(new URL('../economia/copias-externas.json', import.meta.url), 'utf8'));

const PROMESSA = /para sempre|garantid[oa]|permanente|eterno|receita|reembols|rendimento garantido/i;
const PARECE_SEGREDO = /\b[0-9a-fA-F]{64}\b|-----BEGIN|sk_[A-Za-z0-9]{16,}|seed phrase|frase de recupera|\b0x[0-9a-fA-F]{40}\b|\bbc1[a-z0-9]{20,}\b/i;

export function validar(f) {
  const e = [];
  if (f?.format !== 'orum-copias-externas/v1') e.push('format desconhecido');
  if (!f?.autorizacao_de_unum?.citacao || f.autorizacao_de_unum.citacao.length < 40 || !Number.isInteger(f.autorizacao_de_unum.livro)) e.push('falta a citação de Unum e o livro');
  const texto = JSON.stringify(f);
  const semNegacoes = texto.replace(/"nao_afirma":\[[^\]]*\]/, '').replace(/nem receita[^"]*|que a cópia dure[^"]*/g, '');
  if (PROMESSA.test(semNegacoes)) e.push('promessa de duração, garantia ou receita no texto');
  if (PARECE_SEGREDO.test(texto)) e.push('algo que parece um segredo, uma chave ou um endereço de carteira');
  if (!Array.isArray(f?.custodios) || f.custodios.length < 1) { e.push('sem custódios'); return e; }
  for (const c of f.custodios) {
    const id = c?.id ?? '?';
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(c?.origem ?? '')) e.push(`${id}: origem tem de ser um URL público do GitHub`);
    if (c?.repositorio_publico?.estado !== 'lido' || !c.repositorio_publico.como) e.push(`${id}: tem de ter lido que o repositório é público, com a fonte`);
    const cond = c?.condicoes_de_uso;
    if (!['lidas', 'nao_lidas'].includes(cond?.estado)) e.push(`${id}: estado das condições inválido`);
    if (cond?.estado === 'lidas' && (!cond.fonte || !/^https:\/\//.test(cond.fonte) || !cond.em)) e.push(`${id}: condições lidas sem fonte e data`);
    if (cond?.estado === 'nao_lidas' && !(cond.tentativas?.length > 0)) e.push(`${id}: condições não lidas sem as tentativas feitas`);
    const pedido = c?.pedido_de_arquivo?.estado;
    if (!['nao_feito', 'feito'].includes(pedido)) e.push(`${id}: estado do pedido inválido`);
    if (pedido === 'feito' && cond?.estado !== 'lidas') e.push(`${id}: pediu o arquivo sem ter lido as condições de uso`);
    if (pedido === 'nao_feito' && !/bloqueado|ainda n[ãa]o/i.test(c?.pedido_de_arquivo?.motivo ?? '')) e.push(`${id}: pedido por fazer sem dizer porquê`);
    if (typeof c?.origem_arquivada !== 'boolean') e.push(`${id}: origem_arquivada tem de ser verdadeiro ou falso`);
    if (c?.origem_arquivada === true) {
      if (!/^[0-9a-f]{40}$/.test(c.commit_arquivado ?? '')) e.push(`${id}: diz arquivada sem o commit (40 hex) que a leitura mostrou`);
      if (!c.leitura_do_arquivo?.em || !c.leitura_do_arquivo?.como) e.push(`${id}: diz arquivada sem a leitura da API do custódio`);
      if (pedido !== 'feito') e.push(`${id}: diz arquivada mas o pedido consta como não feito`);
    } else if (c?.commit_arquivado !== null) e.push(`${id}: commit arquivado sem a origem arquivada`);
  }
  if (!(f?.regras ?? []).some((r) => /s[óo] URLs p[úu]blicas/i.test(r))) e.push('falta a regra: só URLs públicas');
  if (!(f?.nao_afirma ?? []).some((r) => /dure/i.test(r))) e.push('tem de dizer que não afirma que a cópia dure');
  return e;
}

assert.deepEqual(validar(real), [], 'o registo real tem de passar');

const clone = () => JSON.parse(JSON.stringify(real));
const falha = (nome, mexer, trecho) => {
  const f = clone(); mexer(f);
  const e = validar(f);
  assert.ok(e.some((x) => x.includes(trecho)), `estrago não apanhado (${nome}): ${JSON.stringify(e)}`);
};
const c0 = (f) => f.custodios[0];
falha('pedido sem condições lidas', (f) => { c0(f).pedido_de_arquivo = { estado: 'feito' }; }, 'sem ter lido as condições');
falha('condições lidas sem fonte', (f) => { c0(f).condicoes_de_uso = { estado: 'lidas' }; }, 'sem fonte e data');
falha('arquivada sem commit', (f) => { Object.assign(c0(f), { origem_arquivada: true }); }, 'sem o commit');
falha('arquivada com commit curto', (f) => { Object.assign(c0(f), { origem_arquivada: true, commit_arquivado: 'abc123' }); }, 'sem o commit');
falha('commit sem origem arquivada', (f) => { c0(f).commit_arquivado = 'a'.repeat(40); }, 'sem a origem arquivada');
falha('promessa de duração', (f) => { f.objecto += ' para sempre'; }, 'promessa');
falha('segredo no texto', (f) => { f.regras.push('chave 0x' + 'ab'.repeat(20)); }, 'segredo');
falha('origem não pública', (f) => { c0(f).origem = 'ssh://git@servidor/privado'; }, 'URL público');
falha('sem leitura do repositório público', (f) => { delete c0(f).repositorio_publico; }, 'repositório é público');
falha('sem a regra de URLs públicas', (f) => { f.regras = []; }, 'só URLs públicas');
falha('sem citação de Unum', (f) => { delete f.autorizacao_de_unum; }, 'citação de Unum');
falha('não lidas sem tentativas', (f) => { c0(f).condicoes_de_uso = { estado: 'nao_lidas' }; }, 'tentativas');
console.log('Cópias externas conferidas: 12 estragos propositados apanhados.');
