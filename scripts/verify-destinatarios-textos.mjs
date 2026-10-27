// Verifica que o llms.txt e o agent-card dizem a quem cada serviço paga, de acordo com api/_carteira.js, e que o próprio
// verificador apanha as mentiras: cada variante adulterada tem de falhar, a real tem de passar. Sem rede, sem base de dados.
// Unum, 27/10/2026: "Eu autorizo ORA", à proposta P2 do registo de legibilidade (lacunas L1 e L2).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const raiz = new URL('../', import.meta.url);
const ler = (f) => readFileSync(new URL(f, raiz), 'utf8');
const carteiraReal = createRequire(import.meta.url)('../api/_carteira.js');
const llmsReal = ler('llms.txt');
const cardReal = JSON.parse(ler('.well-known/agent-card.json'));

const VIA_DIRECTA = ['oraculo', 'campo'];
const VIA_ORIGEM = ['sedimento', 'kernel', 'licenca-consulta', 'licenca-editorial', 'licenca-treino'];
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export function verificar({ llms, card, carteira }) {
  const erros = [];
  const x = (m) => erros.push(m);
  const OP = carteira.RECEBIMENTO;        // onde a via directa cobra (oraculo, campo)
  const EDGE = carteira.RECEBIMENTO_EDGE; // onde as funções de borda cobram (sedimento, kernel, licenças)
  const BTC = carteira.RECEBIMENTO_BTC;

  // ---- llms.txt
  const linhas = llms.split('\n');
  const abertura = linhas.find((l) => l.startsWith('>')) || '';
  if (abertura.includes(EDGE) || abertura.includes(OP)) x('llms.txt: a abertura afirma uma só carteira para todos os serviços');
  if (/Pagamentos directos para jasm43\.base\.eth/.test(llms)) x('llms.txt: ainda diz que os pagamentos são todos para jasm43.base.eth');
  const i = linhas.findIndex((l) => l.startsWith('## Quem recebe o pagamento'));
  if (i < 0) x('llms.txt: falta a secção «Quem recebe o pagamento»');
  else {
    let fim = linhas.findIndex((l, k) => k > i && l.startsWith('## '));
    if (fim < 0) fim = linhas.length;
    const secao = linhas.slice(i, fim);
    if (!/lido a \d{2}\/\d{2}\/\d{4}/.test(secao[0])) x('llms.txt: a secção não diz quando foi lida');
    const bullets = secao.filter((l) => l.startsWith('- '));
    const bOp = bullets.find((l) => l.includes(OP));
    const bEdge = bullets.find((l) => l.includes(EDGE));
    if (!bOp) x('llms.txt: nenhuma linha diz que a carteira operacional recebe');
    else {
      for (const r of ['/oraculo', '/campo']) if (!bOp.includes(r)) x(`llms.txt: a linha da operacional não cita ${r}`);
      for (const r of ['/sedimento', '/kernel', '/licenca/']) if (bOp.includes(r)) x(`llms.txt: a linha da operacional cita ${r}, que paga à sagrada antiga`);
      if (!bOp.includes(BTC)) x('llms.txt: a linha da operacional não traz o endereço Bitcoin da oferta');
    }
    if (!bEdge) x('llms.txt: nenhuma linha diz que a sagrada antiga recebe');
    else {
      for (const r of ['/sedimento', '/kernel', '/licenca/consulta', '/licenca/editorial', '/licenca/treino']) if (!bEdge.includes(r)) x(`llms.txt: a linha da sagrada antiga não cita ${r}`);
      for (const r of ['/oraculo', '/campo']) if (bEdge.includes(r)) x(`llms.txt: a linha da sagrada antiga cita ${r}, que paga à operacional`);
    }
    const texto = secao.join('\n');
    if (!/não pagues/.test(texto)) x('llms.txt: falta o aviso «não pagues» se o payTo do 402 for outro');
    if (!/não prova controlo/.test(texto)) x('llms.txt: falta a fronteira «não prova controlo das carteiras, procura nem receita»');
  }
  if (!/Lido a \d{2}\/\d{2}\/\d{4}/.test(llms)) x('llms.txt: falta a leitura datada dos 402');

  // ---- agent-card
  const t = card.trust || {};
  if (t.paymentWallet !== EDGE) x('agent-card: trust.paymentWallet tem de ser a carteira das funções de borda (RECEBIMENTO_EDGE)');
  if (!/paymentReceivers\.base/.test(t.paymentWalletScope || '')) x('agent-card: trust.paymentWalletScope não remete para paymentReceivers.base');
  const d = card.securitySchemes?.x402?.description || '';
  if (!d.includes(OP) || !d.includes(EDGE)) x('agent-card: a descrição do esquema x402 não traz as duas carteiras');
  if (!/depende do serviço/.test(d)) x('agent-card: a descrição do esquema x402 não diz que o destinatário depende do serviço');
  const b = card.paymentReceivers?.base;
  if (!b) x('agent-card: falta paymentReceivers.base');
  else {
    if (!DATA.test(String(b.readAt))) x('agent-card: paymentReceivers.base.readAt não é uma data');
    if (b.wallets?.operacional !== OP) x('agent-card: wallets.operacional difere de RECEBIMENTO');
    if (b.wallets?.sagradaAntiga !== EDGE) x('agent-card: wallets.sagradaAntiga difere de RECEBIMENTO_EDGE');
    for (const s of VIA_DIRECTA) if (b.services?.[s]?.payTo !== OP) x(`agent-card: ${s} devia pagar à operacional`);
    for (const s of VIA_ORIGEM) if (b.services?.[s]?.payTo !== EDGE) x(`agent-card: ${s} devia pagar à sagrada antiga`);
    for (const s of Object.keys(b.services || {})) if (![...VIA_DIRECTA, ...VIA_ORIGEM].includes(s)) x(`agent-card: serviço desconhecido em paymentReceivers.base: ${s}`);
  }
  const btc = card.paymentReceivers?.bitcoin?.servicesAcceptingBitcoin;
  if (!btc) x('agent-card: falta paymentReceivers.bitcoin.servicesAcceptingBitcoin');
  else for (const s of VIA_DIRECTA) if (btc[s] !== BTC) x(`agent-card: a oferta Bitcoin de ${s} difere de RECEBIMENTO_BTC`);

  // ---- frescura: nada mais antigo do que a leitura dos destinatários
  const ref = b?.readAt;
  const datas = [['economicTruth.observedAt', card.economicTruth?.observedAt], ['servicesAcceptingBitcoin.readAt', btc?.readAt]];
  for (const sk of card.httpServiceSkills || []) if (sk.availability) datas.push([`availability.observedAt (${sk.id})`, sk.availability.observedAt]);
  for (const [nome, v] of datas) {
    if (!DATA.test(String(v))) x(`agent-card: ${nome} não é uma data`);
    else if (ref && DATA.test(String(ref)) && v < ref) x(`agent-card: ${nome} (${v}) é anterior à leitura dos destinatários (${ref})`);
  }
  if (/congelad/i.test(card.economicTruth?.note || '')) x('agent-card: economicTruth.note ainda diz que os contadores estão congelados');
  return erros;
}

const real = { llms: llmsReal, card: cardReal, carteira: carteiraReal };
assert.deepEqual(verificar(real), [], 'os textos reais deviam passar: ' + verificar(real).join('; '));

let mentiras = 0;
const clone = (o) => JSON.parse(JSON.stringify(o));
const falhaCard = (nome, mexe) => { const c = clone(cardReal); mexe(c); assert.ok(verificar({ ...real, card: c }).length > 0, `devia falhar: ${nome}`); mentiras++; };
const falhaLlms = (nome, mexe) => { const l = mexe(llmsReal); assert.notEqual(l, llmsReal, `a mentira «${nome}» não mudou nada`); assert.ok(verificar({ ...real, llms: l }).length > 0, `devia falhar: ${nome}`); mentiras++; };
const falhaCarteira = (nome, outra) => { assert.ok(verificar({ ...real, carteira: { ...carteiraReal, ...outra } }).length > 0, `devia falhar: ${nome}`); mentiras++; };

falhaLlms('a abertura volta a afirmar uma só carteira', (l) => l.replace('Pagamentos directos para carteiras do organismo na Base:', `Pagamentos directos para jasm43.base.eth (${carteiraReal.RECEBIMENTO_EDGE}):`));
falhaLlms('sem a secção dos destinatários', (l) => l.replace('## Quem recebe o pagamento', '## Outra coisa'));
falhaLlms('o /sedimento passa para a linha da operacional', (l) => l.replace('(0.161 USDC) e [/campo]', '(0.161 USDC), [/sedimento](https://ora-x402-gateway.vercel.app/sedimento) e [/campo]'));
falhaLlms('o /oraculo passa para a linha da sagrada antiga', (l) => l.replace('servidos pela origem Supabase.', 'servidos pela origem Supabase. [/oraculo](https://ora-x402-gateway.vercel.app/oraculo)'));
falhaLlms('a linha da operacional perde o endereço', (l) => l.replace(`- Operacional \`${carteiraReal.RECEBIMENTO}\``, '- Operacional'));
falhaLlms('perde o endereço Bitcoin', (l) => l.replace(carteiraReal.RECEBIMENTO_BTC, 'bc1qxxxx'));
falhaLlms('perde o aviso de não pagar', (l) => l.replace('não pagues', 'paga na mesma'));
falhaLlms('perde a fronteira de controlo', (l) => l.replace('Esta secção não prova controlo das carteiras, procura nem receita.', ''));
falhaLlms('a secção não diz quando foi lida', (l) => l.replace('(lido a 27/10/2026, o 402', '(o 402'));
falhaCard('paymentWallet passa a ser a operacional', (c) => { c.trust.paymentWallet = carteiraReal.RECEBIMENTO; });
falhaCard('sem o âmbito da carteira', (c) => { delete c.trust.paymentWalletScope; });
falhaCard('o esquema x402 volta a uma só carteira', (c) => { c.securitySchemes.x402.description = `Pagamento x402 para ${carteiraReal.RECEBIMENTO_EDGE}.`; });
falhaCard('o oráculo pagaria à sagrada antiga', (c) => { c.paymentReceivers.base.services.oraculo.payTo = carteiraReal.RECEBIMENTO_EDGE; });
falhaCard('a licença de treino pagaria à operacional', (c) => { c.paymentReceivers.base.services['licenca-treino'].payTo = carteiraReal.RECEBIMENTO; });
falhaCard('falta um serviço', (c) => { delete c.paymentReceivers.base.services.kernel; });
falhaCard('serviço inventado', (c) => { c.paymentReceivers.base.services.milagre = { payTo: carteiraReal.RECEBIMENTO }; });
falhaCard('a oferta Bitcoin do campo difere', (c) => { c.paymentReceivers.bitcoin.servicesAcceptingBitcoin.campo = 'bc1qoutro'; });
falhaCard('uma disponibilidade volta a ser de 13/10', (c) => { c.httpServiceSkills.find((s) => s.availability).availability.observedAt = '2026-10-13'; });
falhaCard('a verdade económica volta a ser de 13/10', (c) => { c.economicTruth.observedAt = '2026-10-13'; });
falhaCard('os contadores voltam a estar congelados', (c) => { c.economicTruth.note += ' Os contadores de acessos estão congelados.'; });
falhaCard('readAt que não é data', (c) => { c.paymentReceivers.base.readAt = 'ontem'; });
falhaCarteira('o RECEBIMENTO mudou em _carteira.js e os textos não', { RECEBIMENTO: '0x0000000000000000000000000000000000000001' });
falhaCarteira('o RECEBIMENTO_EDGE mudou em _carteira.js e os textos não', { RECEBIMENTO_EDGE: '0x0000000000000000000000000000000000000002' });
falhaCarteira('o RECEBIMENTO_BTC mudou em _carteira.js e os textos não', { RECEBIMENTO_BTC: 'bc1qmudou' });

console.log(JSON.stringify({ verified: true, casos_de_mentira: mentiras }));
