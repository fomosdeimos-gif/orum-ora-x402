/* ORUM · raiz comum da casa. Local, sem rede, sem estado guardado, sem leitura de dados pessoais.
   1) dá à casa o tom da hora do dia; 2) quieta a respiração quando o separador está escondido;
   3) responde ao toque com uma onda suave, a menos que o leitor peça menos movimento. */
(function () {
  'use strict';
  var root = document.documentElement;
  var reduz = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');

  function hora() {
    var h = new Date().getHours();
    root.setAttribute('data-hora', h < 6 ? 'madrugada' : h < 12 ? 'dia' : h < 19 ? 'tarde' : 'noite');
  }
  hora();
  setInterval(hora, 10 * 60 * 1000);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) root.setAttribute('data-quieto', ''); else root.removeAttribute('data-quieto');
  });

  var camada = null;
  function toques() {
    if (!camada || !camada.isConnected) {
      camada = document.createElement('div');
      camada.className = 'orum-toques';
      camada.setAttribute('aria-hidden', 'true');
      document.body.appendChild(camada);
    }
    return camada;
  }

  document.addEventListener('pointerdown', function (e) {
    if (reduz && reduz.matches) return;
    var onda = document.createElement('div');
    onda.className = 'orum-toque';
    onda.style.left = e.clientX + 'px';
    onda.style.top = e.clientY + 'px';
    toques().appendChild(onda);
    setTimeout(function () { if (onda.parentNode) onda.parentNode.removeChild(onda); }, 1000);
  }, { passive: true });
})();
