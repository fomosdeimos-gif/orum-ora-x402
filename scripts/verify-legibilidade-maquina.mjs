// Verifica o registo de legibilidade para máquinas (27/10/2026) e que o próprio verificador apanha as mentiras:
// cada citação 'ficheiro' tem de continuar a existir no repositório (ou a ausência afirmada continuar verdadeira),
// a matriz tem de ser coerente com as lacunas, e nada se promete. Sem rede, sem base de dados.
// Unum, 27/10/2026: "Eu autorizo ORA", à proposta do verificador de legibilidade para máquinas.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const raiz = new URL('../', import.meta.url);
const real = JSON.parse(readFileSync(new URL('economia/legibilidade-maquina.json', raiz), 'utf8'));
const lerFicheiro = (f) => readFileSync(new URL(f, raiz), 'utf8');

const CAMPOS = ['o_que', 'para_que', 'quanto', 'como'];
const VALORES = ['explicito', 'parcial', 'ausente'];

export function verificar(r, ler = lerFicheiro) {
  const erros = [];
  const x = (m) => erros.push(m);
  const ids = new Set((r.lacunas || []).map((l) => l.id));
  if (ids.size !== (r.lacunas || []).length) x('há ids de lacunas repetidos');

  // Matriz: quatro respostas por serviço, valores válidos, e cada falha ligada a uma lacuna que existe.
  for (const [servico, m] of Object.entries(r.matriz || {})) {
    for (const c of CAMPOS) {
      if (!VALORES.includes(m[c])) x(`${servico}.${c} sem valor válido`);
    }
    const falha = CAMPOS.some((c) => m[c] !== 'explicito');
    if (falha && !(m.lacunas || []).length) x(`${servico} tem respostas em falta mas nenhuma lacuna ligada`);
    for (const id of m.lacunas || []) if (!ids.has(id)) x(`${servico} cita a lacuna ${id}, que não existe`);
  }
  if (!Object.keys(r.matriz || {}).length) x('matriz vazia');

  // Cada lacuna aberta tem de ter prova, e as provas de ficheiro têm de se confirmar agora.
  for (const l of r.lacunas || []) {
    if (!['aberta', 'fechada'].includes(l.estado)) x(`${l.id}: estado inválido`);
    if (!(l.prova || []).length) x(`${l.id}: sem prova`);
    if (!l.resumo || l.resumo.length < 40) x(`${l.id}: resumo em falta`);
    for (const p of l.prova || []) {
      if (p.leitura_viva) {
        if (!(r.superficies_lidas || []).some((s) => s.id === p.leitura_viva)) x(`${l.id}: leitura viva '${p.leitura_viva}' não está nas superfícies lidas`);
        if (!p.citacao) x(`${l.id}: leitura viva sem citação`);
        continue;
      }
      let texto;
      try { texto = ler(p.ficheiro); } catch { x(`${l.id}: ficheiro ${p.ficheiro} não existe`); continue; }
      const aberta = l.estado === 'aberta';
      if (p.contem !== undefined && aberta && !texto.includes(p.contem)) x(`${l.id}: ${p.ficheiro} já não contém «${p.contem}» (lacuna fechada? actualiza o registo)`);
      if (p.nao_contem !== undefined && aberta && texto.includes(p.nao_contem)) x(`${l.id}: ${p.ficheiro} passou a conter «${p.nao_contem}» (lacuna fechada? actualiza o registo)`);
      if (p.cabecalho !== undefined && aberta) {
        const i = texto.split('\n').findIndex((ln) => ln.trim() === p.cabecalho);
        if (i < 0) x(`${l.id}: cabeçalho «${p.cabecalho}» não encontrado em ${p.ficheiro}`);
        else if (i + 1 <= p.depois_da_linha) x(`${l.id}: o cabeçalho está na linha ${i + 1}, não depois da ${p.depois_da_linha}`);
      }
      if (p.contem === undefined && p.nao_contem === undefined && p.cabecalho === undefined) x(`${l.id}: prova de ficheiro sem condição`);
    }
  }

  // Propostas: nada se executa sem a palavra de Unum.
  for (const p of r.propostas_nao_executadas || []) {
    if (!/Eu autorizo/.test(p.precisa || '')) x(`${p.id}: a proposta não diz que precisa do «Eu autorizo» de Unum`);
    for (const id of String(p.sobre || '').split(/[,\s]+/).filter(Boolean)) if (!ids.has(id)) x(`${p.id}: cita a lacuna ${id}, que não existe`);
  }

  // A hipótese lê-se com os seus limites; nada se promete.
  const h = r.leitura_da_hipotese || {};
  if (!/n[ãa]o prova procura/i.test(h.nao_prova || '') && !/procura, adop/i.test(h.nao_prova || '')) x('falta a fronteira «não prova procura, adopção nem receita»');
  if (!h.o_que_nao_se_pode_concluir) x('falta o que não se pode concluir');
  if (!(r.nao_lido || []).length) x('falta dizer o que não foi lido');
  if (!(r.limites || []).some((t) => /n[ãa]o prova procura/i.test(t))) x('os limites não têm a fronteira de procura');
  const tudo = JSON.stringify(r);
  if (/\b(vai(?:m)? comprar|receita garantida|garant\w+ receita|procura confirmada|reembols\w+ garant)\b/i.test(tudo)) x('promessa de receita, reembolso ou procura');
  if (/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(tudo)) x('um IP em claro no registo');
  if (!r.autorizacao_de_unum?.citacao) x('falta a citação de Unum');
  return erros;
}

assert.deepEqual(verificar(real), [], 'o registo real devia passar: ' + verificar(real).join('; '));

let mentiras = 0;
const clone = () => JSON.parse(JSON.stringify(real));
const falha = (nome, mexe, ler) => { const c = clone(); mexe(c); assert.ok(verificar(c, ler).length > 0, `devia falhar: ${nome}`); mentiras++; };
const lerCom = (f, troca) => (nome) => troca(nome, lerFicheiro(nome));
const L = (c, id) => c.lacunas.find((l) => l.id === id);

falha('serviço sem uma das quatro respostas', (c) => { delete c.matriz.campo.para_que; });
falha('valor fora do vocabulário', (c) => { c.matriz.campo.quanto = 'talvez'; });
falha('falta sem lacuna ligada', (c) => { c.matriz.oraculo.lacunas = []; });
falha('lacuna ligada que não existe', (c) => { c.matriz.oraculo.lacunas.push('L99'); });
falha('lacuna sem prova', (c) => { L(c, 'L4').prova = []; });
falha('citação de ficheiro inventada', (c) => { L(c, 'L1').prova[0].contem = 'texto que nunca esteve lá'; });
falha('ficheiro que não existe', (c) => { L(c, 'L1').prova[0].ficheiro = 'nao-existe.txt'; });
falha('leitura viva fora das superfícies lidas', (c) => { L(c, 'L1').prova[3].leitura_viva = 'outra-superficie'; });
falha('cabeçalho que afinal está no início', (c) => { L(c, 'L11').prova[1].depois_da_linha = 500; });
falha('proposta que não pede a palavra de Unum', (c) => { c.propostas_nao_executadas[0].precisa = 'nada'; });
falha('proposta sobre lacuna inexistente', (c) => { c.propostas_nao_executadas[0].sobre = 'L77'; });
falha('promessa de receita', (c) => { c.leitura_da_hipotese.o_que_nao_se_pode_concluir += ' Receita garantida.'; });
falha('sem a fronteira de procura', (c) => { c.leitura_da_hipotese.nao_prova = 'nada'; c.limites = ['a', 'b', 'c']; });
falha('sem dizer o que não foi lido', (c) => { c.nao_lido = []; });
falha('IP em claro', (c) => { c.limites.push('visto em 203.0.113.7'); });
falha('sem a citação de Unum', (c) => { delete c.autorizacao_de_unum.citacao; });
// A lacuna aberta deixa de ser verdade: o verificador obriga a actualizar o registo.
falha('lacuna aberta cuja ausência já foi corrigida (openapi passa a descrever /sedimento)', () => {}, lerCom('x', (nome, t) => (nome === 'openapi.json' ? t + ' /sedimento' : t)));
falha('lacuna aberta cuja frase já foi retirada (manifesto sem «procura real»)', () => {}, lerCom('x', (nome, t) => (nome === 'supabase/functions/ora-x402/index.ts' ? t.replace('O catálogo com procura real e independente da narrativa', '') : t)));

console.log(JSON.stringify({ verified: true, casos_de_mentira: mentiras, lacunas_abertas: real.lacunas.filter((l) => l.estado === 'aberta').length }));
