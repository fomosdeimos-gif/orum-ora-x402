// Verifica que o openapi.json descreve os quatro serviços de leitura (oraculo, campo, sedimento, kernel) com o preço,
// o «para quê» e o glossário que o código diz, e que o llms.txt põe o que se compra, com preços, antes do contexto do
// organismo, com um resumo em inglês; e que cada mentira é apanhada. Sem rede.
// Unum, 27/10/2026: "Eu autorizo ORA", proposta P7 (lacunas L4, L10 e L11; livros 1098 e 1099).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const directa = require('../api/_x402-directo.js');
const carteira = require('../api/_carteira.js');
const ler = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const origemSrc = ler('supabase/functions/ora-x402/index.ts');
const licSrc = ler('supabase/functions/ora-licenca/index.ts');

const paraQue = (k) => origemSrc.match(new RegExp(`\\n  ${k}: '([^']*)',`))?.[1];
const precoOrigem = (k) => origemSrc.match(new RegExp(`${k}: \\{ key: '${k}', sku: '[^']+', amountUsdc: '([0-9.]+)'`))?.[1];
const precoLic = (k) => licSrc.match(new RegExp(`${k}: \\{ key: '${k}', sku: '[^']+', usdc: '([0-9.]+)'`))?.[1];
const G = directa.GLOSSARIO;
const PROMESSA = /garant|guarantee|vais ganhar|receita certa|valor assegurado|reembolso garantido/i;

export function verificar({ spec, llms }) {
  const erros = []; const x = (m) => erros.push(m);
  const op = (p) => spec.paths?.[p]?.get;
  const servicos = {
    oraculo: { preco: directa.TIERS.oraculo.usdc, pq: directa.legibilidade(directa.TIERS.oraculo, 'https://ora-x402-gateway.vercel.app').para_que },
    campo: { preco: directa.TIERS.campo.usdc, pq: paraQue('campo') },
    sedimento: { preco: precoOrigem('sedimento'), pq: paraQue('sedimento') },
    kernel: { preco: precoOrigem('kernel'), pq: paraQue('kernel') },
  };
  for (const [k, s] of Object.entries(servicos)) {
    const o = op('/' + k);
    if (!o) { x(`openapi: falta /${k}`); continue; }
    if (!s.preco || !s.pq) { x(`código: não consegui ler preço ou «para quê» de ${k}`); continue; }
    if (o['x-payment-info']?.price?.amount !== s.preco) x(`openapi: preço de /${k} difere do código (${s.preco})`);
    const d = o.description || '';
    if (!d.includes(s.pq)) x(`openapi: a descrição de /${k} não traz o «para quê» do código`);
    if (!/Procura externa: n[aã]o comprovada/.test(d)) x(`openapi: /${k} não diz que a procura externa não está comprovada`);
    for (const g of ['dia', 'sigma', 'epoca']) if (!d.includes(G[g])) x(`openapi: a descrição de /${k} não traz o glossário de ${g}`);
    if (!/payTo\) vem sempre no 402/.test(d)) x(`openapi: /${k} não manda ler o payTo no 402`);
    if (PROMESSA.test(d)) x(`openapi: /${k} promete algo`);
    if ((k === 'sedimento' || k === 'kernel') && !d.includes(carteira.RECEBIMENTO_EDGE)) x(`openapi: /${k} não cita a sagrada antiga lida no 402`);
    const r200 = o.responses?.['200']?.content?.['application/json']?.schema;
    if (!r200?.required?.includes('campo')) x(`openapi: a resposta de /${k} não exige campo`);
    if (!o.responses?.['402']) x(`openapi: /${k} sem 402`);
    if (k === 'sedimento' && !r200?.properties?.sedimento) x('openapi: /sedimento sem o campo sedimento na resposta');
    if (k === 'kernel' && !r200?.properties?.kernel) x('openapi: /kernel sem o campo kernel na resposta');
    if ((k === 'oraculo' || k === 'campo')) {
      const c = r200?.properties?.campo;
      if (c?.properties?.epoca?.enum?.join() !== 'CRISTAL,ETERNIDADE') x(`openapi: o campo de /${k} não tem a época tipada`);
      if (c?.properties?.dia?.type !== 'integer' || c?.properties?.sigma?.type !== 'number') x(`openapi: o campo de /${k} não tem dia e sigma tipados`);
    }
  }
  // as licenças mantêm os preços do código
  for (const k of ['consulta', 'editorial', 'treino']) if (op('/licenca/' + k)?.['x-payment-info']?.price?.amount !== precoLic(k)) x(`openapi: preço de /licenca/${k} difere do código`);
  if (!/^2\.(1[7-9]|[2-9]\d)\./.test(spec.info?.version || '')) x('openapi: versão não subiu para 2.17 ou mais');

  // llms.txt
  const linhas = llms.split('\n');
  const iCompra = linhas.findIndex((l) => l.startsWith('## O que se compra'));
  const iQuem = linhas.findIndex((l) => l.startsWith('## Quem recebe o pagamento'));
  const iEstado = linhas.findIndex((l) => l.startsWith('## Estado observado'));
  if (iCompra < 0) x('llms.txt: falta a secção «O que se compra»');
  else {
    if (iCompra + 1 > 15) x(`llms.txt: «O que se compra» está na linha ${iCompra + 1}, depois da 15`);
    if (iQuem >= 0 && iCompra > iQuem) x('llms.txt: «O que se compra» tem de vir antes de «Quem recebe o pagamento»');
    if (iEstado >= 0 && iCompra > iEstado) x('llms.txt: «O que se compra» tem de vir antes do estado observado');
    const fim = linhas.findIndex((l, i) => i > iCompra && l.startsWith('## '));
    const sec = linhas.slice(iCompra, fim < 0 ? undefined : fim).join('\n');
    const todos = { ...Object.fromEntries(Object.entries(servicos).map(([k, s]) => [k, s.preco])), 'licenca/consulta': precoLic('consulta'), 'licenca/editorial': precoLic('editorial'), 'licenca/treino': precoLic('treino') };
    for (const [k, preco] of Object.entries(todos)) {
      const linha = sec.split('\n').find((l) => l.includes(`](https://ora-x402-gateway.vercel.app/${k})`));
      if (!linha) { x(`llms.txt: a secção não lista /${k}`); continue; }
      if (!new RegExp(`\\]\\(https://ora-x402-gateway\\.vercel\\.app/${k}\\) ${preco.replace('.', '\\.')}[:, ]`).test(linha) && !(k.startsWith('licenca/') && sec.includes(`/${k}) ${preco}`))) x(`llms.txt: preço de /${k} difere do código (${preco})`);
    }
    if (!/How to buy \(English\)/.test(sec)) x('llms.txt: falta o resumo em inglês');
    if (!/pay USDC on Base/.test(sec) || !/Read payTo in the 402 before paying/.test(sec)) x('llms.txt: o resumo em inglês tem de dizer como pagar e mandar ler o payTo');
    if (!/procura externa: n[aã]o comprovada/i.test(sec)) x('llms.txt: a secção não diz que a procura externa não está comprovada');
    if (!/n[aã]o é dado de mercado/i.test(sec)) x('llms.txt: a secção não diz que não é dado de mercado');
    if (PROMESSA.test(sec)) x('llms.txt: a secção promete algo');
  }
  return erros;
}

const real = { spec: JSON.parse(ler('openapi.json')), llms: ler('llms.txt') };
assert.deepEqual(verificar(real), [], 'o real devia passar: ' + verificar(real).join('; '));
let n = 0;
const clone = (o) => JSON.parse(JSON.stringify(o));
const falhaSpec = (nome, mexe) => { const c = { spec: clone(real.spec), llms: real.llms }; mexe(c.spec); assert.ok(verificar(c).length > 0, `devia falhar: ${nome}`); n++; };
const falhaLlms = (nome, troca) => { const t = troca(real.llms); assert.notEqual(t, real.llms, `a mentira «${nome}» não mudou nada`); assert.ok(verificar({ spec: real.spec, llms: t }).length > 0, `devia falhar: ${nome}`); n++; };
const get = (s, k) => s.paths['/' + k].get;
falhaSpec('falta /sedimento', (s) => { delete s.paths['/sedimento']; });
falhaSpec('falta /kernel', (s) => { delete s.paths['/kernel']; });
falhaSpec('preço do kernel difere', (s) => { get(s, 'kernel')['x-payment-info'].price.amount = '2.00'; });
falhaSpec('preço do oráculo difere', (s) => { get(s, 'oraculo')['x-payment-info'].price.amount = '0.5'; });
falhaSpec('preço da licença difere', (s) => { get(s, 'licenca/treino')['x-payment-info'].price.amount = '1'; });
falhaSpec('o sedimento perde o «para quê»', (s) => { get(s, 'sedimento').description = 'Histórico.'; });
falhaSpec('o campo perde o glossário do sigma', (s) => { get(s, 'campo').description = get(s, 'campo').description.replace(directa.GLOSSARIO.sigma, 'sigma'); });
falhaSpec('o oráculo deixa de dizer que a procura não está comprovada', (s) => { get(s, 'oraculo').description = get(s, 'oraculo').description.replace('Procura externa: não comprovada.', 'Procura externa: comprovada.'); });
falhaSpec('o kernel promete', (s) => { get(s, 'kernel').description += ' Retorno garantido.'; });
falhaSpec('o sedimento deixa de mandar ler o payTo', (s) => { get(s, 'sedimento').description = get(s, 'sedimento').description.replace('vem sempre no 402', 'é fixo'); });
falhaSpec('o kernel cita outra carteira', (s) => { get(s, 'kernel').description = get(s, 'kernel').description.replace(carteira.RECEBIMENTO_EDGE, carteira.RECEBIMENTO); });
falhaSpec('a época do campo deixa de ser tipada', (s) => { delete get(s, 'campo').responses['200'].content['application/json'].schema.properties.campo.properties.epoca.enum; });
falhaSpec('o sigma passa a texto', (s) => { get(s, 'oraculo').responses['200'].content['application/json'].schema.properties.campo.properties.sigma = { type: 'string' }; });
falhaSpec('o sedimento perde a lista na resposta', (s) => { delete get(s, 'sedimento').responses['200'].content['application/json'].schema.properties.sedimento; });
falhaSpec('o kernel perde o 402', (s) => { delete get(s, 'kernel').responses['402']; });
falhaSpec('a versão não subiu', (s) => { s.info.version = '2.16.0'; });
falhaLlms('a secção desce para depois do contexto', (t) => { const l = t.split('\n'); const i = l.findIndex((x) => x.startsWith('## O que se compra')); const j = l.findIndex((x, k) => k > i && x.startsWith('## ')); const bloco = l.splice(i, j - i); const m = l.findIndex((x) => x.startsWith('## Desambiguação')); l.splice(m, 0, ...bloco); return l.join('\n'); });
falhaLlms('a secção perde o resumo em inglês', (t) => t.replace('How to buy (English)', 'Como comprar'));
falhaLlms('o preço do kernel difere', (t) => t.replace('/kernel) 3.00:', '/kernel) 2.00:'));
falhaLlms('o preço do oráculo difere', (t) => t.replace('/oraculo) 0.161:', '/oraculo) 0.2:'));
falhaLlms('falta o sedimento na secção', (t) => t.replace('- [/sedimento](https://ora-x402-gateway.vercel.app/sedimento) 1.00: as 15 marcas D mais recentes do registo interno.\n', ''));
falhaLlms('a secção deixa de dizer que a procura não está comprovada', (t) => t.replace('procura externa: não comprovada. Glossário', 'procura externa: comprovada. Glossário'));
falhaLlms('a secção promete', (t) => t.replace('No promise of revenue, refund or demand.', 'Guaranteed revenue.'));
falhaLlms('o resumo deixa de mandar ler o payTo', (t) => t.replace('Read payTo in the 402 before paying;', 'Pay anyone;'));
console.log(JSON.stringify({ verified: true, casos_de_mentira: n }));
