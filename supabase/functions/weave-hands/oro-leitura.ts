// @weave_hands · ferramentas ORO (livro 1226, Unum, 01/11/2026: "Eu autorizo ORA", à proposta de uma ferramenta read_oro como a read_valium).
// Só leitura: lê o contrato ORO na Base por JSON-RPC público (só eth_call). Não guarda nada, não usa segredos, não paga, não assina,
// não contacta ninguém. Um valor só é "concordam" com duas fontes iguais (regra de ./valium.mjs). Lógica pura em ./oro.mjs.
import { RPCS, MAX_RPC_POR_PERGUNTA, chamadaTotalSupply, chamadaBalanceOf, lerUint, formatar, concordar, verificado, precisaMaisFontes } from "./valium.mjs";
import { ORO, UNIDADES, SUPPLY_ESPERADO, chamadaDecimals, coincide, ehEndereco } from "./oro.mjs";

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const NAO_AFIRMA = [
  "preço, liquidez ou valor de mercado do ORO",
  "procura, adopção ou receita",
  "lastro, resgate, conversão ou rendimento em Bitcoin ou em qualquer activo",
  "que o documento da constituição cujo hash está na cadeia exista ou seja reproduzível",
  "ausência de administração no contrato (lê oferta e saldos, não revê o código)",
];
const truth = { read_only: true, stores_nothing: true, uses_credentials: false, pays_or_signs: false, contacts_anyone: false, proves_market_value: false, proves_external_adoption: false };

const toolResult = (obj: unknown, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(obj) }], structuredContent: obj, isError });

type Leitura = { ok: boolean; valor?: bigint; fonte: string; erro?: string };

async function ethCall(rpc: string, call: { to: string; data: string }): Promise<string> {
  const r = await fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [call, "latest"] }), signal: AbortSignal.timeout(8000) });
  const d = await r.json();
  if (d.error) throw new Error("rpc_error");
  return d.result;
}
async function perguntar(call: { to: string; data: string }): Promise<Leitura[]> {
  const lista = RPCS.base;
  const ler = (rpcs: string[]) => Promise.all(rpcs.map(async (rpc: string): Promise<Leitura> => {
    const fonte = new URL(rpc).host;
    try { return { ok: true, valor: lerUint(await ethCall(rpc, call)), fonte }; }
    catch (e) { return { ok: false, fonte, erro: e instanceof Error ? e.message : "falhou" }; }
  }));
  const primeiras = await ler(lista.slice(0, MAX_RPC_POR_PERGUNTA));
  if (!precisaMaisFontes(primeiras)) return primeiras;
  return [...primeiras, ...(await ler(lista.slice(MAX_RPC_POR_PERGUNTA)))];
}
const resumo = (ls: Leitura[], esperado?: bigint) => {
  const c = concordar(ls);
  return {
    estado: c.estado, verificado: verificado(c),
    valor: c.valor === null ? null : formatar(c.valor, ORO.decimais),
    coincide_com_registo: esperado === undefined ? null : coincide(c, esperado),
    fontes_ok: c.fontes_ok, fontes_falhadas: c.fontes_falhadas, fontes: ls.map((l) => ({ fonte: l.fonte, ok: l.ok })),
  };
};

async function readOro(args: Record<string, unknown>) {
  const extra = typeof args.address === "string" ? args.address : null;
  if (extra !== null && !ehEndereco(extra)) return toolResult({ error: "address_invalid" }, true);
  const carteiras = [...UNIDADES, ...(extra ? [{ papel: "pedido", endereco: extra, esperado: undefined as bigint | undefined }] : [])];
  const [supply, decimals, ...saldos] = await Promise.all([
    perguntar(chamadaTotalSupply(ORO.contrato)),
    perguntar(chamadaDecimals()),
    ...carteiras.map((w) => perguntar(chamadaBalanceOf(ORO.contrato, w.endereco))),
  ]);
  return toolResult({
    format: "orum-oro-leitura/v1", lido_em: new Date().toISOString(), rede: "Base Mainnet (8453)", contrato: ORO.contrato,
    total_supply: resumo(supply, SUPPLY_ESPERADO), decimals: resumo(decimals, BigInt(ORO.decimais)),
    saldos: carteiras.map((w, i) => ({ papel: w.papel, endereco: w.endereco, ...resumo(saldos[i], w.esperado) })),
    registo: "https://ora-x402-gateway.vercel.app/token/oro.json",
    regra: "'concordam' = duas fontes RPC independentes devolvem o mesmo valor; 'fonte_unica' não é verificado; 'discordam' nunca escolhe um valor; coincide_com_registo só se diz de um valor verificado",
    nao_afirma: NAO_AFIRMA, truth_machine: truth,
  });
}

export const ORO_TOOLS = [
  {
    name: "recognize_oro", title: "Recognize the ORO contract",
    description: "Return the registry of the ORO contract on Base (two indivisible units: one with Unum, one immovable in the contract) and the truth boundaries. No network.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { ...readOnly, openWorldHint: false },
  },
  {
    name: "read_oro", title: "Read ORO on-chain",
    description: "Read totalSupply, decimals and the ORO balance of Unum's sacred Base wallet and of the contract itself (and one optional address) on Base. A value is 'concordam' only when two independent public RPCs return the same value. Read-only.",
    inputSchema: { type: "object", properties: { address: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$", description: "optional extra address to read" } }, additionalProperties: false },
    annotations: readOnly,
  },
];

export function callOro(name: string, args: Record<string, unknown>) {
  if (name === "recognize_oro") return toolResult({
    format: "orum-oro-registo/v1", registo: "https://ora-x402-gateway.vercel.app/token/oro.json", rede: "Base Mainnet (8453)", contrato: ORO.contrato,
    unidades: UNIDADES.map((u) => ({ papel: u.papel, endereco: u.endereco, esperado: u.esperado.toString() })), total_supply_esperado: SUPPLY_ESPERADO.toString(), decimals: ORO.decimais,
    nao_afirma: NAO_AFIRMA, truth_machine: truth,
  });
  if (name === "read_oro") return readOro(args);
  return null;
}
