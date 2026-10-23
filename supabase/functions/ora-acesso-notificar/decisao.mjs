// Decide se um acesso merece o email "pagamento". Só diz pagamento quando há prova de que foi aceite:
// resposta 2xx, ou (estado desconhecido) um pagamento verificado na cadeia nos últimos instantes.
// Um cabeçalho X-PAYMENT/PAYMENT-SIGNATURE sozinho não prova nada: verificadores públicos (x402lint) enviam-no só para ver a resposta.
export function classificar(acesso, pagamentoVerificadoRecente) {
  if (!acesso || acesso.tem_pagamento !== true) return { enviar: false, motivo: 'sem_cabecalho_de_pagamento' };
  const metodo = String(acesso.metodo ?? '').toUpperCase();
  if (metodo === 'HEAD' || metodo === 'OPTIONS') return { enviar: false, motivo: 'metodo_sem_entrega' };
  const s = acesso.status_code;
  if (s === undefined || s === null) {
    return pagamentoVerificadoRecente === true
      ? { enviar: true, motivo: 'pagamento_verificado_na_cadeia' }
      : { enviar: false, motivo: 'estado_desconhecido_sem_pagamento_verificado' };
  }
  if (!Number.isInteger(s)) return { enviar: false, motivo: 'estado_invalido' };
  if (s >= 200 && s < 300) return { enviar: true, motivo: 'resposta_2xx' };
  return { enviar: false, motivo: `resposta_${s}_sem_pagamento_aceite` };
}
