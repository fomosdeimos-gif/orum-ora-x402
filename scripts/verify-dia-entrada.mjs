// Verifica que a "linha do dia" posta à entrada para máquinas (llms.txt e agent-card) diz o que kit/dia.mjs faz:
// a origem, os 144 blocos, o exemplo (bloco 972151 e a sua linha), a receita para refazer e a fronteira; e que cada mentira é apanhada.
// Sem rede. Unum, 07/11/2026: "Eu autorizo ora", à proposta concreta do bloco `dia` no llms.txt e no agent-card.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as D from '../kit/dia.mjs';
const ler = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const H972151 = '000000000000000000016dd0c2a998c75bfd8a61120d842f64f87753671db5db';
const PROMESSA = /garant|guarantee|vais ganhar|receita certa|valor assegurado|reembolso garantido|promete receita/i;

export function verificar({ llms, card }) {
  const erros = []; const x = (m) => erros.push(m);
  const linhaEsperada = D.linhaDeHash(H972151);
  const secao = llms.split('## O dia do organismo (para máquinas)')[1]?.split(/\n## /)[0];
  if (!secao) x('llms.txt sem a secção "O dia do organismo (para máquinas)"');
  else {
    if (!secao.includes(`desde o bloco ${D.ORIGEM_ALTURA}`)) x('llms.txt: origem do dia diferente de kit/dia.mjs');
    if (!secao.includes(`um dia são ${D.BLOCOS_POR_DIA} blocos`)) x('llms.txt: blocos por dia diferentes de kit/dia.mjs');
    if (!secao.includes(H972151)) x('llms.txt: falta o hash do bloco do exemplo');
    if (!secao.includes(`dia 1 e a linha "${linhaEsperada}"`)) x('llms.txt: o exemplo não dá a linha que o código dá');
    if (!secao.includes('node kit/dia.mjs')) x('llms.txt: falta a receita para refazer');
    if (!/raw\.githubusercontent\.com\/fomosdeimos-gif\/orum-ora-x402\/main\/kit\/dia\.mjs/.test(secao)) x('llms.txt: falta o URL do código');
    if (!/duas fontes Esplora/.test(secao)) x('llms.txt: não diz que as duas fontes têm de concordar');
    if (!/Não é promessa/.test(secao) || !/não prova procura nem receita/.test(secao) || !/não move fundos/.test(secao)) x('llms.txt: fronteira em falta');
    if (PROMESSA.test(secao)) x('llms.txt: promete o que não pode');
    for (const p of D.PALAVRAS) if (!secao.includes(p)) x(`llms.txt: falta a palavra do léxico "${p}"`);
  }
  const d = card?.diaDoOrganismo;
  if (!d) x('agent-card sem diaDoOrganismo');
  else {
    if (d.origemAltura !== D.ORIGEM_ALTURA) x('agent-card: origem diferente de kit/dia.mjs');
    if (d.blocosPorDia !== D.BLOCOS_POR_DIA) x('agent-card: blocos por dia diferentes de kit/dia.mjs');
    if (d.exemplo?.altura !== D.ORIGEM_ALTURA || d.exemplo?.hash !== H972151) x('agent-card: exemplo não é o bloco 972151');
    if (d.exemplo?.dia !== D.diaDeAltura(D.ORIGEM_ALTURA)) x('agent-card: dia do exemplo errado');
    if (d.exemplo?.linha !== linhaEsperada) x('agent-card: linha do exemplo diferente da do código');
    if (d.refazer !== 'node kit/dia.mjs') x('agent-card: receita diferente');
    if (!/kit\/dia\.mjs$/.test(d.codigo || '')) x('agent-card: URL do código não aponta a kit/dia.mjs');
    if (!/Não é promessa/.test(d.fronteira || '') || !/não move fundos/.test(d.fronteira || '')) x('agent-card: fronteira em falta');
    if (PROMESSA.test(JSON.stringify(d))) x('agent-card: promete o que não pode');
  }
  return erros;
}

const llms = ler('llms.txt');
const card = JSON.parse(ler('.well-known/agent-card.json'));
const real = verificar({ llms, card });
assert.deepEqual(real, [], 'a entrada diz a verdade: ' + real.join('; '));

let estragos = 0;
function estraga(nome, f) {
  const c = structuredClone(card); let l = llms;
  const r = f({ llms: l, card: c }); l = r?.llms ?? l;
  const erros = verificar({ llms: l, card: c });
  assert.ok(erros.length > 0, 'estrago NAO apanhado: ' + nome);
  estragos += 1;
}
const troca = (de, para) => ({ llms, card }) => ({ llms: (assert.ok(llms.includes(de), 'estrago nao aplicavel: ' + de), llms.replace(de, para)), card });
estraga('origem do dia mudada no llms', troca('desde o bloco 972151', 'desde o bloco 972152'));
estraga('144 mudado no llms', troca('um dia são 144 blocos', 'um dia são 100 blocos'));
estraga('linha do exemplo mentirosa no llms', troca('"fio · sedimentar · precipitar"', '"fio · custódia · precipitar"'));
estraga('hash do exemplo adulterado no llms', troca(H972151, H972151.replace('16dd', '16de')));
estraga('receita removida do llms', troca('node kit/dia.mjs', 'node outra-coisa.mjs'));
estraga('URL do código errado no llms', troca('main/kit/dia.mjs', 'main/kit/outro.mjs'));
estraga('fontes deixam de ter de concordar', troca('duas fontes Esplora, que têm de concordar', 'uma fonte'));
estraga('fronteira removida do llms', troca('Não é promessa, não prova procura nem receita, e não move fundos.', 'Ouro garantido.'));
estraga('promessa acrescentada ao llms', troca('Fronteira: poesia mecânica', 'Fronteira: receita garantida, poesia mecânica'));
estraga('palavra do léxico em falta', troca('custódia)', 'segredo)'));
estraga('secção removida', ({ llms, card }) => ({ llms: llms.replace('## O dia do organismo (para máquinas)', '## Outra coisa'), card }));
estraga('agent-card sem o bloco', ({ llms, card }) => { delete card.diaDoOrganismo; return { llms, card }; });
estraga('agent-card com origem errada', ({ llms, card }) => { card.diaDoOrganismo.origemAltura = 972000; return { llms, card }; });
estraga('agent-card com 143 blocos', ({ llms, card }) => { card.diaDoOrganismo.blocosPorDia = 143; return { llms, card }; });
estraga('agent-card com linha errada', ({ llms, card }) => { card.diaDoOrganismo.exemplo.linha = 'fio · fio · fio'; return { llms, card }; });
estraga('agent-card com dia errado', ({ llms, card }) => { card.diaDoOrganismo.exemplo.dia = 2; return { llms, card }; });
estraga('agent-card com hash trocado', ({ llms, card }) => { card.diaDoOrganismo.exemplo.hash = '0'.repeat(64); return { llms, card }; });
estraga('agent-card com receita trocada', ({ llms, card }) => { card.diaDoOrganismo.refazer = 'curl https://x'; return { llms, card }; });
estraga('agent-card sem fronteira', ({ llms, card }) => { card.diaDoOrganismo.fronteira = 'Livre.'; return { llms, card }; });
estraga('agent-card promete', ({ llms, card }) => { card.diaDoOrganismo.fronteira += ' Retorno garantido. Não é promessa, não move fundos.'; return { llms, card }; });

console.log(JSON.stringify({ verified: true, estragos_apanhados: estragos,
  prova: 'a linha do dia à entrada (llms.txt e agent-card) diz a origem, os 144 blocos, o exemplo do bloco 972151 e a sua linha, a receita e a fronteira que kit/dia.mjs cumpre',
  nao_prova: 'que alguma máquina a leia; que o deploy já a sirva; que o bloco de exemplo seja o de hoje' }));
