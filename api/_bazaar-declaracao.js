// Declaracao Bazaar no formato x402 v2, para os 402 que vem da origem (Supabase).
//
// Lido a 23/10/2026 (especificacao coinbase/x402, specs/extensions/bazaar.md):
// a extensao `bazaar` vai em `extensions` ao nivel de topo do PaymentRequired, e os
// clientes ecoam-na no pagamento; "se a extensao for omitida, nao ha catalogacao".
// O 402 da origem traz a declaracao DENTRO de accepts[0].extensions (estilo v1) e o
// cabecalho PAYMENT-REQUIRED (o que um cliente v2 le) nao traz nenhuma. Foi lido ao
// vivo que o Bazaar tem 0 recursos para a nossa carteira, 17 h depois de um
// pagamento liquidado pelo facilitador CDP. A causa NAO esta provada; isto remove a
// que se leu na especificacao.
//
// O que faz: se a origem ja declara bazaar (em accepts[*].extensions.bazaar) e o topo
// nao, copia essa MESMA declaracao para o topo do corpo e do cabecalho.
// O que nao faz: nao inventa declaracao, nao toca em accepts, payTo, montante, ativo
// nem rede, nao paga, nao assina, nao le segredos. Idempotente. Se algo nao bate
// certo, devolve o que recebeu, sem alterar.
'use strict';

const MAX_BYTES = 200000;

function declaracaoValida(b) {
  return Boolean(b && typeof b === 'object' && b.info && typeof b.info === 'object' && b.schema && typeof b.schema === 'object'
    && b.info.input && b.info.input.type === 'http' && typeof b.info.input.method === 'string');
}

function daOrigem(challenge) {
  for (const a of challenge.accepts) {
    const b = a && a.extensions && a.extensions.bazaar;
    if (declaracaoValida(b)) return b;
  }
  return null;
}

function temNoTopo(o) {
  return Boolean(o && o.extensions && declaracaoValida(o.extensions.bazaar));
}

// Devolve { text, header, alterado, motivo }. `header` e o novo valor de
// PAYMENT-REQUIRED (ou null se nao ha que o mudar).
function elevarBazaar(status, bodyText, paymentRequiredHeader) {
  const intacto = (motivo) => ({ text: bodyText, header: null, alterado: false, motivo });
  if (status !== 402) return intacto('nao_e_402');
  if (typeof bodyText !== 'string' || bodyText.length === 0 || bodyText.length > MAX_BYTES) return intacto('corpo_fora_de_limites');
  let challenge;
  try { challenge = JSON.parse(bodyText); } catch { return intacto('corpo_nao_json'); }
  if (!challenge || challenge.x402Version !== 2 || !Array.isArray(challenge.accepts) || challenge.accepts.length === 0) return intacto('nao_e_desafio_v2');

  const origem = daOrigem(challenge);
  let novoHeader = null;
  let novoTexto = bodyText;
  let alterado = false;

  if (!temNoTopo(challenge)) {
    if (!origem) return intacto('origem_sem_declaracao_bazaar');
    challenge.extensions = { ...(challenge.extensions && typeof challenge.extensions === 'object' ? challenge.extensions : {}), bazaar: origem };
    novoTexto = JSON.stringify(challenge);
    alterado = true;
  }

  if (typeof paymentRequiredHeader === 'string' && paymentRequiredHeader.length > 0 && paymentRequiredHeader.length <= MAX_BYTES) {
    try {
      const h = JSON.parse(Buffer.from(paymentRequiredHeader, 'base64').toString('utf8'));
      if (h && h.x402Version === 2 && Array.isArray(h.accepts) && !temNoTopo(h)) {
        const fonte = origem || (temNoTopo(challenge) ? challenge.extensions.bazaar : null);
        if (fonte) {
          h.extensions = { ...(h.extensions && typeof h.extensions === 'object' ? h.extensions : {}), bazaar: fonte };
          novoHeader = Buffer.from(JSON.stringify(h), 'utf8').toString('base64');
          alterado = true;
        }
      }
    } catch { /* cabecalho ilegivel: fica como veio */ }
  }

  if (!alterado) return intacto('ja_declarado_no_topo');
  return { text: novoTexto, header: novoHeader, alterado: true, motivo: 'elevado_para_o_topo' };
}

module.exports = { elevarBazaar, declaracaoValida };
