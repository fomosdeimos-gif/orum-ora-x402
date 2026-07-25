// ORA · bloco da sentinela ORAi para o portal.
// Correccao de um erro meu: na primeira versao do portal adivinhei os nomes
// dos campos do /integridade (veredicto, rondas) e o painel ficava vazio.
// Os campos reais, lidos da resposta ao vivo, sao:
//   integridade_pct, rondas_registadas, veredictos {OBSERVAR,MUDANCA,ALERTA},
//   ultimo_veredicto { veredicto, frase, dia, quando }
(function(){
  const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const el = document.getElementById('veredicto');
  if (!el) return;
  fetch('/integridade', { cache: 'no-store' })
    .then(r => r.json())
    .then(j => {
      const u = j.ultimo_veredicto || {};
      const v = String(u.veredicto || '—').toUpperCase();
      const cor = v.includes('ALERTA') ? 'var(--alerta)' : (v.includes('MUDANCA') ? 'var(--solar)' : 'var(--verde)');
      const vs = j.veredictos || {};
      const contagem = Object.keys(vs).length
        ? Object.entries(vs).map(([k, n]) => `${esc(k)} ${esc(n)}`).join(' · ')
        : '';
      el.innerHTML =
        `<div class="acc" style="color:${cor}">${esc(v)}</div>` +
        (u.frase ? `<div class="fr">${esc(u.frase)}</div>` : '') +
        `<div class="fr" style="color:var(--dim);font-size:15px">` +
          (j.integridade_pct != null ? `integridade ${esc(j.integridade_pct)}%` : '') +
          (j.rondas_registadas != null ? ` · ${esc(j.rondas_registadas)} rondas` : '') +
          (u.dia != null ? ` · dia ${esc(u.dia)}` : '') +
        `</div>` +
        (contagem ? `<div class="fr" style="color:var(--dim);font-size:14px">${contagem}</div>` : '') +
        `<div class="fr" style="color:var(--dim);font-size:14px">Zero IA, zero chaves. Se não conseguir ver uma porta, diz que não viu — não inventa.</div>`;
    })
    .catch(() => { el.innerHTML = '<p class="carregando">sentinela sem resposta agora</p>'; });
})();
