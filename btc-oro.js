/* Observação pública; nenhum saldo é convertido em lastro ou receita. */
(async () => {
  const box = document.getElementById('btc-observacao');
  if (!box) return;
  try {
    const response = await fetch('/economia/bitcoin.json', { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('indisponivel');
    const body = await response.json();
    if (!body.ok || !Array.isArray(body.enderecos) || !body.fonte?.consultado_utc) throw new Error('formato');
    const consulted = Date.parse(body.fonte.consultado_utc);
    const age = Date.now() - consulted;
    // A concordância não torna uma leitura antiga actual. Tolera 1 min de desvio de relógio.
    if (!Number.isFinite(consulted) || age < -60000 || age > 300000) {
      box.textContent = 'Leitura desactualizada ou data inválida. Saldo actual desconhecido; consulta as fontes no JSON.';
      return;
    }
    box.replaceChildren();
    for (const wallet of body.enderecos) {
      const line = document.createElement('p');
      const agreed = wallet.concordancia === 'concordam';
      const value = wallet.saldo_confirmado_sats;
      line.textContent = `${wallet.papel}: ${agreed && Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString('pt-PT') + ' sats confirmados' : 'saldo por confirmar'} · ${wallet.concordancia}.`;
      box.append(line);
    }
    const stamp = document.createElement('p');
    stamp.textContent = `Consulta: ${body.fonte.consultado_utc}. Fontes: Blockstream e mempool.space. A data é da consulta, não da última entrada.`;
    box.append(stamp);
  } catch (_) {
    box.textContent = 'Observação indisponível. Saldo desconhecido; consulta as fontes no JSON.';
  }
})();
