// Verifica que economia/caminhos-de-sustento.json diz so o que foi lido: nenhuma promessa de receita, cada
// caminho com estado e evidencia, o que esta bloqueado diz quem o desbloqueia, nada que dependa de contacto
// externo ou de segredos aparece como autonomo, e nenhum valor secreto la escrito. Sem rede.
// Cada mentira testada aqui tem de falhar.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const real = JSON.parse(readFileSync(new URL('../economia/caminhos-de-sustento.json', import.meta.url), 'utf8'));
const ESTADOS = ['autonomo_agora', 'activa_parcial', 'depende_de_outro_caminho', 'bloqueado_segredos', 'bloqueado_faturacao', 'bloqueado_contacto_externo', 'fora_do_mandato'];
const EVIDENCIAS = ['ao_vivo', 'codigo', 'livro', 'pesquisa'];
const PROMESSA = /receita garantida|rendimento garantido|lucro garantido|vai render|garantimos|garante(m)? (receita|lucro)|reembols/i;
const PARECE_SEGREDO = /eyJ[A-Za-z0-9_-]{20,}|[A-Za-z0-9+/=]{60,}|\b0x[0-9a-fA-F]{64}\b|-----BEGIN|sk_[A-Za-z0-9]{16,}/;

export function validar(p) {
  const e = [];
  if (p?.format !== 'orum-caminhos-de-sustento/v1') e.push('format desconhecido');
  // a frase "nao promete ..." da fronteira nega a promessa; tudo o resto, fronteira incluida, nao pode prometer nada
  const texto = JSON.stringify({ ...p, fronteira_de_verdade: String(p?.fronteira_de_verdade ?? '').replace(/n[ãa]o promete[^.]*\./gi, '') });
  if (PROMESSA.test(texto)) e.push('promessa de receita, reembolso ou rendimento no texto');
  // um hash de transaccao tem a forma de uma chave privada (0x + 64 hex): so se aceita no campo que prova a receita
  const semProva = JSON.stringify({ ...p, estado_real: { ...p?.estado_real, receita_externa_confirmada: undefined } });
  if (PARECE_SEGREDO.test(semProva)) e.push('algo que parece um segredo ou uma chave escrito no registo');
  if (!/n[ãa]o prova|por provar/i.test(p?.fronteira_de_verdade ?? '')) e.push('falta a fronteira "procura por provar"');
  const rec = p?.estado_real?.receita_externa_confirmada;
  if (typeof rec !== 'string') e.push('falta estado_real.receita_externa_confirmada');
  else if (!/^nenhuma/i.test(rec) && !/0x[0-9a-fA-F]{64}/.test(rec)) e.push('receita externa afirmada sem o hash da transaccao que a prova');
  if (!/\b0 compradores externos\b|nenhuma/i.test(JSON.stringify(p?.estado_real ?? {}))) e.push('o estado real tem de dizer que nao ha compradores externos confirmados');
  if (!p?.autorizacao_de_unum?.citacao || p.autorizacao_de_unum.citacao.length < 10) e.push('falta a citacao de Unum');
  const caminhos = p?.caminhos ?? [];
  if (!caminhos.length) e.push('sem caminhos');
  const ids = new Set();
  for (const c of caminhos) {
    const n = c?.id ?? '?';
    if (!c?.id || ids.has(c.id)) e.push(`${n}: id em falta ou repetido`); else ids.add(c.id);
    if (!ESTADOS.includes(c?.estado)) e.push(`${n}: estado invalido (${c?.estado})`);
    if (!EVIDENCIAS.includes(c?.evidencia?.tipo) || !c?.evidencia?.fonte || !c?.evidencia?.data) e.push(`${n}: evidencia incompleta`);
    if (!c?.lido || !c?.quem_desbloqueia) e.push(`${n}: falta o que foi lido ou quem desbloqueia`);
    if (['autonomo_agora', 'activa_parcial'].includes(c?.estado) && c?.evidencia?.tipo === 'pesquisa') e.push(`${n}: nao pode estar activo so com evidencia de pesquisa`);
    if (String(c?.estado).startsWith('bloqueado_') && !/Unum/.test(c?.quem_desbloqueia ?? '')) e.push(`${n}: bloqueado mas nao diz que e Unum a desbloquear`);
    if (c?.estado === 'bloqueado_segredos' && !/nunca as l[eê]/i.test(c?.quem_desbloqueia ?? '')) e.push(`${n}: bloqueio de segredos tem de dizer que a ORA nunca os le`);
    if (/catalogos?-|registar-|contacto-externo/i.test(c?.id ?? '') && !String(c?.estado).startsWith('bloqueado_contacto')) e.push(`${n}: catalogo ou contacto externo nao pode ser autonomo`);
    if (/segredo|cdp|credenciais/i.test(c?.id ?? '') && c?.estado === 'autonomo_agora') e.push(`${n}: depende de segredos e nao pode ser autonomo`);
  }
  if (!caminhos.some((c) => c?.estado === 'fora_do_mandato')) e.push('falta o caminho fora do mandato (negociacao, ponte, divida)');
  return e;
}

const erros = validar(real);
assert.deepEqual(erros, [], 'registo invalido: ' + erros.join('; '));

const clone = () => JSON.parse(JSON.stringify(real));
let mentiras = 0;
const falha = (nome, p) => { assert.ok(validar(p).length > 0, `devia falhar: ${nome}`); mentiras++; };
let m;
m = clone(); m.caminhos[0].lido += ' Vai render 100 USDC por mes.'; falha('promessa de receita', m);
m = clone(); m.caminhos[0].lido += ' Receita garantida.'; falha('receita garantida', m);
m = clone(); m.caminhos[0].lido += ' Reembolso total se nao gostares.'; falha('promessa de reembolso', m);
m = clone(); m.fronteira_de_verdade = 'Procura por provar. Receita garantida.'; falha('promessa dentro da fronteira', m);
m = clone(); m.estado_real.receita_externa_confirmada = '12 USDC'; falha('receita afirmada sem hash', m);
m = clone(); m.estado_real.receita_externa_confirmada = '12 USDC (tx 0x' + 'ab'.repeat(32) + ')'; assert.deepEqual(validar(m), [], 'com hash devia passar'); mentiras++;
m = clone(); m.caminhos[1].lido = 'Chave: ' + 'A'.repeat(70); falha('segredo escrito', m);
m = clone(); m.caminhos[1].lido = 'chave 0x' + 'cd'.repeat(32); falha('chave privada de 64 hex fora do campo de prova', m);
m = clone(); m.caminhos[1].lido = 'token eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9abc'; falha('JWT escrito', m);
m = clone(); m.caminhos[1].estado = 'autonomo_agora'; m.caminhos[1].id = 'cdp-segredo-agora'; falha('segredos como autonomo', m);
m = clone(); m.caminhos[3].estado = 'autonomo_agora'; falha('catalogo externo como autonomo', m);
m = clone(); m.caminhos[2].quem_desbloqueia = 'ORA'; falha('bloqueio sem Unum', m);
m = clone(); m.caminhos[1].quem_desbloqueia = 'Unum cria as variaveis'; falha('segredos sem a ORA nunca os ler', m);
m = clone(); m.caminhos[0].evidencia.tipo = 'pesquisa'; falha('activo so com pesquisa', m);
m = clone(); m.caminhos[0].estado = 'em_curso'; falha('estado inventado', m);
m = clone(); delete m.caminhos[0].evidencia; falha('sem evidencia', m);
m = clone(); m.caminhos = m.caminhos.filter((c) => c.estado !== 'fora_do_mandato'); falha('sem fora do mandato', m);
m = clone(); m.estado_real = { receita_externa_confirmada: '', nota: 'tudo bem' }; falha('estado real sem dizer que nao ha compradores', m);
m = clone(); m.fronteira_de_verdade = 'Tudo a correr.'; falha('sem fronteira de verdade', m);
m = clone(); m.autorizacao_de_unum.citacao = ''; falha('sem citacao de Unum', m);
m = clone(); m.caminhos[1].id = m.caminhos[0].id; falha('ids repetidos', m);

console.log(JSON.stringify({ verified: true, caminhos: real.caminhos.length, autonomos: real.caminhos.filter((c) => c.estado === 'autonomo_agora').length, bloqueados: real.caminhos.filter((c) => c.estado.startsWith('bloqueado_')).length, casos_de_mentira: mentiras }));
