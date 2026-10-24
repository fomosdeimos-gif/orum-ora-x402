/* ORUM · "desde a tua última visita". Só leitura: compara os rastos que o /pulso já publica com a hora da última
   visita guardada neste dispositivo (localStorage, nunca enviada). Não conta pessoas, não promete nada, não escreve na rede. */
(function (root) {
  'use strict';
  const CHAVE = 'orum.casa.ultima-visita';
  // Devolve { estado, novos } . estado: 'primeira' (sem visita anterior), 'nada' (nada novo), 'novos'.
  function comparar(eventos, desde, agora) {
    const lista = Array.isArray(eventos) ? eventos : [];
    const t0 = typeof desde === 'string' ? Date.parse(desde) : NaN;
    if (!Number.isFinite(t0) || t0 > agora) return { estado: 'primeira', novos: [] };
    const vistos = new Set();
    const novos = lista.filter(e => {
      const t = e && Date.parse(e.quando);
      if (!Number.isFinite(t) || t <= t0 || t > agora) return false;
      const k = JSON.stringify([e.tipo, e.quando, e.detalhe]);
      if (vistos.has(k)) return false;
      vistos.add(k); return true;
    });
    return { estado: novos.length ? 'novos' : 'nada', novos };
  }
  function ler(store) { try { return store.getItem(CHAVE); } catch (_) { return null; } }
  function guardar(store, quando) { try { store.setItem(CHAVE, quando); return true; } catch (_) { return false; } }
  root.ORUMDesdeVisita = { CHAVE, comparar, ler, guardar };
})(typeof globalThis !== 'undefined' ? globalThis : this);
