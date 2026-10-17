'use strict';
// ORA · escolha do facilitador x402 para a via directa da Vercel. Não é uma função (prefixo _).
//
// Ordem: 1) facilitador da Coinbase (CDP), se o projecto tiver CDP_API_KEY_ID e CDP_API_KEY_SECRET (segredos de
// Unum; a ORA nunca os lê); 2) um facilitador público, sem conta nem chave, SÓ se ele anunciar em /supported que
// liquida a Base mainnet (eip155:8453) com o esquema "exact" do x402 v2; 3) nenhum: a via directa aceita só
// prova por transactionHash, como antes.
//
// Os facilitadores públicos são configuráveis por ORUM_FACILITATOR_URL (não é segredo), uma lista separada por
// vírgulas, por ordem de preferência: vazio, "off", "0", "false" ou "none" desliga-os. Os valores por omissão
// vieram de pesquisa e NÃO foram verificados a partir do sandbox (sem rede); é por isso que nunca se envia um
// pagamento sem a sondagem de /supported a passar primeiro. As sondagens fazem-se em paralelo e vale o primeiro,
// por ordem, que anunciar a Base mainnet.
//
// O que o facilitador público vê: a autorização assinada (que fixa o destino e o valor) e os requisitos de
// pagamento. Não consegue redirigir o dinheiro (a assinatura fixa o `to`) e a entrega só acontece depois de a
// transferência aparecer na Base por RPC nosso (api/_x402-directo.js).
const { createCdp } = require('./_cdp');

const URLS_PADRAO = ['https://facilitator.payai.network', 'https://facilitator.mogami.tech'];
const URL_PUBLICO_PADRAO = URLS_PADRAO.join(',');
const REDE = 'eip155:8453';
const TTL_OK_MS = 10 * 60 * 1000;
const TTL_FALHA_MS = 90 * 1000;
const SONDA_MS = 2500;
const CHAMADA_MS = 4500;

// Uma URL aceite: só https, sem credenciais, sem query nem fragmento.
function urlSegura(bruto) {
  const u = String(bruto).trim().replace(/\/+$/, '');
  return /^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{2,5})?(\/[A-Za-z0-9._~-]+)*$/i.test(u) ? u : null;
}
// Lista de URLs aceites, por ordem; [] se desligado ou se nenhuma for segura.
function urlsPublicas(env) {
  const bruto = String(env.ORUM_FACILITATOR_URL ?? URL_PUBLICO_PADRAO).trim();
  if (bruto === '' || /^(off|0|false|none)$/i.test(bruto)) return [];
  const vistas = new Set();
  return bruto.split(',').map(urlSegura).filter((u) => u && !vistas.has(u) && vistas.add(u));
}

function anunciaBaseMainnet(json) {
  const kinds = Array.isArray(json?.kinds) ? json.kinds : [];
  return kinds.some((k) => k && k.x402Version === 2 && k.scheme === 'exact' && k.network === REDE);
}

function createFacilitadorPublico({ env = process.env, fetchFn = (...a) => fetch(...a), now = () => Date.now() } = {}) {
  const urls = urlsPublicas(env);
  let cache = null; // { url (o escolhido ou null), ate }
  async function sondar(base) {
    try {
      const r = await fetchFn(`${base}/supported`, { method: 'GET', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(SONDA_MS) });
      if (r.status !== 200) return false;
      return anunciaBaseMainnet(await r.json().catch(() => null));
    } catch { return false; }
  }
  return {
    urls,
    get url() { return cache?.url ?? null; },
    async pronto() {
      if (!urls.length) return false;
      if (cache && now() < cache.ate) return Boolean(cache.url);
      const oks = await Promise.all(urls.map(sondar));
      const url = urls.find((_, i) => oks[i]) ?? null;
      cache = { url, ate: now() + (url ? TTL_OK_MS : TTL_FALHA_MS) };
      return Boolean(url);
    },
    // kind: 'verify' | 'settle'. Devolve { status, json } ou { erro }. Nunca lança; nunca envia sem sondagem positiva.
    async chamar(kind, paymentPayload, paymentRequirements) {
      if (kind !== 'verify' && kind !== 'settle') return { erro: 'operacao invalida' };
      if (!(await this.pronto())) return { erro: 'facilitador publico nao anunciou a Base mainnet' };
      try {
        const r = await fetchFn(`${cache.url}/${kind}`, {
          method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ x402Version: 2, paymentPayload, paymentRequirements }),
          signal: AbortSignal.timeout(CHAMADA_MS),
        });
        return { status: r.status, json: await r.json().catch(() => ({})) };
      } catch (e) { return { erro: String((e && e.name === 'TimeoutError') ? 'tempo esgotado' : (e && e.message) || e).slice(0, 120) }; }
    },
  };
}

function createFacilitador({ env = process.env, fetchFn, now, cdp = createCdp({ env, ...(fetchFn ? { fetchFn } : {}), ...(now ? { now } : {}) }), publico = createFacilitadorPublico({ env, ...(fetchFn ? { fetchFn } : {}), ...(now ? { now } : {}) }) } = {}) {
  return {
    // compatibilidade com o cliente CDP: verdadeiro só se o CDP estiver configurado
    get configurado() { return Boolean(cdp.configurado); },
    // 'cdp' | 'publico' | false
    async pronto() {
      if (cdp.configurado) return 'cdp';
      return (await publico.pronto()) ? 'publico' : false;
    },
    async chamar(kind, paymentPayload, paymentRequirements, resourceUrl) {
      if (cdp.configurado) return cdp.chamar(kind, paymentPayload, paymentRequirements, resourceUrl);
      return publico.chamar(kind, paymentPayload, paymentRequirements);
    },
  };
}

module.exports = { createFacilitador, createFacilitadorPublico, anunciaBaseMainnet, urlsPublicas, urlSegura, URL_PUBLICO_PADRAO, URLS_PADRAO, REDE, TTL_OK_MS, TTL_FALHA_MS };
