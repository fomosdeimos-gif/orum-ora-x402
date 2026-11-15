// Verifica api/_leitura.js: a leitura verificada só dá valor com pelo menos duas fontes iguais, escolhe o bloco certo,
// formata sem arredondar, e a validação apanha uma leitura que minta. Sem rede: as fontes são simuladas.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../api/_leitura.js');
const { RPCS, ESPLORA, createLeitor, validarLeitura, formatarValium, decidir } = L;
const [R1, R2, R3] = RPCS;
const WEI = '2976352211822864886784';
const hex = (n) => '0x' + BigInt(n).toString(16);

// fonte simulada: cada RPC pode estar em baixo, atrasado (outro bloco) ou devolver outro saldo
function mundo({ rpcs = {}, esplora = {} }) {
  const chamadas = [];
  const fetchFn = async (url, init = {}) => {
    const u = String(url);
    if (RPCS.includes(u)) {
      const cfg = rpcs[u] ?? { bloco: 1000, saldo: WEI };
      if (cfg.baixo) throw new Error('fonte em baixo');
      const body = JSON.parse(init.body);
      chamadas.push({ url: u, method: body.method, params: body.params });
      if (body.method === 'eth_blockNumber') return { json: async () => ({ result: hex(cfg.bloco) }) };
      if (body.method === 'eth_call') return { json: async () => (cfg.lixo ? { result: 'não é hex' } : cfg.erro ? { error: { message: 'execution reverted' } } : { result: '0x' + BigInt(cfg.saldo).toString(16).padStart(64, '0') }) };
    }
    const f = ESPLORA.find((x) => u.startsWith(x.base));
    if (f) {
      const cfg = esplora[f.base] ?? { fundado: 10402, gasto: 330, mempool: 0, txs: 2 };
      if (cfg.baixo) throw new Error('fonte em baixo');
      if (cfg.http) return { ok: false, status: cfg.http, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ chain_stats: { funded_txo_sum: cfg.fundado, spent_txo_sum: cfg.gasto, tx_count: cfg.txs }, mempool_stats: { funded_txo_sum: cfg.mempool, spent_txo_sum: 0 } }) };
    }
    throw new Error('url inesperado ' + u);
  };
  return { fetchFn, chamadas };
}
const ler = async (cfg = {}) => { const m = mundo(cfg); const l = await createLeitor({ fetchFn: m.fetchFn, now: () => Date.parse('2026-11-15T12:00:00Z') }).ler(); return { l, m }; };
let n = 0;
const ok = (c, msg) => { assert.ok(c, msg); n++; };
const igual = (a, b, msg) => { assert.equal(a, b, msg); n++; };

// --- o caminho bom: três RPC e duas fontes Esplora concordam
{
  const { l, m } = await ler({ rpcs: { [R1]: { bloco: 1005, saldo: WEI }, [R2]: { bloco: 1003, saldo: WEI }, [R3]: { bloco: 1010, saldo: WEI } } });
  igual(l.valium_na_sagrada.estado, 'concordam'); igual(l.valium_na_sagrada.verificado, true);
  igual(l.valium_na_sagrada.valor_wei, WEI); igual(l.valium_na_sagrada.valium, '2976.352211822864886784', 'sem arredondar');
  igual(l.valium_na_sagrada.bloco, 1001, 'bloco = o mais baixo (1003) menos 2');
  ok(m.chamadas.filter((c) => c.method === 'eth_call').every((c) => c.params[1] === hex(1001)), 'todas as fontes lidas no mesmo bloco');
  igual(l.valium_na_sagrada.fontes_ok.length, 3);
  igual(l.fundacao_btc.estado, 'concordam'); igual(l.fundacao_btc.saldo_confirmado_sats, 10072); igual(l.fundacao_btc.transaccoes_confirmadas, 2);
  igual(l.lido_em, '2026-11-15T12:00:00.000Z');
  assert.deepEqual(validarLeitura(l), []); n++;
}
// --- nunca escolhe entre valores diferentes
{
  const { l } = await ler({ rpcs: { [R3]: { bloco: 1000, saldo: '1' } } });
  igual(l.valium_na_sagrada.estado, 'discordam'); igual(l.valium_na_sagrada.valor_wei, null); igual(l.valium_na_sagrada.valium, null); igual(l.valium_na_sagrada.verificado, false);
  assert.deepEqual(validarLeitura(l), []); n++;
}
// --- uma fonte só não chega
{
  const { l } = await ler({ rpcs: { [R2]: { baixo: true }, [R3]: { baixo: true } } });
  igual(l.valium_na_sagrada.estado, 'fonte_unica'); igual(l.valium_na_sagrada.valor_wei, null); igual(l.valium_na_sagrada.fontes_falhadas.length, 2);
}
// --- duas de três concordam, a terceira em baixo: conta, e a falha fica dita
{
  const { l } = await ler({ rpcs: { [R3]: { baixo: true } } });
  igual(l.valium_na_sagrada.estado, 'concordam'); igual(l.valium_na_sagrada.fontes_ok.length, 2); igual(l.valium_na_sagrada.fontes_falhadas[0].fonte, R3);
}
// --- nenhuma fonte
{
  const { l } = await ler({ rpcs: { [R1]: { baixo: true }, [R2]: { baixo: true }, [R3]: { baixo: true } }, esplora: { [ESPLORA[0].base]: { baixo: true }, [ESPLORA[1].base]: { baixo: true } } });
  igual(l.valium_na_sagrada.estado, 'sem_fontes'); igual(l.valium_na_sagrada.bloco, null); igual(l.fundacao_btc.estado, 'sem_fontes'); igual(l.fundacao_btc.saldo_confirmado_sats, null);
  assert.deepEqual(validarLeitura(l), []); n++;
}
// --- respostas estragadas por uma fonte não viram saldo
{
  const a = await ler({ rpcs: { [R1]: { bloco: 1000, lixo: true } } });
  igual(a.l.valium_na_sagrada.fontes_falhadas.length, 1, 'resposta não hex conta como falha');
  const b = await ler({ rpcs: { [R1]: { bloco: 1000, erro: true } } });
  igual(b.l.valium_na_sagrada.fontes_falhadas.length, 1);
  const c = await ler({ esplora: { [ESPLORA[0].base]: { http: 429 } } });
  igual(c.l.fundacao_btc.estado, 'fonte_unica'); igual(c.l.fundacao_btc.saldo_confirmado_sats, null);
}
// --- Esplora discorda
{
  const { l } = await ler({ esplora: { [ESPLORA[1].base]: { fundado: 10403, gasto: 330, mempool: 0, txs: 2 } } });
  igual(l.fundacao_btc.estado, 'discordam'); igual(l.fundacao_btc.saldo_confirmado_sats, null);
}
// --- formatar e decidir
igual(formatarValium(0n), '0'); igual(formatarValium(1n), '0.000000000000000001'); igual(formatarValium(10n ** 18n), '1'); igual(formatarValium(15n * 10n ** 17n), '1.5');
igual(decidir({}).estado, 'sem_fontes'); igual(decidir({ a: '1' }).estado, 'fonte_unica'); igual(decidir({ a: '1', b: '1' }).estado, 'concordam'); igual(decidir({ a: '1', b: '2' }).estado, 'discordam');

// --- estragos propositados: uma leitura que mente tem de ser apanhada
const { l: boa } = await ler();
const estragos = {
  'formato': (l) => { l.formato = 'x'; },
  'verificado sem concordar': (l) => { l.valium_na_sagrada.estado = 'discordam'; },
  'valor numa fonte unica': (l) => { l.valium_na_sagrada.estado = 'fonte_unica'; l.valium_na_sagrada.verificado = false; },
  'concordam com uma fonte': (l) => { l.valium_na_sagrada.fontes_ok = ['a']; },
  'valor nao numerico': (l) => { l.valium_na_sagrada.valor_wei = 'muito'; },
  'valium sem valor com verificado': (l) => { l.valium_na_sagrada.valium = null; },
  'fundacao com valor sem verificar': (l) => { l.fundacao_btc.estado = 'discordam'; l.fundacao_btc.verificado = false; },
  'fundacao numero decimal': (l) => { l.fundacao_btc.saldo_confirmado_sats = 1.5; },
  'endereco BTC trocado': (l) => { l.fundacao_btc.endereco = 'bc1qoutro'; },
  'contrato invalido': (l) => { l.valium_na_sagrada.contrato = '0x12'; },
  'sem nao_afirma receita': (l) => { l.nao_afirma = l.nao_afirma.filter((x) => x !== 'receita'); },
  'sem nao_afirma procura': (l) => { l.nao_afirma = l.nao_afirma.filter((x) => x !== 'procura'); },
  'promessa': (l) => { l.regra += ' Garantido que vai valorizar.'; },
  'sem bloco fundacao': (l) => { delete l.fundacao_btc; },
};
for (const [nome, f] of Object.entries(estragos)) {
  const l = JSON.parse(JSON.stringify(boa)); f(l);
  ok(validarLeitura(l).length > 0, `estrago não apanhado: ${nome}`);
}
console.log(JSON.stringify({ verified: true, ok: true, leitura: 'valium+fundacao', verificacoes: n - Object.keys(estragos).length, estragos_apanhados: Object.keys(estragos).length }));
