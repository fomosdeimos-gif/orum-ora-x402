/* A cor viva da semente: duas luzes, cada uma ligada a uma medida real (Unum, 22/11/2026: "verde é presença o laranja é sustento").
   Verde = presença: o pulso por sinal (a mesma regra de kit/pulso-vivo.mjs) lido da vista pública ora_frescura_publica.
   Laranja = sustento: só a receita EXTERNA confirmada da tesouraria (evidence.external_confirmed_usdc). Pagamentos internos e de
   teste não contam; um sinal atrasado ou parado esmorece e abranda o verde, nunca o torna laranja.
   Sem leitura não é zero: se uma fonte falha, a luz fica neutra (sem atributo) e a casa não diz um valor que não leu.
   Toca na semente (atributos e variáveis CSS na raiz) e nas três linhas do bloco do pulso vivo (presencaLinha, presencaSinais, sustentoLinha, só textContent); não lê nem escreve mais nada, não paga, não tem segredos.
   A intensidade do laranja (0,4 a 1, cheio a 10 USDC) e o ritmo do verde (5 a 9 s) são escolhas de desenho, não valores medidos.
   Verificador: scripts/verify-pulso-cor.mjs. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else { root.ORUMPulsoCor = api; if (typeof document !== 'undefined') api.ligar(root); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var CICLO_MIN = 5, CICLO_MAX = 9;
  var VISTA = 'https://ywabnlhkmhbyewqhbsjm.supabase.co/rest/v1/ora_frescura_publica?select=medido_em,sinais&order=medido_em.desc&limit=1';
  var CHAVE_PUBLICA = 'sb_publishable_XtI6QAmSYt5KHIazVCgoQw_qVYZ8AVb'; // a chave publicável do projecto (a mesma de api/_pedidos.js); só lê vistas públicas
  var TESOURARIA = '/economia/tesouraria.json';
  var DIA_MS = 24 * 3600 * 1000;
  function num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }

  // presença: a regra do pulso vivo (cópia de kit/pulso-vivo.mjs; o verificador compara as duas)
  function classificarSinal(s, medidoEmMs, agoraMs) {
    var base = num(s && s.idade_min), la = num(s && s.limite_atraso_min), lm = num(s && s.limite_morte_min);
    var nome = s && typeof s.sinal === 'string' && /^[A-Za-z0-9_:.-]{1,40}$/.test(s.sinal) ? s.sinal : '(sem nome)';
    if (base === null || base < 0 || la === null || lm === null || la <= 0 || lm < la) return { nome: nome, estado: 'desconhecido', razao: null, idade: null, limite_atraso: null };
    var m = num(medidoEmMs), a = num(agoraMs);
    var extra = m !== null && a !== null ? Math.max(0, (a - m) / 60000) : 0;
    var idade = base + extra;
    return { nome: nome, estado: idade >= lm ? 'morto' : idade > la ? 'atrasado' : 'vivo', razao: Math.min(1, idade / la), idade: idade, limite_atraso: la };
  }
  function presenca(sinais, medidoEmMs, agoraMs) {
    var lista = Array.isArray(sinais) ? sinais.map(function (s) { return classificarSinal(s, medidoEmMs, agoraMs); }) : [];
    var c = { vivo: 0, atrasado: 0, morto: 0, desconhecido: 0 };
    lista.forEach(function (x) { c[x.estado]++; });
    var conhecidos = lista.filter(function (x) { return x.estado !== 'desconhecido'; });
    if (!conhecidos.length) return { estado: 'sem_leitura', ciclo_s: null, razao_media: null, sinais: lista, contagem: c };
    var estado = c.morto ? 'morto' : c.atrasado ? 'atrasado' : c.desconhecido ? 'incompleto' : 'vivo';
    var media = conhecidos.reduce(function (t, x) { return t + x.razao; }, 0) / conhecidos.length;
    return { estado: estado, ciclo_s: Math.round((CICLO_MIN + (CICLO_MAX - CICLO_MIN) * media) * 10) / 10, razao_media: media, sinais: lista, contagem: c };
  }

  // sustento: só receita externa confirmada, de uma leitura disponível e com menos de 24 h; o resto é "sem leitura"
  function sustento(dado, agoraMs) {
    var e = dado && dado.evidence, f = e && e.source;
    var usdc = e ? num(e.external_confirmed_usdc) : null;
    var obs = f ? Date.parse(f.observed_at) : NaN;
    var a = num(agoraMs);
    if (!f || f.available !== true || usdc === null || usdc < 0 || !isFinite(obs) || a === null || a - obs > DIA_MS) return { estado: 'sem_leitura', usdc: null, intensidade: null };
    if (usdc > 0) return { estado: 'externo', usdc: usdc, intensidade: Math.round((0.4 + 0.6 * Math.min(1, usdc / 10)) * 100) / 100 };
    return { estado: 'zero', usdc: 0, intensidade: 0 };
  }

  // as duas luzes. O verde esmorece com o atraso mas nunca vira laranja; o laranja só vem do sustento.
  function luzes(p, s) {
    var verde = null, ciclo = null, parar = false;
    if (p && p.estado !== 'sem_leitura') {
      verde = p.estado === 'vivo' ? Math.round((1 - 0.35 * p.razao_media) * 100) / 100 : p.estado === 'atrasado' ? 0.5 : p.estado === 'incompleto' ? 0.45 : 0.15;
      ciclo = p.ciclo_s;
      parar = p.estado === 'morto';
    }
    return { presenca: p ? p.estado : 'sem_leitura', sustento: s ? s.estado : 'sem_leitura', verde: verde, laranja: s ? s.intensidade : null, ciclo_s: ciclo, parar: parar };
  }

  // o texto vivo (só textContent). Sem leitura diz "sem leitura", que não é zero nem parado.
  function idadeHumana(min) {
    var m = num(min); if (m === null || m < 0) return 'hora desconhecida';
    var seg = Math.round(m * 60); if (seg < 60) return seg + ' s';
    var mi = Math.floor(seg / 60); if (mi < 60) return mi + ' min ' + (seg % 60) + ' s';
    var h = Math.floor(mi / 60); if (h < 48) return h + ' h ' + (mi % 60) + ' min';
    return Math.floor(h / 24) + ' dias';
  }
  function limiteHumano(min) {
    var m = num(min); if (m === null || m <= 0) return '—';
    if (m < 60) return Math.round(m) + ' min';
    var h = Math.floor(m / 60), r = Math.round(m % 60); return h + ' h' + (r ? ' ' + r + ' min' : '');
  }
  var PALAVRA = { vivo: 'vivo', atrasado: 'atrasado', morto: 'parado', incompleto: 'incompleto', sem_leitura: 'sem leitura' };
  function texto(p, medidoEmMs, s, agoraMs) {
    var m = num(medidoEmMs), a = num(agoraMs);
    var idadeMedicao = m !== null && a !== null ? Math.max(0, (a - m) / 60000) : null;
    var linhaP = 'Presença: sem leitura (não é vivo nem parado).', itens = [];
    if (p && p.estado !== 'sem_leitura') {
      var total = p.sinais.length - p.contagem.desconhecido;
      linhaP = 'Presença: ' + PALAVRA[p.estado] + ' · ' + p.contagem.vivo + ' de ' + total + ' sinais dentro do limite' + (p.contagem.desconhecido ? ' (+' + p.contagem.desconhecido + ' ilegíveis)' : '') + ' · medido há ' + idadeHumana(idadeMedicao);
      itens = p.sinais.map(function (x) {
        return { classe: 's-' + x.estado, texto: x.nome + ' · ' + (x.estado === 'desconhecido' ? 'não lido' : PALAVRA[x.estado] + ', há ' + idadeHumana(x.idade) + ' (limite ' + limiteHumano(x.limite_atraso) + ')') };
      });
    }
    var linhaS = !s || s.estado === 'sem_leitura' ? 'Sustento: sem leitura (não é zero).' : 'Sustento: ' + s.usdc + ' USDC de receita externa confirmada.' + (s.estado === 'zero' ? ' Ainda nenhuma.' : '');
    return { presenca: linhaP, sinais: itens, sustento: linhaS, sustento_classe: s && s.estado === 'externo' ? 's-externo' : 's-neutro' };
  }
  function escrever(raiz, t) {
    var a = raiz.getElementById && raiz.getElementById('presencaLinha'), l = raiz.getElementById && raiz.getElementById('presencaSinais'), u = raiz.getElementById && raiz.getElementById('sustentoLinha');
    if (a) a.textContent = t.presenca;
    if (u) { u.textContent = t.sustento; u.className = 'sustento-linha ' + t.sustento_classe; }
    if (l) {
      while (l.firstChild) l.removeChild(l.firstChild);
      t.sinais.forEach(function (it) { var li = raiz.createElement('li'); li.className = it.classe; li.textContent = it.texto; l.appendChild(li); });
    }
  }

  function aplicar(raiz, l) {
    var st = raiz.documentElement.style, ds = raiz.documentElement.dataset;
    if (l.verde === null) { delete ds.presenca; st.removeProperty('--luz-verde'); st.removeProperty('--ciclo'); st.removeProperty('--semente-anim'); }
    else { ds.presenca = l.presenca; st.setProperty('--luz-verde', String(l.verde)); st.setProperty('--ciclo', l.ciclo_s + 's'); st.setProperty('--semente-anim', l.parar ? 'paused' : 'running'); }
    if (l.laranja === null) { delete ds.sustento; st.removeProperty('--luz-laranja'); }
    else { ds.sustento = l.sustento; st.setProperty('--luz-laranja', String(l.laranja)); }
  }

  // no navegador: lê as duas fontes, recalcula com o relógio, aplica. Falha segura: um erro nunca parte a casa.
  function ligar(janela) {
    var doc = janela.document, ultimoPulso = null, ultimaTesouraria = null;
    function agora() { return janela.Date.now(); }
    function recalcular() {
      try {
        var p = ultimoPulso ? presenca(ultimoPulso.sinais, Date.parse(ultimoPulso.medido_em), agora()) : null;
        var s = ultimaTesouraria ? sustento(ultimaTesouraria, agora()) : null;
        aplicar(doc, luzes(p, s));
        escrever(doc, texto(p, ultimoPulso ? Date.parse(ultimoPulso.medido_em) : null, s, agora()));
      } catch (_) {}
    }
    function lerPulso() {
      janela.fetch(VISTA, { headers: { apikey: CHAVE_PUBLICA, authorization: 'Bearer ' + CHAVE_PUBLICA }, cache: 'no-store', credentials: 'omit' })
        .then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); })
        .then(function (j) { if (Array.isArray(j) && j[0] && Array.isArray(j[0].sinais)) ultimoPulso = j[0]; recalcular(); })
        .catch(function () { recalcular(); });
    }
    function lerTesouraria() {
      janela.fetch(TESOURARIA, { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); })
        .then(function (j) { ultimaTesouraria = j; recalcular(); })
        .catch(function () { recalcular(); });
    }
    lerPulso(); lerTesouraria();
    janela.setInterval(lerPulso, 60000);
    janela.setInterval(lerTesouraria, 60000);
    janela.setInterval(recalcular, 1000);
  }

  return { presenca: presenca, sustento: sustento, luzes: luzes, texto: texto, escrever: escrever, idadeHumana: idadeHumana, limiteHumano: limiteHumano, aplicar: aplicar, ligar: ligar, VISTA: VISTA, CHAVE_PUBLICA: CHAVE_PUBLICA };
});
