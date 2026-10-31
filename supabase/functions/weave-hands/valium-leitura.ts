// @weave_hands · ferramentas VALIUM (livro 1144, Unum, 29/10/2026: "cria um conector valium @ORUM Weave Hands").
// Só leitura: lê os dois contratos VALIUM por JSON-RPC público. Não guarda nada, não usa segredos, não paga, não assina,
// não contacta ninguém. Um valor só é "concordam" com duas fontes iguais. Lógica pura em ./valium.mjs.
import {
  CONTRATOS, CARTEIRAS, RPCS, ENS, DECIMAIS, MAX_RPC_POR_PERGUNTA, ehEndereco,
  chamadaTotalSupply, chamadaBalanceOf, chamadaResolver, chamadaAddr, lerUint, lerEndereco, formatar, concordar, verificado, precisaMaisFontes,
} from "./valium.mjs";

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const NAO_AFIRMA = [
  "preço, liquidez ou valor de mercado do VALIUM",
  "procura, adopção ou receita",
  "que os dois contratos VALIUM sejam equivalentes (não há ponte nem migração)",
  "titularidade legal de qualquer carteira",
  "controlo da chave de qualquer carteira",
];
const truth = { read_only: true, stores_nothing: true, uses_credentials: false, pays_or_signs: false, contacts_anyone: false, proves_market_value: false, proves_external_adoption: false };

const toolResult = (obj: unknown, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(obj) }], structuredContent: obj, isError });

type Leitura = { ok: boolean; valor?: bigint; palavra?: string; fonte: string; erro?: string };

async function ethCall(rpc: string, call: { to: string; data: string }): Promise<string> {
  const r = await fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [call, "latest"] }), signal: AbortSignal.timeout(8000) });
  const d = await r.json();
  if (d.error) throw new Error("rpc_error");
  return d.result;
}
async function perguntar(cadeia: "ethereum" | "base", call: { to: string; data: string }): Promise<Leitura[]> {
  const lista = RPCS[cadeia];
  const ler = (rpcs: string[]) => Promise.all(rpcs.map(async (rpc: string): Promise<Leitura> => {
    const fonte = new URL(rpc).host;
    try { const palavra = await ethCall(rpc, call); return { ok: true, palavra, valor: lerUint(palavra), fonte }; }
    catch (e) { return { ok: false, fonte, erro: e instanceof Error ? e.message : "falhou" }; }
  }));
  const primeiras = await ler(lista.slice(0, MAX_RPC_POR_PERGUNTA));
  if (!precisaMaisFontes(primeiras)) return primeiras;
  return [...primeiras, ...(await ler(lista.slice(MAX_RPC_POR_PERGUNTA)))];
}
const resumo = (ls: Leitura[]) => {
  const c = concordar(ls);
  return { estado: c.estado, verificado: verificado(c), valor_wei: c.valor === null ? null : c.valor.toString(), valor: c.valor === null ? null : formatar(c.valor, DECIMAIS), fontes_ok: c.fontes_ok, fontes_falhadas: c.fontes_falhadas, fontes: ls.map((l) => ({ fonte: l.fonte, ok: l.ok })) };
};

async function lerEns() {
  const r1 = await perguntar("ethereum", chamadaResolver());
  const rs = concordar(r1.map((l) => ({ ok: l.ok, valor: l.ok ? lerUint(l.palavra!) : undefined })));
  if (rs.estado !== "concordam" && rs.estado !== "fonte_unica") return { nome: ENS.nome, estado: rs.estado, resolve_para: null, verificado: false };
  let resolver: string | null = null;
  try { resolver = lerEndereco("0x" + (rs.valor as bigint).toString(16).padStart(64, "0")); } catch { resolver = null; }
  if (!resolver) return { nome: ENS.nome, estado: "sem_resolver", resolve_para: null, verificado: false };
  const r2 = await perguntar("ethereum", chamadaAddr(resolver));
  const palavras = r2.filter((l) => l.ok).map((l) => l.palavra!.toLowerCase());
  const distintos = new Set(palavras);
  if (palavras.length === 0) return { nome: ENS.nome, estado: "sem_leitura", resolve_para: null, verificado: false };
  if (distintos.size > 1) return { nome: ENS.nome, estado: "discordam", resolve_para: null, verificado: false };
  let alvo: string | null = null;
  try { alvo = lerEndereco(palavras[0]); } catch { alvo = null; }
  return { nome: ENS.nome, estado: palavras.length >= 2 ? "concordam" : "fonte_unica", verificado: palavras.length >= 2, resolver, resolve_para: alvo, fontes_ok: palavras.length };
}

async function readValium(args: Record<string, unknown>) {
  const extra = typeof args.address === "string" ? args.address : null;
  if (extra !== null && !ehEndereco(extra)) return toolResult({ error: "address_invalid" }, true);
  const carteiras = [...CARTEIRAS, ...(extra ? [{ papel: "pedido", endereco: extra }] : [])];
  const cadeias = ["ethereum", "base"] as const;
  const [ens, ...resto] = await Promise.all([
    lerEns(),
    ...cadeias.map((c) => perguntar(c, chamadaTotalSupply(CONTRATOS[c].contrato))),
    ...cadeias.flatMap((c) => carteiras.map((w) => perguntar(c, chamadaBalanceOf(CONTRATOS[c].contrato, w.endereco)))),
  ]);
  const supply = { ethereum: resumo(resto[0]), base: resumo(resto[1]) };
  const saldos = cadeias.flatMap((c, i) => carteiras.map((w, j) => ({ cadeia: c, papel: w.papel, endereco: w.endereco, ...resumo(resto[2 + i * carteiras.length + j]) })));
  return toolResult({
    format: "orum-valium-leitura/v1", lido_em: new Date().toISOString(), contratos: CONTRATOS,
    total_supply: supply, saldos, ens,
    regra: "'concordam' = duas fontes RPC independentes devolvem o mesmo valor; 'fonte_unica' não é verificado; 'discordam' nunca escolhe um valor",
    nao_afirma: NAO_AFIRMA, truth_machine: truth,
  });
}

export const VALIUM_TOOLS = [
  {
    name: "recognize_valium", title: "Recognize the two VALIUM contracts",
    description: "Return the registry of the two VALIUM contracts (Ethereum root, Base later and distinct) and the truth boundaries. No network.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { ...readOnly, openWorldHint: false },
  },
  {
    name: "read_valium", title: "Read VALIUM on-chain",
    description: "Read totalSupply on both chains, the VALIUM balance of the organism wallets (and one optional address), and where 0001sensations.eth resolves. A value is 'concordam' only when two independent public RPCs return the same value. Read-only.",
    inputSchema: { type: "object", properties: { address: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$", description: "optional extra address to read" } }, additionalProperties: false },
    annotations: readOnly,
  },
];


export function callValium(name: string, args: Record<string, unknown>) {
  if (name === "recognize_valium") return toolResult({
    format: "orum-valium-registo/v1", registo: "https://ora-x402-gateway.vercel.app/identity/valium.json", contratos: CONTRATOS, carteiras_do_organismo: CARTEIRAS,
    decisao: "VALIUM permanece vestígio sem nova função atribuída; sem ponte, migração ou equivalência entre os dois contratos. Pagamentos e acesso usam USDC com x402.",
    nao_afirma: NAO_AFIRMA, truth_machine: truth,
  });
  if (name === "read_valium") return readValium(args);
  return null;
}
