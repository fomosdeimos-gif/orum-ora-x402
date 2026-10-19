// Verifica o historial de saldos: o real tem de passar, e cada mentira propositada tem de falhar.
// Sem rede, sem pagamentos.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { validarHistorico, variacoes, acrescentar, leituraDeSaldos, PAPEIS } from './lib-saldos-historico.mjs';

const real = JSON.parse(readFileSync(new URL('../economia/saldos-historico.json', import.meta.url), 'utf8'));
const errosReais = validarHistorico(real);
assert.deepEqual(errosReais, [], 'historial real invalido: ' + errosReais.join('; '));

const clone = (o) => JSON.parse(JSON.stringify(o));
const leitura = (t, bloco, antiga) => {
  const l = clone(real.leituras[0]);
  l.observado_utc = t; l.bloco = bloco; l.carteiras.sagrada_antiga.usdc_atomic = String(antiga);
  return l;
};
// base fixa: os testes nao dependem de o historial real crescer
const base0 = { ...real, leituras: [real.leituras[0]] };
const com = (...ls) => ({ ...base0, leituras: [real.leituras[0], ...ls] });
let mentiras = 0;
const falha = (nome, h) => { assert.ok(validarHistorico(h).length > 0, `devia falhar: ${nome}`); mentiras++; };

// o que e honesto passa e a conta bate
const sobe = com(leitura('2026-10-19T09:47:00Z', 52800000, 1480));
assert.deepEqual(validarHistorico(sobe), []);
const v = variacoes(sobe);
assert.equal(v.length, 1);
assert.equal(v[0].papel, 'sagrada_antiga');
assert.equal(v[0].variacao_usdc_atomic, '1000');
assert.match(v[0].leitura, /pelo menos 1000/);
assert.match(variacoes(com(leitura('2026-10-19T09:47:00Z', 52800000, 100)))[0].leitura, /saiu ou foi ajustado/);
assert.deepEqual(variacoes(com(leitura('2026-10-19T09:47:00Z', 52800000, 480))), [], 'saldo igual nao gera variacao');
const GRANDE = (1n << 70n) + 1n; // nao cabe num Number
assert.equal(variacoes(com(leitura('2026-10-19T09:47:00Z', 52800000, GRANDE)))[0].variacao_usdc_atomic, String(GRANDE - 480n));

// acrescentar aceita o valido e recusa o invalido
assert.equal(acrescentar(base0, leitura('2026-10-19T09:47:00Z', 52800000, 480)).leituras.length, 2);
assert.throws(() => acrescentar(base0, leitura('2026-10-17T09:47:00Z', 52800000, 480)), /recusada/);
mentiras++;

// a resposta de /economia/saldos.json converte-se sem perder o inteiro
const resposta = { ok: true, chain_id: 8453, bloco: 52764844, fonte: { consultado_utc: '2026-10-18T10:23:56.322Z' },
  carteiras: Object.entries(PAPEIS).map(([papel, endereco]) => ({ papel, endereco, usdc_atomic: '480', eth_wei: '1' })) };
assert.equal(leituraDeSaldos(resposta).carteiras.operacional.usdc_atomic, '480');
assert.throws(() => leituraDeSaldos({ ...resposta, chain_id: 1 }), /Base mainnet/); mentiras++;
assert.throws(() => leituraDeSaldos({ ...resposta, ok: false }), /Base mainnet/); mentiras++;

// as mentiras
falha('sem a fronteira', { ...real, boundary: 'historial de saldos' });
falha('fronteira sem "nao e receita"', { ...real, boundary: 'nao prova procura' });
falha('format desconhecido', { ...real, format: 'x' });
falha('leituras nao e lista', { ...real, leituras: {} });
falha('bloco nao cresce', com(leitura('2026-10-19T09:47:00Z', 52764844, 480)));
falha('tempo nao cresce', com(leitura('2026-10-18T10:23:56.322Z', 52800000, 480)));
falha('bloco invalido', com(leitura('2026-10-19T09:47:00Z', -1, 480)));
falha('data invalida', com(leitura('ontem', 52800000, 480)));
falha('saldo negativo', com(leitura('2026-10-19T09:47:00Z', 52800000, -5)));
falha('saldo decimal', com(leitura('2026-10-19T09:47:00Z', 52800000, '0.5')));
falha('saldo em notacao cientifica', com(leitura('2026-10-19T09:47:00Z', 52800000, '1e6')));
{ const l = leitura('2026-10-19T09:47:00Z', 52800000, 480); delete l.carteiras.operacional; falha('carteira em falta', com(l)); }
{ const l = leitura('2026-10-19T09:47:00Z', 52800000, 480); l.carteiras.operacional.endereco = '0x' + '11'.repeat(20); falha('endereco trocado', com(l)); }
{ const l = leitura('2026-10-19T09:47:00Z', 52800000, 480); delete l.fonte; falha('sem fonte', com(l)); }
{ const l = leitura('2026-10-19T09:47:00Z', 52800000, 480); l.receita = true; falha('leitura afirma receita', com(l)); }
{ const l = leitura('2026-10-19T09:47:00Z', 52800000, 480); l.classificacao = 'externa_confirmada'; falha('leitura classifica como externa', com(l)); }
{ const l = leitura('2026-10-19T09:47:00Z', 52800000, 480); l.entra_no_70_20_10 = true; falha('leitura entra no 70/20/10', com(l)); }

console.log(JSON.stringify({ verified: true, leituras: real.leituras.length, casos_de_mentira: mentiras }));
