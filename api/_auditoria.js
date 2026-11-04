// ORA · auditoria de descoberta na via directa (04/11/2026, livro 1341; Unum: "Eu autorizo").
// Porte de supabase/functions/ora-cdp-teste-payto-cdp para um módulo da Vercel (sem função nova: o plano Hobby admite 12).
// Lê o catálogo público de descoberta x402 (Bazaar) da Coinbase e diz se uma marca ou domínio aparece nele.
//
// Diferença para a versão do Supabase, dita: esta NÃO usa credenciais CDP. O endpoint
// GET api.cdp.coinbase.com/platform/v2/x402/discovery/resources respondeu 200 sem autenticação (lido a 04/11/2026),
// por isso não há segredo nenhum aqui.
//
// Dependências (independência de fornecedores): um único fornecedor, o catálogo da Coinbase. Se falhar, o resultado diz
// INDETERMINADO (primeira página) ou PARCIAL (páginas seguintes) e nunca "não indexado" sem varrimento completo.
// Não promete procura nem receita; "indexado" diz só que a cadeia de texto aparece num registo do catálogo.

const HOST = 'https://api.cdp.coinbase.com';
const CAMINHO = '/platform/v2/x402/discovery/resources';
const PAGINA = 1000;
const PARALELO = 6;
const ORCAMENTO_MS = 3000; // o plano Hobby corta aos 10 s e ainda ha a verificacao do pagamento; um varrimento completo faz-se com offset
const MARCA_MIN = 3;
const MARCA_MAX = 64;
const AMOSTRA_MAX = 5;

function marcaValida(texto) {
  if (typeof texto !== 'string') return null;
  const t = texto.trim();
  if (t.length < MARCA_MIN || t.length > MARCA_MAX) return null;
  if (/[\u0000-\u001f\u007f]/.test(t)) return null;
  return t;
}

function offsetValido(texto) {
  const n = Number.parseInt(String(texto ?? '0'), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10_000_000) : 0;
}

function urlDoItem(item) {
  const a = Array.isArray(item && item.accepts) ? item.accepts[0] : null;
  const u = (a && a.resource) || (item && item.resource);
  return typeof u === 'string' ? u.slice(0, 200) : null;
}

async function lerPagina(fetchFn, offset) {
  const r = await fetchFn(`${HOST}${CAMINHO}?limit=${PAGINA}&offset=${offset}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
  if (r.status !== 200) return { erro: `offset ${offset} devolveu ${r.status}` };
  let j;
  try { j = JSON.parse(await r.text()); } catch { return { erro: `offset ${offset}: resposta não é JSON` }; }
  if (!j || !Array.isArray(j.items)) return { erro: `offset ${offset}: sem lista de recursos` };
  const total = j.pagination && Number.isInteger(j.pagination.total) ? j.pagination.total : null;
  return { items: j.items, total };
}

async function auditar(marca, { offset = 0, fetchFn = globalThis.fetch, agora = () => Date.now(), orcamentoMs = ORCAMENTO_MS } = {}) {
  const t0 = agora();
  const agulha = marca.toLowerCase();
  let proximo = offset;
  let total = null;
  let lidos = 0;
  let com = 0;
  const amostra = [];
  let erro;

  const processar = (items) => {
    for (const item of items) {
      let s; try { s = JSON.stringify(item).toLowerCase(); } catch { continue; }
      if (s.includes(agulha)) { com++; const u = urlDoItem(item); if (u && amostra.length < AMOSTRA_MAX) amostra.push(u); }
    }
    lidos += items.length;
  };

  // Primeira página: dá o total e prova que o catálogo responde.
  let primeira;
  try { primeira = await lerPagina(fetchFn, proximo); } catch (e) { primeira = { erro: String((e && e.message) || e) }; }
  if (primeira.erro) erro = primeira.erro;
  else {
    total = primeira.total;
    processar(primeira.items);
    proximo += PAGINA;
    while (total !== null && proximo < total && agora() - t0 < orcamentoMs) {
      const offs = [];
      for (let i = 0; i < PARALELO && proximo + i * PAGINA < total; i++) offs.push(proximo + i * PAGINA);
      const res = await Promise.all(offs.map((o) => lerPagina(fetchFn, o).catch((e) => ({ erro: String((e && e.message) || e) }))));
      // Só se aceita cobertura contígua: pára na primeira página que falhou.
      let parou = false;
      for (let i = 0; i < res.length; i++) {
        if (res[i].erro) { erro = res[i].erro; parou = true; break; }
        processar(res[i].items);
        proximo = offs[i] + PAGINA;
      }
      if (parou) break;
    }
    if (total === null) erro = erro || 'o catálogo não indicou o total';
  }

  const completo = total !== null && proximo >= total && !erro;
  let veredicto;
  if (primeira.erro) veredicto = 'INDETERMINADO — o catálogo não respondeu; nada foi varrido';
  else if (com > 0) veredicto = `INDEXADO — "${marca}" aparece em ${com} recurso(s) do catálogo (${completo ? 'varrimento completo' : 'varrimento parcial'})`;
  else if (completo) veredicto = `NAO INDEXADO — catálogo varrido por completo (${total} recursos), zero registos com "${marca}"`;
  else veredicto = `PARCIAL — ${Math.min(proximo, total ?? proximo)} de ${total ?? '?'} recursos varridos, zero registos com "${marca}" até agora; repete com offset=${proximo}`;

  return {
    marca, offset_inicial: offset, total_no_catalogo: total, recursos_lidos: lidos, recursos_com_a_marca: com, amostra_de_recursos: amostra,
    proximo_offset: completo ? null : proximo, varrimento_completo: completo,
    percentagem_varrida: total ? Math.round((Math.min(proximo, total) / total) * 1000) / 10 : null,
    erro, veredicto,
    fonte: { host: 'api.cdp.coinbase.com', caminho: CAMINHO, credenciais: false },
    nota: 'A marca é procurada como texto, sem maiúsculas, em todo o registo de cada recurso: um termo curto ou comum (por exemplo "usdc") aparece em quase todos. O total do catálogo muda enquanto se varre.',
  };
}

module.exports = { auditar, marcaValida, offsetValido, HOST, CAMINHO, PAGINA, PARALELO, ORCAMENTO_MS, MARCA_MIN, MARCA_MAX };
