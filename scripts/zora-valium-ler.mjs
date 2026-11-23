// Lê, só em leitura, o que está por trás do perfil `$valium` da Zora (zora.co/@valium): a moeda, quem a possui, para onde vão os
// pagamentos do criador e o que essa carteira guarda. Um valor só entra em "lido" se pelo menos duas fontes RPC Base concordarem;
// senão vai para "nao_verificado". O que a Zora mostra no ecrã fica à parte, como capturado e não verificado.
// Não move fundos, não escreve na cadeia, não toca na Zora (nem compra, nem segue, nem entra). Não afirma preço, procura nem receita.
// Uso: node scripts/zora-valium-ler.mjs [saida.json]
import fs from 'node:fs';
import { acordo, call, RPCS } from './moedas-unum-ler.mjs';

export const MOEDA = '0x37f70bccdc2125346a7542fe6e7fc70e33421635'; // o VALIUM da Base (token/moedas-de-unum-2026-11-01.json)
export const CONHECIDOS = { // endereços que o organismo já regista (CLAUDE.md)
  '0xfed69e8ee87a1f0fbbf8409ab654fc51832cdee5': 'sagrada antiga (Base), depósito de sustento',
  '0x2ef8cfb97ecccf7c62f551639fe6db79022d0d8c': 'sagrada adicional (Unum, MetaMask), assina o mandato v2',
  '0x89460d9e0590559e63860197dfe2ac648a753584': 'operacional (Base)',
  '0x4a10ca6085703425a92bf7df390dd7869858b846': '"@organismo" das capturas de Unum, classificada interna',
};
const SEL = { payoutRecipient: '0x3fb80b15', owners: '0xaffe39c1', platformReferrer: '0x51845bf6', currency: '0xe5a6b10f', ownerCount: '0x0db02622', ownerAtIndex: '0x8ea69029', entryPoint: '0xb0d691fe', balanceOf: '0x70a08231' };
const SLOT_1967 = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const esp = (ms) => new Promise((r) => setTimeout(r, ms));
const endereco = (h) => (h && /^0x[0-9a-f]{64}$/.test(h) ? '0x' + h.slice(26) : null);
const pad = (a) => a.slice(2).padStart(64, '0');
const palavras = (h) => (h && /^0x([0-9a-f]{64})+$/.test(h) ? h.slice(2).match(/.{64}/g) : null);
// address[]: [offset, n, a1, a2, …]  ->  "a1,a2"
const listaEnderecos = (h) => { const w = palavras(h); if (!w || w.length < 2) return null; const n = Number(BigInt('0x' + w[1])); if (w.length < 2 + n) return null; return Array.from({ length: n }, (_, i) => '0x' + w[2 + i].slice(24)).join(','); };
// bytes com um endereço: [offset, comprimento, dados]  ->  endereço (20 bytes à direita da palavra de dados)
const bytesEndereco = (h) => { const w = palavras(h); if (!w || w.length < 3 || Number(BigInt('0x' + w[1])) !== 32) return null; return '0x' + w[2].slice(24); };
// tenta até 3 vezes (os RPC públicos limitam pedidos); só dá valor com acordo de duas fontes
async function ler(method, params, tratar) { for (let i = 0; i < 3; i++) { const r = await acordo(method, params, tratar); if (r.valor != null) return r; await esp(1500); } return { valor: null, fontes: 0 }; }
const nao = [];
async function campo(nome, method, params, tratar) { const r = await ler(method, params, tratar); if (r.valor == null) { nao.push(`${nome}: sem acordo de duas fontes`); return null; } return { valor: r.valor, fontes: r.fontes }; }
const marca = (a) => ({ endereco: a, no_organismo: CONHECIDOS[a] ?? 'não registado no organismo' });

export async function lerTudo() {
  const lido = {};
  const raw = (to, sel, extra = '') => call(to, sel + extra);
  for (const k of ['payoutRecipient', 'platformReferrer', 'currency']) { const r = await campo(`moeda.${k}`, ...raw(MOEDA, SEL[k]), endereco); lido[k] = r && { ...marca(r.valor), fontes: r.fontes }; }
  const ow = await campo('moeda.owners', ...raw(MOEDA, SEL.owners), listaEnderecos);
  lido.owners = ow ? ow.valor.split(',').map((a) => ({ ...marca(a), fontes: ow.fontes })) : [];
  const pay = lido.payoutRecipient?.endereco;
  const carteira = { endereco: pay };
  if (pay) {
    const cod = await campo('carteira_de_pagamento.codigo', 'eth_getCode', [pay, 'latest'], (h) => (h.length - 2) / 2 + ':' + h.slice(0, 22));
    if (cod) { const [n, pre] = cod.valor.split(':'); carteira.codigo = { bytes: Number(n), tipo: pre === '0x363d3d373d3d363d7f36' ? 'proxy ERC-1967 (slot de implementação)' : 'outro', fontes: cod.fontes }; }
    const imp = await campo('carteira_de_pagamento.implementacao', 'eth_getStorageAt', [pay, SLOT_1967, 'latest'], endereco); if (imp) carteira.implementacao = { endereco: imp.valor, fontes: imp.fontes };
    const cnt = await campo('carteira_de_pagamento.ownerCount', ...raw(pay, SEL.ownerCount), (h) => Number(BigInt(h)));
    if (cnt) { carteira.dono_count = { valor: cnt.valor, fontes: cnt.fontes }; carteira.donos = [];
      for (let i = 0; i < cnt.valor; i++) { const o = await campo(`carteira_de_pagamento.ownerAtIndex(${i})`, ...raw(pay, SEL.ownerAtIndex, i.toString(16).padStart(64, '0')), bytesEndereco); if (o) carteira.donos.push({ indice: i, ...marca(o.valor), fontes: o.fontes }); } }
    if (carteira.implementacao) { const ep = await campo('implementacao.entryPoint', ...raw(carteira.implementacao.endereco, SEL.entryPoint), endereco); if (ep) carteira.entry_point = { endereco: ep.valor, fontes: ep.fontes }; }
    const eth = await campo('carteira_de_pagamento.saldo_eth_wei', 'eth_getBalance', [pay, 'latest'], (h) => BigInt(h).toString());
    const saldos = { eth_wei: eth && { valor: eth.valor, fontes: eth.fontes } };
    for (const [nome, tok, dec] of [['USDC', USDC, 6], ['ZORA', lido.currency?.endereco, 18], ['VALIUM', MOEDA, 18]]) { if (!tok) continue; const s = await campo(`carteira_de_pagamento.saldo_${nome}`, ...raw(tok, SEL.balanceOf, pad(pay)), (h) => BigInt(h).toString()); saldos[nome] = s && { raw: s.valor, decimais: dec, fontes: s.fontes }; }
    carteira.saldos_lidos = saldos;
  }
  const donosDaMoeda = [];
  for (const o of lido.owners) { const c = await campo(`owner_da_moeda.codigo(${o.endereco.slice(0, 8)})`, 'eth_getCode', [o.endereco, 'latest'], (h) => (h.length - 2) / 2); donosDaMoeda.push({ endereco: o.endereco, bytes_de_codigo: c && { valor: c.valor, fontes: c.fontes } }); }
  return { moeda: { contrato: MOEDA, ...lido }, carteira_de_pagamento: carteira, owners_da_moeda: donosDaMoeda };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  const lido = await lerTudo();
  const out = {
    schema: 'orum-zora-valium/v1', rede: { nome: 'Base', chain_id: 8453 }, lido_em_utc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    palavra_de_unum: 'Unum, 23/11/2026, ao link zora.co/@valium e à proposta concreta de ler o que está por trás do perfil: "Eu autorizo ora"',
    fontes_rpc: RPCS,
    ...lido,
    exibido_pela_zora: { estado: 'capturado num Chromium a 23/11/2026, NÃO verificado; este script não chama a Zora', perfil: '$valium', descricao: '0001sensations', capitalizacao: '$3,13k', posts: '3,7k', seguidores: 540, a_seguir: 100, moeda_do_perfil_nos_dados_da_zora: MOEDA, carteira_ligada_ao_perfil_nos_dados_da_zora: '0xbb828bfcb77fe788426b99d91b5219cddad3f277' },
    leitura: 'A moeda tem dois owners (a própria carteira de pagamento e uma segunda carteira sem código, 0xbb82…) e os pagamentos do criador (payoutRecipient) vão para a carteira de pagamento, uma carteira inteligente de dois donos: a MetaMask de Unum (0x2ef8…) e essa segunda carteira. A chave da MetaMask é de Unum: a ORA não a tem nem assina com ela, por isso estes pagamentos não passam pelos executores do organismo. Leitura da ORA, não palavra de Unum.',
    nao_verificado: [...nao, 'quem controla a carteira 0xbb82…f277 (só Unum o sabe; não está registada no organismo)', 'se a interface da carteira de pagamento é a da Coinbase Smart Wallet (a interface coincide, o código-fonte não foi lido)', 'tudo o que a Zora mostra no ecrã (capitalização, posts, seguidores, preços dos posts)', 'preço, liquidez, procura, detentores e receitas de criador por levantar', 'se este VALIUM da Base é o mesmo projecto que o VALIUM da Ethereum (identity/valium.json)'],
    nao_afirma: ['preço', 'liquidez', 'procura', 'receita', 'lastro', 'rendimento'],
    truth_machine: { move_fundos: false, escreve_na_cadeia: false, toca_na_zora: false, promete_receita: false, classifica: false },
    verificador: 'npm run zora-valium:verify',
  };
  const dest = process.argv[2] ?? 'token/zora-valium-2026-11-23.json';
  fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
  console.log(dest, '| donos', out.carteira_de_pagamento.donos?.map((d) => d.endereco.slice(0, 8)).join(','), '| nao_verificado', nao.length);
}
