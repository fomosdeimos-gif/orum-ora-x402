// Verifica a Casa Verdelaranja (index.html + verdelaranja.css): cada elemento que os scripts ligam existe no HTML, cada
// classe do HTML tem regra no CSS, o HTML não promete receita nem reembolso e a casa pode ficar no ecrã inicial.
// Sem rede. Cada mentira testada aqui tem de falhar.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SCRIPTS = ['verdelaranja.js', 'live-refresh-v1.js', 'desde-visita-v1.js'];
const PROMESSAS = /receita garantida|reembolso garantido|rendimento garantido|904 anos garantidos|compra garantida/i;
const LIGACOES = ['/pagar-teste.html', '/caixa.html', '/oro.html', '/organismo.html', '/observatorio.html', '/sustento.html', '/licenca', '/pulso'];
const lerReal = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// Os ids que os scripts pedem: $('id') e o par escolhido por expressão em sourceStatus().
export function idsDosScripts(ler = lerReal) {
  const ids = new Set();
  for (const f of SCRIPTS) {
    const t = ler(f);
    for (const m of t.matchAll(/\$\('([A-Za-z][A-Za-z0-9_-]*)'\)/g)) ids.add(m[1]);
    for (const m of t.matchAll(/\$\([^)]*\?\s*'([A-Za-z][A-Za-z0-9_-]*)'\s*:\s*'([A-Za-z][A-Za-z0-9_-]*)'\)/g)) { ids.add(m[1]); ids.add(m[2]); }
  }
  return ids;
}

export function validar(html, css, ler = lerReal) {
  const e = [];
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const pedidos = idsDosScripts(ler);
  if (pedidos.size < 20) e.push(`os scripts pedem poucos ids (${pedidos.size}): a extracção falhou`);
  for (const id of pedidos) if (!ids.has(id)) e.push(`falta o id que um script liga: ${id}`);
  const repetidos = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]).filter((x, i, a) => a.indexOf(x) !== i);
  for (const id of new Set(repetidos)) e.push(`id repetido: ${id}`);
  const classes = new Set([...html.matchAll(/\sclass="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean));
  for (const c of classes) if (!new RegExp('[.]' + c.replace(/[-]/g, '\\-') + '(?![\\w-])').test(css)) e.push(`classe sem regra no CSS: ${c}`);
  // classes que os scripts criam
  for (const c of ['license', 'license-price', 'duration', 'status-dot', 'motion-paused', 'observed', 'stale']) if (!new RegExp('[.]' + c.replace(/-/g, '\\-') + '(?![\\w-])').test(css)) e.push(`o CSS não cobre a classe criada pelos scripts: ${c}`);
  for (const s of SCRIPTS.concat(['raiz.js', 'raiz.css', 'verdelaranja.css'])) if (!html.includes('/' + s)) e.push(`o HTML não liga ${s}`);
  if (!/<link rel="manifest" href="\/site\.webmanifest">/.test(html)) e.push('a casa não liga o manifesto (não pode ficar no ecrã inicial)');
  if (!/<meta name="viewport"[^>]*width=device-width/.test(html)) e.push('sem viewport de telemóvel');
  if (!/<html lang="pt-PT">/.test(html)) e.push('sem lang pt-PT');
  if (!/<a class="skip"/.test(html)) e.push('sem ligação para saltar ao conteúdo');
  if (!/<h1[ >]/.test(html)) e.push('sem h1');
  for (const l of LIGACOES) if (!html.includes(`href="${l}"`)) e.push(`falta a ligação ${l}`);
  if (PROMESSAS.test(html)) e.push('o HTML promete receita, reembolso ou rendimento');
  if (!/Não prova procura nem receita/.test(html)) e.push('falta a fronteira "Não prova procura nem receita"');
  if (!/não são pessoas únicas nem compradores/i.test(html)) e.push('falta a fronteira "não são pessoas únicas nem compradores"');
  if (!/@media \(prefers-reduced-motion:\s*reduce\)/.test(css)) e.push('o CSS não respeita prefers-reduced-motion');
  if (/<script(?![^>]*\ssrc=)[^>]*>/.test(html)) e.push('script inline: a casa só liga ficheiros que se verificam');
  if (/https?:\/\/(?!ora-x402-gateway\.vercel\.app)/.test(html.replace(/xmlns="[^"]*"/g, ''))) e.push('o HTML liga a um terceiro');
  return e;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const html = lerReal('index.html');
  const css = lerReal('verdelaranja.css');
  const real = validar(html, css);
  assert.deepEqual(real, [], `a casa real tem de passar: ${JSON.stringify(real)}`);

  let n = 0;
  const falha = (nome, h, c, trecho, ler) => {
    const r = validar(h, c, ler);
    assert.ok(r.some((x) => x.includes(trecho)), `estrago não apanhado (${nome}): ${JSON.stringify(r)}`);
    n++;
  };
  falha('id que um script liga desaparece', html.replace(' id="pulseStatus"', ''), css, 'falta o id que um script liga: pulseStatus');
  falha('id do par por expressão desaparece', html.replace(' id="treasuryStatus"', ''), css, 'falta o id que um script liga: treasuryStatus');
  falha('id de desde-visita desaparece', html.replace(' id="sinceList"', ''), css, 'falta o id que um script liga: sinceList');
  falha('id repetido', html.replace('id="revenue"', 'id="accessCount"'), css, 'id repetido: accessCount');
  falha('classe sem regra', html.replace('<h1 id="titulo">', '<h1 id="titulo" class="inventada">'), css, 'classe sem regra no CSS: inventada');
  falha('CSS perde a classe das licenças', html, css.replace(/\.license-price/g, '.preco-x'), 'não cobre a classe criada pelos scripts: license-price');
  falha('CSS perde o estado do ponto', html, css.replace(/\.status-dot\.stale/g, '.status-dot.x'), 'não cobre a classe criada pelos scripts: stale');
  falha('sem manifesto', html.replace('<link rel="manifest" href="/site.webmanifest">', ''), css, 'não liga o manifesto');
  falha('promete receita', html.replace('O sustento ganha prova.', 'Receita garantida.'), css, 'promete receita');
  falha('promete reembolso', html.replace('O sustento ganha prova.', 'Reembolso garantido.'), css, 'promete receita');
  falha('perde a fronteira da procura', html.replace('Não prova procura nem receita', 'Prova a procura'), css, 'falta a fronteira "Não prova procura nem receita"');
  falha('perde a fronteira dos acessos', html.replace('Não são pessoas únicas nem compradores', 'São compradores'), css, 'falta a fronteira "não são pessoas únicas nem compradores"');
  falha('perde a oferta Campo', html.replace('href="/pagar-teste.html"', 'href="/outra.html"'), css, 'falta a ligação /pagar-teste.html');
  falha('perde a entrada da obra', html.replace('href="/caixa.html"', 'href="/x.html"'), css, 'falta a ligação /caixa.html');
  falha('deixa de ligar o script do catálogo', html.replace('<script src="/verdelaranja.js" defer></script>', ''), css, 'não liga verdelaranja.js');
  falha('script inline', html.replace('</body>', '<script>fetch("/x")</script></body>'), css, 'script inline');
  falha('liga a um terceiro', html.replace('</body>', '<a href="https://exemplo.com/">x</a></body>'), css, 'liga a um terceiro');
  falha('sem pt-PT', html.replace('lang="pt-PT"', 'lang="en"'), css, 'sem lang pt-PT');
  falha('sem viewport', html.replace('width=device-width', 'width=1200'), css, 'sem viewport de telemóvel');
  falha('CSS ignora movimento reduzido', html, css.replace('prefers-reduced-motion:reduce', 'prefers-color-scheme:dark'), 'prefers-reduced-motion');
  falha('extracção de ids falha', html, css, 'os scripts pedem poucos ids', (p) => (SCRIPTS.includes(p) ? '' : lerReal(p)));
  console.log(JSON.stringify({ verified: true, ids_ligados_pelos_scripts: idsDosScripts().size, bytes_html: Buffer.byteLength(html), bytes_css: Buffer.byteLength(css), estragos_apanhados: n }));
}
