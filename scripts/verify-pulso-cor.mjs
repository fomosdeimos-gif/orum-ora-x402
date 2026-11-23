// Verifica a cor viva da semente (pulso-cor-v1.js, verdelaranja.css, index.html): verde = presença (a regra de kit/pulso-vivo.mjs),
// laranja = só receita externa confirmada. Sem rede: as fontes são simuladas. Cada estrago propositado tem de ser apanhado.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { pulso as pulsoKit } from '../kit/pulso-vivo.mjs';

const ler = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const fonte = ler('pulso-cor-v1.js');
const css = ler('verdelaranja.css');
const html = ler('index.html');
const pedidos = ler('api/_pedidos.js');

const T0 = Date.parse('2026-11-23T08:42:00Z');
const min = (n) => T0 + n * 60000;
const real = () => [
  { sinal: 'sentinela_rondas', idade_min: 15, limite_atraso_min: 45, limite_morte_min: 120 },
  { sinal: 'acessos_log', idade_min: 5, limite_atraso_min: 240, limite_morte_min: 1440 },
  { sinal: 'aprendizagem_snapshot', idade_min: 195, limite_atraso_min: 1560, limite_morte_min: 2880 },
  { sinal: 'sedimento_log', idade_min: 520, limite_atraso_min: 1560, limite_morte_min: 2880 },
  { sinal: 'memoria_autonoma', idade_min: 15, limite_atraso_min: 45, limite_morte_min: 120 },
  { sinal: 'publicado:catalogo', idade_min: 5, limite_atraso_min: 20, limite_morte_min: 60 },
  { sinal: 'publicado:integridade', idade_min: 15, limite_atraso_min: 60, limite_morte_min: 180 },
  { sinal: 'publicado:pulso', idade_min: 5, limite_atraso_min: 20, limite_morte_min: 60 },
];
const tes = (usdc, over = {}) => ({ evidence: { external_confirmed_usdc: usdc, internal_validation_payments: 22, source: { available: true, observed_at: new Date(T0 - 5 * 60000).toISOString(), ...over } } });

const atrasadoCiclo = (A) => A.luzes(A.presenca(real(), T0, min(30)), null).ciclo_s;
function carregar(src) { const m = { exports: {} }; vm.runInNewContext(src, { module: m, globalThis: {} }); return m.exports; }

// o corredor no navegador, com um DOM e uma rede simulados
function navegador(src, { pulsoJson, pulsoFalha, tesJson, tesFalha, chamadas = [] }) {
  const estilo = {}; const ds = {}; const ints = [];
  const raiz = { style: { setProperty: (k, v) => { estilo[k] = v; }, removeProperty: (k) => { delete estilo[k]; } }, dataset: ds };
  let agora = T0;
  const janela = {
    document: { documentElement: raiz },
    Date: { now: () => agora, parse: (x) => Date.parse(x) },
    setInterval: (f, ms) => { ints.push([f, ms]); },
    fetch: (url, init) => {
      chamadas.push({ url: String(url), init });
      const falha = String(url).includes('supabase') ? pulsoFalha : tesFalha;
      if (falha) return Promise.reject(new Error('rede'));
      const j = String(url).includes('supabase') ? pulsoJson : tesJson;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(j) });
    },
  };
  janela.globalThis = janela;
  vm.runInNewContext(src, { ...janela, Date: janela.Date, globalThis: janela, __j: janela });
  return { estilo, ds, ints, avancar: async (m) => { agora = min(m); for (const [f, ms] of ints) if (ms === 15000) f(); await new Promise((r) => setTimeout(r, 5)); }, esperar: () => new Promise((r) => setTimeout(r, 20)) };
}

async function suite(src, { css: cssTxt = css, html: htmlTxt = html, pedidosTxt = pedidos } = {}) {
  const A = carregar(src);
  // 1. a presença é a regra do pulso vivo: mesmos estados, ritmo e razão, em muitas situações
  const casos = [real(), [], null, 'x', [null, {}], [...real(), { sinal: 'lixo' }],
    [{ sinal: 'a', idade_min: 30, limite_atraso_min: 20, limite_morte_min: 60 }, ...real()],
    [{ sinal: 'a', idade_min: 61, limite_atraso_min: 20, limite_morte_min: 60 }, ...real()],
    [{ sinal: 'b', idade_min: 20, limite_atraso_min: 20, limite_morte_min: 60 }], [{ sinal: 'c', idade_min: 60, limite_atraso_min: 20, limite_morte_min: 60 }]];
  for (const c of casos) for (const m of [0, 5, 30, 90, 600, 3000]) {
    const a = A.presenca(c, T0, min(m)); const b = pulsoKit(c, T0, min(m));
    const bEstado = b.estado === 'sem_sinais' ? 'sem_leitura' : b.estado;
    assert.equal(a.estado, bEstado, `estado difere do kit (${m} min)`);
    assert.equal(a.ciclo_s, b.ciclo_s, `ritmo difere do kit (${m} min)`);
    assert.equal(a.razao_media === null ? null : +a.razao_media.toFixed(9), b.razao_media === null ? null : +b.razao_media.toFixed(9), 'razão difere do kit');
  }
  // 2. o laranja é só sustento: receita externa confirmada, de uma leitura disponível e recente
  assert.equal(A.sustento(tes(0), T0).estado, 'zero'); assert.equal(A.sustento(tes(0), T0).intensidade, 0);
  assert.equal(A.sustento(tes(2.5), T0).estado, 'externo'); assert.equal(A.sustento(tes(2.5), T0).intensidade, 0.55);
  assert.equal(A.sustento(tes(10), T0).intensidade, 1); assert.equal(A.sustento(tes(500), T0).intensidade, 1, 'a intensidade tem tecto');
  assert.ok(A.sustento(tes(0.01), T0).intensidade >= 0.4, 'qualquer receita externa confirmada acende');
  const interno = { evidence: { external_confirmed_usdc: 0, internal_validation_payments: 999, internal_payments_usdc: 999, source: { available: true, observed_at: new Date(T0).toISOString() } } };
  assert.equal(A.sustento(interno, T0).estado, 'zero', 'pagamentos internos e de teste não acendem o laranja');
  for (const mau of [null, undefined, {}, { evidence: {} }, tes('3'), tes(NaN), tes(-1), tes(1, { available: false }), tes(1, { available: undefined }), tes(1, { observed_at: 'lixo' }), tes(1, { observed_at: new Date(T0 - 25 * 3600e3).toISOString() })])
    assert.equal(A.sustento(mau, T0).estado, 'sem_leitura', 'sem leitura não é zero nem receita: ' + JSON.stringify(mau));
  assert.equal(A.sustento(tes(1, { observed_at: new Date(T0 - 23 * 3600e3).toISOString() }), T0).estado, 'externo');
  assert.equal(A.sustento(tes(1), null).estado, 'sem_leitura', 'sem hora de agora não se afirma');
  // 3. as luzes: o atraso esmorece o verde mas nunca acende o laranja; o parado abranda
  const vivo = A.luzes(A.presenca(real(), T0, T0), A.sustento(tes(0), T0));
  assert.equal(vivo.ciclo_s, pulsoKit(real(), T0, T0).ciclo_s, 'o ritmo das luzes é o do algoritmo'); assert.equal(atrasadoCiclo(A), pulsoKit(real(), T0, min(30)).ciclo_s);
  assert.equal(vivo.presenca, 'vivo'); assert.equal(vivo.laranja, 0); assert.ok(vivo.verde > 0.8 && vivo.verde <= 1);
  const atrasado = A.luzes(A.presenca(real(), T0, min(30)), A.sustento(tes(0), T0));
  assert.equal(atrasado.presenca, 'atrasado'); assert.equal(atrasado.laranja, 0, 'um sinal atrasado não acende o laranja'); assert.ok(atrasado.verde < vivo.verde);
  const morto = A.luzes(A.presenca(real(), T0, min(200)), A.sustento(tes(0), T0));
  assert.equal(morto.presenca, 'morto'); assert.equal(morto.laranja, 0); assert.equal(morto.parar, true); assert.ok(morto.verde < atrasado.verde);
  assert.equal(A.luzes(A.presenca(real(), T0, T0), A.sustento(tes(4), T0)).laranja, 0.64, 'o laranja vem só do sustento');
  assert.equal(A.luzes(null, null).verde, null); assert.equal(A.luzes(null, null).laranja, null, 'sem leitura as luzes ficam neutras');
  assert.equal(A.luzes(A.presenca(real(), T0, T0), null).laranja, null, 'sustento sem leitura não é zero');
  // 4. o corredor: lê as duas fontes e aplica; sem leitura nada se afirma; o relógio envelhece entre leituras
  const semModule = src;
  let ch = [];
  let n = navegador(semModule, { pulsoJson: [{ medido_em: new Date(T0).toISOString(), sinais: real() }], tesJson: tes(0), chamadas: ch });
  await n.esperar();
  assert.equal(n.ds.presenca, 'vivo'); assert.equal(n.ds.sustento, 'zero'); assert.equal(n.estilo['--luz-laranja'], '0'); assert.ok(parseFloat(n.estilo['--luz-verde']) > 0.8);
  assert.equal(n.estilo['--semente-anim'], 'running');
  assert.equal(n.estilo['--ciclo'], pulsoKit(real(), T0, T0).ciclo_s + 's', 'a variável do ritmo vem do algoritmo');
  await n.avancar(30); assert.equal(n.ds.presenca, 'atrasado', 'o relógio envelhece a presença entre leituras'); assert.equal(n.ds.sustento, 'zero');
  await n.avancar(200); assert.equal(n.ds.presenca, 'morto'); assert.equal(n.estilo['--semente-anim'], 'paused');
  const urlPulso = ch.find((c) => c.url.includes('supabase')); const urlTes = ch.find((c) => c.url.includes('tesouraria'));
  assert.ok(urlPulso && urlTes, 'lê as duas fontes');
  assert.ok(/\/rest\/v1\/ora_frescura_publica\?/.test(urlPulso.url), 'só lê a vista pública'); assert.ok(!/POST|PUT|PATCH|DELETE/.test(JSON.stringify(urlPulso.init)), 'só leitura');
  const chave = /sb_publishable_[A-Za-z0-9_]+/.exec(pedidosTxt)[0];
  assert.equal(urlPulso.init.headers.apikey, chave, 'a chave é a publicável do repositório (api/_pedidos.js)'); assert.equal(urlPulso.init.credentials, 'omit');
  n = navegador(semModule, { pulsoFalha: true, tesFalha: true }); await n.esperar();
  assert.deepEqual(Object.keys(n.ds), [], 'sem leitura nenhuma, sem atributos'); assert.deepEqual(Object.keys(n.estilo), [], 'sem leitura nenhuma, sem variáveis');
  n = navegador(semModule, { pulsoJson: [{ medido_em: new Date(T0).toISOString(), sinais: real() }], tesFalha: true }); await n.esperar();
  assert.equal(n.ds.presenca, 'vivo'); assert.equal(n.ds.sustento, undefined, 'sustento por ler não é zero'); assert.equal(n.estilo['--luz-laranja'], undefined);
  n = navegador(semModule, { pulsoFalha: true, tesJson: tes(3) }); await n.esperar();
  assert.equal(n.ds.presenca, undefined); assert.equal(n.ds.sustento, 'externo'); assert.equal(n.estilo['--luz-laranja'], '0.58');
  n = navegador(semModule, { pulsoJson: [{ medido_em: 'x', sinais: 'lixo' }], tesJson: 'lixo' }); await n.esperar();
  assert.deepEqual(Object.keys(n.ds), [], 'resposta ilegível não afirma nada');
  // 5. ficheiros: o CSS tem as duas luzes e já não pinta o atraso de laranja; a casa liga o script; nada inline
  assert.ok(/--luz-verde/.test(cssTxt) && /--luz-laranja/.test(cssTxt), 'o CSS tem as duas luzes');
  assert.ok(!/\.vivo:has\(\.status-dot\.(stale|observed)\)\s*\.semente/.test(cssTxt), 'a regra antiga (leitura velha = laranja) saiu');
  assert.ok(/\.semente\{[^}]*animation:respira var\(--ciclo\)/.test(cssTxt), 'o ritmo vem do algoritmo');
  assert.ok(/<script src="\/pulso-cor-v1\.js" defer><\/script>/.test(htmlTxt), 'a casa liga o script');
  assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/.test(htmlTxt), 'sem script inline');
  assert.ok(!/(eval|new Function|document\.write|localStorage|document\.cookie|innerHTML)/.test(src), 'o script só toca em atributos e variáveis');
}

await suite(fonte);
console.log('Cor viva da semente: presença igual ao kit, laranja só de receita externa confirmada, sem leitura neutra.');

const estragos = [
  ['o laranja lê os pagamentos internos', ['external_confirmed_usdc) : null;', 'internal_validation_payments) : null;'], 'src'],
  ['zero acende o laranja', ['if (usdc > 0) return', 'if (usdc >= 0) return'], 'src'],
  ['o atraso acende o laranja', ["laranja: s ? s.intensidade : null", "laranja: p && p.estado === 'atrasado' ? 0.8 : (s ? s.intensidade : null)"], 'src'],
  ['o atraso vira verde cheio', ["p.estado === 'atrasado' ? 0.5", "p.estado === 'atrasado' ? 1"], 'src'],
  ['falha de sustento mostra zero', ["usdc === null || usdc < 0 ||", "usdc < 0 ||"], 'src'],
  ['aceita leitura com mais de 24 h', ['|| a - obs > DIA_MS', ''], 'src'],
  ['aceita fonte indisponível', ['f.available !== true ||', ''], 'src'],
  ['sem tecto de intensidade', ['Math.min(1, usdc / 10)', '(usdc / 10)'], 'src'],
  ['o relógio não envelhece', ['Date.parse(ultimoPulso.medido_em), agora())', 'Date.parse(ultimoPulso.medido_em), Date.parse(ultimoPulso.medido_em))'], 'src'],
  ['o ritmo não vem do algoritmo', ['ciclo = p.ciclo_s;', 'ciclo = 5;'], 'src'],
  ['o parado não abranda', ["parar = p.estado === 'morto';", 'parar = false;'], 'src'],
  ['o limite de atraso é inclusivo', ["idade >= lm ? 'morto' : idade > la ?", "idade >= lm ? 'morto' : idade >= la ?"], 'src'],
  ['o ilegível conta como vivo', ["return { estado: 'desconhecido', razao: null }", "return { estado: 'vivo', razao: 0 }"], 'src'],
  ['outra chave', ["sb_publishable_XtI6QAmSYt5KHIazVCgoQw_qVYZ8AVb'; //", "sb_publishable_OUTRA'; //"], 'src'],
  ['envia credenciais', ["credentials: 'omit'", "credentials: 'include'"], 'src'],
  ['escreve com innerHTML', ['function aplicar(raiz, l) {', 'function aplicar(raiz, l) { raiz.body && (raiz.body.innerHTML = ""); '], 'src'],
  ['o CSS volta à regra antiga', ['@keyframes respira', '.vivo:has(.status-dot.stale) .semente{opacity:.5}\n@keyframes respira'], 'css'],
  ['o CSS perde o laranja', ['--luz-laranja', '--luz-outra'], 'css'],
  ['o CSS fixa o ritmo', ['animation:respira var(--ciclo)', 'animation:respira 5.5s'], 'css'],
  ['a casa deixa de ligar o script', ['<script src="/pulso-cor-v1.js" defer></script>', ''], 'html'],
  ['script inline', ['</body>', '<script>fetch("/x")</script></body>'], 'html'],
];
let apanhados = 0;
for (const [nome, [de, para], onde] of estragos) {
  const alvo = onde === 'src' ? fonte : onde === 'css' ? css : html;
  assert.ok(alvo.includes(de), `o estrago não encontra o alvo: ${nome}`);
  const estragado = alvo.replaceAll(de, para);
  let caiu = false;
  try { await suite(onde === 'src' ? estragado : fonte, { css: onde === 'css' ? estragado : css, html: onde === 'html' ? estragado : html }); } catch (_) { caiu = true; }
  assert.ok(caiu, `estrago não apanhado: ${nome}`);
  apanhados++;
}
console.log(`Estragos propositados apanhados: ${apanhados} de ${estragos.length}.`);
console.log('PASS');
