'use strict';
// Oferta Bitcoin no 402 que vem da origem (Supabase). 23/10/2026, livro ora_mudancas 996.
// Unum: "Eu autorizo ORA", a encaminhar os pedidos com prova Bitcoin para a via directa.
//
// Antes: a oferta Bitcoin (api/_pagamento-btc.js) so aparecia na via directa, usada quando a origem
// responde 5xx. Com a origem viva, quem comprava nao a via, e a prova Bitcoin so a via directa sabe verificar.
// Agora: o proxy encaminha para a via directa os pedidos que trazem prova Bitcoin (api/proxy.js) e,
// so por isso, pode mostrar a oferta tambem no 402 da origem.
//
// O que faz: acrescenta ao corpo do 402 v2 da origem `pagamento_alternativo_bitcoin` (a mesma oferta da via
// directa), `fronteiras_pagamento_bitcoin` e o URL onde a prova se apresenta.
// O que nao faz: nao toca em `accepts`, no cabecalho PAYMENT-REQUIRED, no payTo, no montante nem no ativo da Base;
// nao paga, nao assina, nao le segredos; nao acrescenta nada se a oferta nao estiver disponivel (cotacao em falta,
// via desligada) nem se o corpo ja a traz. Se algo nao bate certo, devolve o que recebeu.
const MAX_BYTES = 200000;

function juntarOfertaBtc(status, bodyText, oferta, fronteiras, urlProva) {
  const intacto = (motivo) => ({ text: bodyText, alterado: false, motivo });
  if (status !== 402) return intacto('nao_e_402');
  if (!oferta || oferta.disponivel !== true) return intacto('oferta_indisponivel');
  if (typeof urlProva !== 'string' || !/^https:\/\/[^\s]+$/.test(urlProva)) return intacto('sem_url_para_a_prova');
  if (typeof bodyText !== 'string' || bodyText.length === 0 || bodyText.length > MAX_BYTES) return intacto('corpo_fora_de_limites');
  let c;
  try { c = JSON.parse(bodyText); } catch { return intacto('corpo_nao_json'); }
  if (!c || c.x402Version !== 2 || !Array.isArray(c.accepts) || c.accepts.length === 0) return intacto('nao_e_desafio_v2');
  if (c.pagamento_alternativo_bitcoin !== undefined) return intacto('ja_tem_oferta');
  c.pagamento_alternativo_bitcoin = { ...oferta, apresentar_prova_em: urlProva };
  if (fronteiras && typeof fronteiras === 'object') c.fronteiras_pagamento_bitcoin = fronteiras;
  return { text: JSON.stringify(c), alterado: true, motivo: 'oferta_bitcoin_acrescentada' };
}

// Espera a promessa ate `ms`; em atraso ou erro devolve null (a oferta e um extra, nunca atrasa nem parte o 402).
function comPrazo(promessa, ms) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    Promise.resolve(promessa).then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(null); });
  });
}

module.exports = { juntarOfertaBtc, comPrazo };
