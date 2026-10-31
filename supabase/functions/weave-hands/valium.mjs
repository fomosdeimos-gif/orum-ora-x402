// @weave_hands_valium · lógica pura (sem rede, sem Deno): constantes do registo, chamadas eth_call e a regra de concordância.
// Fonte do registo: identity/valium.json. O verificador (scripts/verify-weave-hands-valium.mjs) confere que são iguais.

export const CONTRATOS = {
  ethereum: { chainId: 1, contrato: '0xD287E77989F7191989901361754d02D8e00E1D1A', papel: 'raiz histórica do nome' },
  base: { chainId: 8453, contrato: '0x37f70Bccdc2125346a7542fe6e7fc70e33421635', papel: 'contrato posterior e distinto; vestígio sem função nova' },
};
// Carteiras do organismo (CLAUDE.md): sagrada antiga, operacional e sagrada nova (MetaMask).
export const CARTEIRAS = [
  { papel: 'sagrada_antiga', endereco: '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5' },
  { papel: 'operacional', endereco: '0x89460d9e0590559e63860197dfe2ac648A753584' },
  { papel: 'sagrada_nova_metamask', endereco: '0x2ef8cfB97EcCcf7C62f551639fe6dB79022d0d8C' },
];
export const RPCS = {
  // Lidas a 31/10/2026 com a chamada addr() do ENS: publicnode, tenderly, drpc, blastapi e mevblocker respondem; cloudflare dá erro interno,
  // 1rpc.io está no limite do plano e llamarpc falha o TLS (525). As três primeiras são as que se perguntam sempre; as outras são reserva.
  ethereum: ['https://ethereum-rpc.publicnode.com', 'https://gateway.tenderly.co/public/mainnet', 'https://eth.drpc.org', 'https://eth-mainnet.public.blastapi.io', 'https://rpc.mevblocker.io', 'https://1rpc.io/eth', 'https://cloudflare-eth.com'],
  base: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://1rpc.io/base', 'https://base.llamarpc.com'],
};
export const ENS = {
  nome: '0001sensations.eth',
  registo: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
  // namehash('0001sensations.eth'); conferido contra um keccak256 independente no verificador do repositório
  namehash: '9370828b272731cc697738aca49981b50607b08f9a4495d0b00282c26f206c40',
};
export const DECIMAIS = 18;
export const MAX_RPC_POR_PERGUNTA = 3;
export const MIN_FONTES = 2;

export const ehEndereco = (s) => typeof s === 'string' && /^0x[0-9a-fA-F]{40}$/.test(s);

export function chamadaTotalSupply(contrato) {
  return { to: contrato.toLowerCase(), data: '0x18160ddd' };
}
export function chamadaBalanceOf(contrato, carteira) {
  if (!ehEndereco(carteira)) throw new Error('endereco_invalido');
  return { to: contrato.toLowerCase(), data: '0x70a08231' + carteira.slice(2).toLowerCase().padStart(64, '0') };
}
export function chamadaResolver() {
  return { to: ENS.registo.toLowerCase(), data: '0x0178b8bf' + ENS.namehash };
}
export function chamadaAddr(resolver) {
  if (!ehEndereco(resolver)) throw new Error('endereco_invalido');
  return { to: resolver.toLowerCase(), data: '0x3b3b57de' + ENS.namehash };
}

// Uma palavra de 32 bytes em hex (0x + 64) -> bigint; qualquer outra forma é recusada.
export function lerUint(hex) {
  if (typeof hex !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hex)) throw new Error('resposta_invalida');
  return BigInt(hex);
}
export function lerEndereco(hex) {
  if (typeof hex !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hex)) throw new Error('resposta_invalida');
  if (!/^0x0{24}/.test(hex)) throw new Error('resposta_invalida');
  const e = '0x' + hex.slice(26);
  return /^0x0{40}$/.test(e) ? null : e;
}
export function formatar(valor, decimais = DECIMAIS) {
  const s = valor.toString().padStart(decimais + 1, '0');
  const i = s.slice(0, s.length - decimais), f = s.slice(s.length - decimais).replace(/0+$/, '');
  return f ? `${i}.${f}` : i;
}

// Regra de concordância: um valor só é "verificado" se pelo menos DUAS fontes independentes dão o mesmo valor
// e nenhuma dá outro. Uma só fonte é dita fonte_unica; valores diferentes são dito discordam e nunca se escolhe um.
export function concordar(leituras) {
  const ok = leituras.filter((l) => l && l.ok && typeof l.valor === 'bigint');
  const falhas = leituras.filter((l) => !(l && l.ok));
  const distintos = new Set(ok.map((l) => l.valor.toString()));
  if (ok.length === 0) return { estado: 'sem_leitura', valor: null, fontes_ok: 0, fontes_falhadas: falhas.length };
  if (distintos.size > 1) return { estado: 'discordam', valor: null, fontes_ok: ok.length, fontes_falhadas: falhas.length };
  const estado = ok.length >= 2 ? 'concordam' : 'fonte_unica';
  return { estado, valor: ok[0].valor, fontes_ok: ok.length, fontes_falhadas: falhas.length };
}
// Perguntam-se primeiro MAX_RPC_POR_PERGUNTA fontes; só se não deram duas leituras válidas é que se pergunta também às restantes.
// Assim uma fonte em baixo (por exemplo 1rpc.io, no limite do plano) deixa de empurrar o valor para fonte_unica, sem perguntar a mais por rotina.
export function precisaMaisFontes(leituras) { return leituras.filter((l) => l && l.ok).length < MIN_FONTES; }
export function verificado(c) { return c.estado === 'concordam'; }
