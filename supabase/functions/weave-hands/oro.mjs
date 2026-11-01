// @weave_hands_oro · lógica pura (sem rede, sem Deno): o registo do ORO (Base) e as chamadas eth_call.
// Fonte do registo: token/oro.json. O verificador (scripts/verify-weave-hands-oro.mjs) confere que são iguais.
// A regra de concordância e as fontes RPC são as de ./valium.mjs (uma só regra para o organismo).
import { ehEndereco } from './valium.mjs';

export const ORO = { chainId: 8453, contrato: '0xd859c01F11C273641F765509a005F7F2A69Dc4bD', decimais: 0 };
// Registo de token/oro.json (30/08/2026): uma unidade com Unum (sagrada antiga da Base) e uma imóvel no próprio contrato.
export const UNIDADES = [
  { papel: 'unum', endereco: '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5', esperado: 1n },
  { papel: 'contrato', endereco: '0xd859c01F11C273641F765509a005F7F2A69Dc4bD', esperado: 1n },
];
export const SUPPLY_ESPERADO = 2n;

export function chamadaDecimals() {
  return { to: ORO.contrato.toLowerCase(), data: '0x313ce567' };
}
// "Coincide com o registo" só se diz de um valor verificado (duas fontes iguais); de outro modo é null (não se sabe).
export function coincide(c, esperado) {
  if (!c || c.estado !== 'concordam' || typeof c.valor !== 'bigint') return null;
  return c.valor === esperado;
}
export { ehEndereco };
