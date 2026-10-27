// Verifica os acrescentos de legibilidade da função ora-x402 (origem Supabase): o «para quê» honesto no 402 de
// campo/sedimento/kernel e o bloco do manifesto que aponta para /oraculo e /campo do gateway; e que accepts, preços e payTo
// não foram tocados. Lê o código (sem rede, sem base de dados) e prova-se com estragos propositados.
// Unum, 27/10/2026: "Eu autorizo ORA", proposta P6 (lacunas L3 e L13; livros 1096 e 1097).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const carteira = require('../api/_carteira.js');
const src = readFileSync(new URL('../supabase/functions/ora-x402/index.ts', import.meta.url), 'utf8');

const PRECOS = { campo: ['0.33', '330000n'], sedimento: ['1.00', '1000000n'], kernel: ['3.00', '3000000n'] };
const PROMESSA = /garant|vais ganhar|reembolso garantido|valor assegurado|receita certa/i;

export function verificar(t) {
  const erros = []; const x = (m) => erros.push(m);
  const pq = t.match(/const PARA_QUE: Record<TierKey, string> = \{([\s\S]*?)\n\};/)?.[1];
  if (!pq) { x('falta a constante PARA_QUE'); } else {
    for (const k of ['campo', 'sedimento', 'kernel']) {
      const linha = pq.split('\n').find((l) => l.trim().startsWith(`${k}:`)) || '';
      if (!linha) x(`PARA_QUE sem ${k}`);
      if (!/Procura externa: nao comprovada\./.test(linha)) x(`PARA_QUE.${k} tem de dizer que a procura externa nao esta comprovada`);
    }
    if (PROMESSA.test(pq)) x('PARA_QUE promete algo');
    if (!/15 marcas D/.test(pq) || !/limit=15/.test(t)) x('o sedimento tem de dizer 15 marcas e a consulta tem de ter limit=15');
    if (!/5 snapshots/.test(pq) || !/ora_kernel_snapshots', 'select=[^']*&order=created_at\.desc&limit=5'/.test(t)) x('o kernel tem de dizer 5 snapshots e a consulta tem de ter limit=5');
    if (/dado de mercado em tempo real|previsao de precos de mercado garantida/i.test(pq)) x('PARA_QUE vende dado de mercado');
  }
  const f = t.match(/function legibilidadeFor\(tier: Tier\) \{([^\n]*)\}/)?.[1] || '';
  if (!/para_que: PARA_QUE\[tier\.key\]/.test(f)) x('legibilidadeFor nao usa PARA_QUE');
  if (!/Nao e dado de mercado, nao e previsao de precos e nao promete valor, receita nem reembolso\./.test(f)) x('legibilidadeFor tem de recusar promessas');
  const pr = t.match(/function paymentRequired\(tier: Tier, origin: string\) \{\n([^\n]*)\n\}/)?.[1] || '';
  if (!/accepts: acceptsBlockFor\(tier, origin\), como_pagar:|accepts: acceptsBlockFor\(tier, origin\), legibilidade: legibilidadeFor\(tier\), como_pagar:/.test(pr)) x('o 402 deixou de usar acceptsBlockFor, ou a legibilidade esta fora do sitio');
  if (!/legibilidade: legibilidadeFor\(tier\), como_pagar: comoPagar\(tier\.amountUsdc/.test(pr)) x('o 402 nao traz a legibilidade');
  const ab = t.match(/function acceptsBlockFor\([\s\S]*?\n\}/)?.[0] || '';
  if (/legibilidade|para_que/.test(ab)) x('a legibilidade entrou em accepts');
  for (const [k, [usdc, atomic]] of Object.entries(PRECOS)) if (!new RegExp(`${k}: \\{ key: '${k}', sku: '[^']+', amountUsdc: '${usdc.replace('.', '\\.')}', amountAtomic: ${atomic}`).test(t)) x(`preco de ${k} mudou`);
  if (!t.includes(`const WALLET = '${carteira.RECEBIMENTO_EDGE}'`)) x('o payTo da origem difere de RECEBIMENTO_EDGE');
  const m = t.match(/servicos_via_directa: \{([\s\S]*?)\n    \},\n/)?.[1] || '';
  if (!m) x('o manifesto nao traz servicos_via_directa');
  else {
    for (const u of ['https://ora-x402-gateway.vercel.app/oraculo', 'https://ora-x402-gateway.vercel.app/campo', 'https://ora-x402-gateway.vercel.app/oraculo/eco', 'https://ora-x402-gateway.vercel.app/campo/eco']) if (!m.includes(`'${u}'`)) x(`servicos_via_directa sem ${u}`);
    if (!m.includes(carteira.RECEBIMENTO)) x('servicos_via_directa nao cita a carteira operacional actual de api/_carteira.js');
    if (!/vem sempre no 402 de cada URL/.test(m)) x('servicos_via_directa nao manda ler o payTo no 402');
    if (!/0\.161 USDC/.test(m) || !/0\.33 USDC/.test(m)) x('servicos_via_directa nao diz os precos');
    if (PROMESSA.test(m)) x('servicos_via_directa promete algo');
  }
  if (!/resources: \(Object\.values\(TIERS\) as Tier\[\]\)\.map\(\(tier\) => \(\{ resource: resourceUrl\(tier, origin\)/.test(t)) x('resources do manifesto foi alterado');
  return erros;
}

assert.deepEqual(verificar(src), [], 'o real devia passar: ' + verificar(src).join('; '));
let n = 0;
const falha = (nome, troca) => { const t = troca(src); assert.notEqual(t, src, `a mentira «${nome}» nao mudou nada`); assert.ok(verificar(t).length > 0, `devia falhar: ${nome}`); n++; };
falha('sedimento deixa de dizer que a procura nao esta comprovada', (t) => t.replace(/(sedimento: 'Devolve as 15[^\n]*)Procura externa: nao comprovada\./, '$1Procura externa: comprovada.'));
falha('kernel promete', (t) => t.replace('nao tem utilidade conhecida fora do sistema', 'garantido para qualquer agente'));
falha('campo sem aviso de procura', (t) => t.replace(/(campo: 'Devolve o campo[^\n]*)Procura externa: nao comprovada\./, '$1'));
falha('PARA_QUE vende dado de mercado', (t) => t.replace('Serve para observar o que o organismo registou de si;', 'Dado de mercado em tempo real;'));
falha('sedimento muda para 20 marcas sem mudar a consulta', (t) => t.replace('15 marcas D', '20 marcas D'));
falha('kernel muda a consulta para 10', (t) => t.replace("ora_kernel_snapshots', 'select=dia,epoch,sigma,state_payload,created_at&order=created_at.desc&limit=5'", "ora_kernel_snapshots', 'select=dia,epoch,sigma,state_payload,created_at&order=created_at.desc&limit=10'"));
falha('legibilidadeFor deixa de recusar promessas', (t) => t.replace('e nao promete valor, receita nem reembolso.', 'e rende.'));
falha('o 402 perde a legibilidade', (t) => t.replace('legibilidade: legibilidadeFor(tier), como_pagar', 'como_pagar'));
falha('a legibilidade entra em accepts', (t) => t.replace("outputSchema: outputSchemaFor(tier), extra:", "outputSchema: outputSchemaFor(tier), para_que: PARA_QUE[tier.key], extra:"));
falha('preco do kernel muda', (t) => t.replace("amountUsdc: '3.00', amountAtomic: 3000000n", "amountUsdc: '2.00', amountAtomic: 2000000n"));
falha('payTo da origem muda', (t) => t.replace(`const WALLET = '${carteira.RECEBIMENTO_EDGE}'`, `const WALLET = '${carteira.RECEBIMENTO}'`));
falha('manifesto perde servicos_via_directa', (t) => t.replace('    servicos_via_directa: {', '    servicos_x: {'));
falha('manifesto esquece o /oraculo', (t) => t.replace("      oraculo: 'https://ora-x402-gateway.vercel.app/oraculo',\n", ''));
falha('manifesto cita outra carteira', (t) => t.replace(`era a carteira operacional ${carteira.RECEBIMENTO}`, 'era a carteira operacional 0x0000000000000000000000000000000000000001'));
falha('manifesto deixa de mandar ler o payTo', (t) => t.replace('vem sempre no 402 de cada URL', 'e fixo'));
falha('manifesto promete', (t) => t.replace('Nao constam de resources acima.', 'Receita garantida.'));
falha('resources do manifesto muda', (t) => t.replace("resources: (Object.values(TIERS) as Tier[]).map((tier) => ({ resource: resourceUrl(tier, origin)", "resources: (Object.values(TIERS) as Tier[]).slice(1).map((tier) => ({ resource: resourceUrl(tier, origin)"));
console.log(JSON.stringify({ verified: true, casos_de_mentira: n }));
