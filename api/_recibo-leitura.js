'use strict';
// ORA · recibo verificável de leitura (16/11/2026; Unum: "Eu autorizo ORA", à proposta concreta de um recibo em JSON aberto,
// sem token, que uma máquina confere sozinha). Não é uma função (prefixo _): não conta para o limite de 12.
//
// Junta, num só ficheiro, o pagamento (tx na Base, pagador, valor) e a leitura entregue, ligados por sha256. Quem o recebe
// refaz os hashes sem a ORA (`node kit/recibo.mjs recibo.json`) e, com `--cadeia`, confere o pagamento em duas fontes RPC.
//
// O que NÃO é: não é token, não move fundos, não prova receita, procura nem adopção. A classe do pagador só diz `interno`
// (está em economia/enderecos-internos.json) ou `por_classificar`; nunca se infere `externo` (continua a precisar de classificação
// explícita, como no vigia de entradas). Um pagamento `interno` é validação, não sustento.
// Determinístico: `emitido_em` é o `lido_em` da leitura, por isso a mesma tx (reacesso) devolve o mesmo recibo.
const { createHash } = require('node:crypto');
const INTERNOS = require('../economia/enderecos-internos.json');

const FORMATO = 'orum-recibo-leitura/v1';
const CAIP2 = 'eip155:8453';
const NAO_AFIRMA = Object.freeze(['receita', 'procura', 'adopcao', 'pagador externo']);
const REGRA = 'leitura_sha256 e recibo_sha256 são sha256 do JSON canónico (chaves por ordem, sem espaços); pagador_classe só diz interno ou por_classificar';

const ordenar = (v) => Array.isArray(v) ? v.map(ordenar)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenar(v[k])])) : v;
const canonico = (v) => JSON.stringify(ordenar(v));
const sha256 = (t) => createHash('sha256').update(t).digest('hex');

const internosBase = new Set(INTERNOS.base.map((x) => String(x.endereco).toLowerCase()));
const classeDoPagador = (a) => (internosBase.has(String(a).toLowerCase()) ? 'interno' : 'por_classificar');

function criarRecibo({ leitura, tx_hash, payer, valor_atomic, payto, usdc }) {
  const corpo = {
    formato: FORMATO,
    emitido_em: leitura.lido_em,
    pagamento: { rede: CAIP2, ativo: 'USDC', contrato: usdc, tx_hash, pagador: payer, payto, valor_atomic: String(valor_atomic) },
    pagador_classe: classeDoPagador(payer),
    leitura_sha256: sha256(canonico(leitura)),
    leitura,
    nao_afirma: [...NAO_AFIRMA],
    regra: REGRA,
  };
  return { ...corpo, recibo_sha256: sha256(canonico(corpo)) };
}

module.exports = { criarRecibo, canonico, sha256, classeDoPagador, FORMATO, NAO_AFIRMA, REGRA };
