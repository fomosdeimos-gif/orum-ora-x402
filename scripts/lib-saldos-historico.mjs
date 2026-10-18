// Historial de saldos da Base (economia/saldos-historico.json), so de consulta.
// Os logs de arquivo da Base nao chegam (cobertura parcial em /economia/recebimentos.json), mas o saldo
// no cabeco responde sempre. Dois saldos consecutivos dao um MINIMO de entrada: se subiu, entrou pelo
// menos esse valor; se desceu, saiu ou foi ajustado. Nunca e receita, nem externa: isso exige hash e cobertura.
// Modulo puro: sem rede, sem ficheiros.
import { createRequire } from 'node:module';
const C = createRequire(import.meta.url)('../api/_carteira.js');

export const PAPEIS = { sagrada_antiga: C.SAGRADA_ANTIGA, sagrada_nova: C.SAGRADA_NOVA, operacional: C.OPERACIONAL };
const INTEIRO = /^\d+$/;
const PROIBIDAS = ['receita', 'receita_externa', 'classificacao', 'externa_confirmada', 'entra_no_70_20_10'];

export function validarHistorico(h) {
  const erros = [];
  const e = (m) => erros.push(m);
  if (h?.format !== 'orum-balance-history/v1') e('format desconhecido');
  if (!/n[ãa]o prova procura/i.test(h?.boundary ?? '') || !/n[ãa]o [ée] receita/i.test(h?.boundary ?? '')) e('a fronteira "nao prova procura" e "nao e receita" tem de estar presente');
  if (!Array.isArray(h?.leituras)) { e('leituras tem de ser uma lista'); return erros; }
  let anterior = null;
  h.leituras.forEach((l, i) => {
    const x = (m) => e(`leitura ${i}: ${m}`);
    if (!l?.observado_utc || Number.isNaN(Date.parse(l.observado_utc))) x('observado_utc invalido');
    if (!Number.isInteger(l?.bloco) || l.bloco <= 0) x('bloco invalido');
    if (!l?.fonte) x('sem fonte');
    for (const k of PROIBIDAS) if (k in (l ?? {})) x(`campo proibido (${k}): o historial nao classifica`);
    for (const [papel, endereco] of Object.entries(PAPEIS)) {
      const c = l?.carteiras?.[papel];
      if (!c) { x(`carteira ${papel} em falta`); continue; }
      if (c.endereco?.toLowerCase() !== endereco.toLowerCase()) x(`endereco de ${papel} nao e o registado`);
      if (!INTEIRO.test(c.usdc_atomic ?? '')) x(`usdc_atomic de ${papel} nao e um inteiro decimal`);
      if (!INTEIRO.test(c.eth_wei ?? '')) x(`eth_wei de ${papel} nao e um inteiro decimal`);
    }
    if (anterior) {
      if (!(Date.parse(l?.observado_utc) > Date.parse(anterior.observado_utc))) x('observado_utc nao cresce');
      if (!(l?.bloco > anterior.bloco)) x('bloco nao cresce');
    }
    anterior = l;
  });
  return erros;
}

// Variacao de USDC (unidades atomicas, BigInt) entre cada par de leituras consecutivas
export function variacoes(h) {
  const out = [];
  for (let i = 1; i < h.leituras.length; i++) {
    const a = h.leituras[i - 1], b = h.leituras[i];
    for (const papel of Object.keys(PAPEIS)) {
      const d = BigInt(b.carteiras[papel].usdc_atomic) - BigInt(a.carteiras[papel].usdc_atomic);
      if (d !== 0n) out.push({ papel, de: a.observado_utc, ate: b.observado_utc, variacao_usdc_atomic: d.toString(),
        leitura: d > 0n ? `entrou pelo menos ${d} (minimo; saidas na janela escondem entradas)` : 'saiu ou foi ajustado' });
    }
  }
  return out;
}

// Converte a resposta de /economia/saldos.json numa leitura do historial
export function leituraDeSaldos(s) {
  if (!s?.ok || s?.chain_id !== 8453) throw new Error('resposta de saldos nao e a Base mainnet');
  const carteiras = {};
  for (const c of s.carteiras ?? []) carteiras[c.papel] = { endereco: c.endereco, usdc_atomic: c.usdc_atomic, eth_wei: c.eth_wei };
  return { observado_utc: s.fonte?.consultado_utc, bloco: s.bloco, fonte: 'rpc-base-publico via /economia/saldos.json', carteiras };
}

export function acrescentar(h, leitura) {
  const novo = { ...h, leituras: [...h.leituras, leitura] };
  const erros = validarHistorico(novo);
  if (erros.length) throw new Error('leitura recusada: ' + erros.join('; '));
  return novo;
}
