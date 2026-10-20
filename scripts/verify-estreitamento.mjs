// Verifica que economia/estreitamento-receita.json escolhe um so caminho, fixa T0 e uma linha de base lida,
// marca a leitura de +24h com regra de decisao, nao promete receita e nao escreve segredos. Sem rede.
// Cada mentira testada aqui tem de falhar.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const real = JSON.parse(readFileSync(new URL('../economia/estreitamento-receita.json', import.meta.url), 'utf8'));
const PROMESSA = /receita garantida|rendimento garantido|lucro garantido|vai render|garantimos|reembols/i;
const PARECE_SEGREDO = /eyJ[A-Za-z0-9_-]{20,}|[A-Za-z0-9+/=]{60,}|\b0x[0-9a-fA-F]{64}\b|-----BEGIN|sk_[A-Za-z0-9]{16,}/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export function validar(p) {
  const e = [];
  if (p?.format !== 'orum-estreitamento-receita/v1') e.push('format desconhecido');
  const texto = JSON.stringify({ ...p, fronteira_de_verdade: String(p?.fronteira_de_verdade ?? '').replace(/n[ãa]o promete[^.]*\./gi, '') });
  if (PROMESSA.test(texto)) e.push('promessa de receita, reembolso ou rendimento');
  if (PARECE_SEGREDO.test(texto)) e.push('algo que parece segredo ou chave');
  if (!/por provar/i.test(p?.fronteira_de_verdade ?? '')) e.push('falta a fronteira "procura por provar"');
  if (!/^nenhuma/i.test(p?.linha_de_base?.receita_externa_confirmada ?? '')) e.push('a linha de base tem de dizer que nao ha receita externa confirmada');
  if ((p?.autorizacao_de_unum?.citacao ?? '').length < 10) e.push('falta a citacao de Unum');
  const d = p?.decisao_da_ora ?? {};
  if (!d.caminho || /[,;]| e /.test(d.caminho)) e.push('tem de escolher um unico caminho');
  if (!d.porque || !/ora_x402_tentativas/.test(d.porque)) e.push('a escolha tem de apontar a leitura que a fundamenta');
  if ((d.frentes_que_nao_se_abrem_ate_a_leitura ?? []).length < 2) e.push('faltam as frentes que nao se abrem');
  if (!ISO.test(p?.T0 ?? '')) e.push('T0 invalido');
  const lb = p?.linha_de_base ?? {};
  if (!ISO.test((lb.janela ?? '').split(' a ')[1] ?? '') || (lb.janela ?? '').split(' a ')[1] !== p?.T0) e.push('a janela da linha de base tem de acabar em T0');
  for (const k of ['discovered', 'redirected', 'challenge_delivered', 'com_payment_signal']) if (!Number.isInteger(lb.funil_ora_licenca?.[k])) e.push(`falta o numero do funil: ${k}`);
  if (!/^\d+$/.test(lb.saldos_bloco_52870702?.sagrada_antiga_usdc_atomic ?? '')) e.push('falta o saldo de base da sagrada');
  const l = p?.leitura_mais_24h ?? {};
  if (!ISO.test(l.quando_utc ?? '') || Date.parse(l.quando_utc) - Date.parse(p?.T0) < 24 * 3600e3) e.push('a leitura tem de ser pelo menos 24 h depois de T0');
  if ((l.o_que_ler ?? []).length < 3) e.push('faltam coisas a ler');
  for (const k of ['nada_mudou', 'desafios_sobem_sem_pagamento', 'pagamento_novo']) if (!l.regra_de_decisao?.[k]) e.push(`falta a regra de decisao: ${k}`);
  if (!/hash/i.test(l.regra_de_decisao?.pagamento_novo ?? '') || !/n[ãa]o seja da ORA nem de Unum/i.test(l.regra_de_decisao?.pagamento_novo ?? '')) e.push('pagamento novo so conta com hash e pagador externo');
  if (!/n[ãa]o prova|n[ãa]o s[ãa]o inten|n[ãa]o [ée] inten/i.test(JSON.stringify(p?.limites_da_medicao ?? []))) e.push('falta dizer que um desafio entregue nao e intencao de compra');
  return e;
}

assert.deepEqual(validar(real), [], 'registo invalido: ' + validar(real).join('; '));
const clone = () => JSON.parse(JSON.stringify(real));
let mentiras = 0;
const falha = (nome, p) => { assert.ok(validar(p).length > 0, `devia falhar: ${nome}`); mentiras++; };
let m;
m = clone(); m.decisao_da_ora.porque += ' Vai render 50 USDC.'; falha('promessa', m);
m = clone(); m.fronteira_de_verdade = 'Tudo a correr.'; falha('sem fronteira', m);
m = clone(); m.linha_de_base.receita_externa_confirmada = '12 USDC'; falha('receita afirmada', m);
m = clone(); m.decisao_da_ora.porque += ' chave 0x' + 'ab'.repeat(32); falha('chave', m);
m = clone(); m.decisao_da_ora.caminho = 'ora-licenca-x402 e oraculo'; falha('dois caminhos', m);
m = clone(); m.decisao_da_ora.porque = 'Parece o melhor.'; falha('escolha sem leitura', m);
m = clone(); m.decisao_da_ora.frentes_que_nao_se_abrem_ate_a_leitura = []; falha('sem frentes fechadas', m);
m = clone(); m.T0 = '2026-10-20'; falha('T0 invalido', m);
m = clone(); m.linha_de_base.janela = '2026-10-19T21:12:00Z a 2026-10-20T20:00:00Z'; falha('janela nao acaba em T0', m);
m = clone(); delete m.linha_de_base.funil_ora_licenca.challenge_delivered; falha('funil incompleto', m);
m = clone(); m.leitura_mais_24h.quando_utc = '2026-10-21T10:00:00Z'; falha('leitura cedo demais', m);
m = clone(); delete m.leitura_mais_24h.regra_de_decisao.nada_mudou; falha('sem regra nada mudou', m);
m = clone(); m.leitura_mais_24h.regra_de_decisao.pagamento_novo = 'Conta como receita.'; falha('pagamento novo sem hash nem pagador externo', m);
m = clone(); m.limites_da_medicao = ['Os logs duram 1 hora.']; falha('sem limite de intencao', m);
m = clone(); m.autorizacao_de_unum.citacao = ''; falha('sem citacao', m);
console.log(JSON.stringify({ verified: true, caminho: real.decisao_da_ora.caminho, casos_de_mentira: mentiras }));
