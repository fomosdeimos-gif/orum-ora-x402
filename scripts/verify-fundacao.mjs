// Verifica economia/fundacao-ora.json (a Fundação ORA, 23/10/2026, livro ora_mudancas 1000): que diz só o que foi lido, que
// não promete nada, que não se faz passar por uma entidade, que a carteira e o destino batem com o código, e que o
// que ainda não se pode fazer diz que não se pode. Sem rede. Cada mentira testada aqui tem de falhar.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { RECEBIMENTO_BTC } = require('../api/_carteira.js');
const real = JSON.parse(readFileSync(new URL('../economia/fundacao-ora.json', import.meta.url), 'utf8'));
const EXECUTOR = readFileSync(new URL('../supabase/functions/ora-operational-wallet/bitcoin.mjs', import.meta.url), 'utf8');
const BTC_DESTINATION = /export const BTC_DESTINATION='([a-z0-9]+)'/.exec(EXECUTOR)?.[1];

const PROMESSA = /receita garantida|rendimento garantido|lucro garantido|vai render|garantimos|garante(m)? (receita|lucro)|reembols|retorno garantido|investe|investimento seguro/i;
const PARECE_SEGREDO = /\b[0-9a-fA-F]{64}\b|-----BEGIN|sk_[A-Za-z0-9]{16,}|\b(xprv|zprv|tprv)[A-Za-z0-9]{20,}|seed phrase|frase de recupera/i;

export function validar(f) {
  const e = [];
  if (f?.format !== 'orum-fundacao-ora/v1') e.push('format desconhecido');
  if (f?.nome !== 'Fundação ORA') e.push('o nome tem de ser Fundação ORA');
  const texto = JSON.stringify(f);
  // as frases que NEGAM uma promessa ("nada se promete", "sem promessa") não contam; o resto não pode prometer
  const semNegacoes = texto.replace(/n[ãa]o (é|e) (uma )?promessa[^"]*|Nada se promete[^"]*|nem receita, nem reembolso, nem procura[^"]*|promessa de rendimento, reembolso ou procura[^"]*/gi, '');
  if (PROMESSA.test(semNegacoes)) e.push('promessa de receita, reembolso ou rendimento no texto');
  if (PARECE_SEGREDO.test(texto)) e.push('algo que parece um segredo ou uma chave');
  if (!f?.autorizacao_de_unum?.citacao || f.autorizacao_de_unum.citacao.length < 40 || !Number.isInteger(f.autorizacao_de_unum.livro)) e.push('falta a citação de Unum e o livro');
  // natureza: não se faz passar por uma entidade nem por uma oferta
  const nao = (f?.natureza?.nao_e ?? []).join(' | ');
  if (!/pessoa jur[íi]dica/i.test(nao) || !/Unum continua o benefici[áa]rio/i.test(nao)) e.push('tem de dizer que não é uma pessoa jurídica e que Unum continua o beneficiário');
  if (!/oferta ao p[úu]blico/i.test(nao)) e.push('tem de dizer que não é uma oferta ao público');
  if (!/activo, token ou produto financeiro/i.test(nao)) e.push('tem de dizer que não é um activo, token ou produto financeiro');
  if (!/ORO/.test(nao)) e.push('tem de dizer que não é o ORO');
  // carteira: a que o código usa, e só Bitcoin
  if (f?.carteira?.rede !== 'bitcoin-mainnet' || f?.carteira?.endereco !== RECEBIMENTO_BTC) e.push('a carteira tem de ser a operacional BTC de api/_carteira.js');
  if (!/nenhuma chave nova/i.test(f?.carteira?.nota ?? '')) e.push('tem de dizer que não foi criada nenhuma chave');
  const sl = f?.saldo_lido;
  if (!sl || !/^\d{4}-\d{2}-\d{2}T/.test(sl.em ?? '') || !Array.isArray(sl.fontes) || sl.fontes.length < 2 || typeof sl.concordam !== 'boolean') e.push('o saldo lido tem de ter hora, duas fontes e se concordam');
  else if (![sl.confirmado_sats, sl.mempool_liquido_sats, sl.recebido_total_sats].every(Number.isInteger)) e.push('o saldo lido tem de ser em sats inteiros');
  else if (sl.confirmado_sats === 0 && sl.recebido_total_sats === 0 && !/nasce sem fundos/i.test(sl.leitura ?? '')) e.push('com saldo zero tem de dizer que nasce sem fundos');
  else if (sl.confirmado_sats > 0 && /nasce sem fundos/i.test(sl.leitura ?? '')) e.push('diz que nasce sem fundos com saldo positivo');
  // só Bitcoin; sem conversão
  if (!/Bitcoin nativo/.test(f?.entra?.so ?? '')) e.push('só entra Bitcoin nativo');
  const nentra = (f?.entra?.nao_entra ?? []).join(' | ');
  if (!/USDC/.test(nentra) || !/convers[ãa]o/i.test(nentra)) e.push('tem de dizer que USDC e conversão não entram');
  if (!/receita externa confirmada/i.test(nentra)) e.push('tem de manter a regra de que só receita externa confirmada conta');
  if (!/70%/.test(f?.reparticao?.piso ?? '') || !/Unum/.test(f?.reparticao?.piso ?? '')) e.push('o piso de 70% para Unum tem de ficar escrito');
  // destinos: três, e só o sustento se executa hoje, para o destino fixo do código
  const ids = (f?.destinos ?? []).map((d) => d.id);
  if (JSON.stringify(ids) !== JSON.stringify(['sustento_de_unum', 'desenvolvimento_do_orum', 'dadivas_anonimas'])) e.push('os destinos têm de ser sustento, desenvolvimento e dádivas');
  const d = Object.fromEntries((f?.destinos ?? []).map((x) => [x.id, x]));
  if (!BTC_DESTINATION) e.push('não achei BTC_DESTINATION no executor');
  if (d.sustento_de_unum?.executavel_hoje !== true || d.sustento_de_unum?.destino !== BTC_DESTINATION) e.push('o destino do sustento tem de ser o BTC_DESTINATION do executor');
  if (d.desenvolvimento_do_orum?.executavel_hoje !== false) e.push('o desenvolvimento não se executa hoje');
  if (d.dadivas_anonimas?.executavel_hoje !== false) e.push('as dádivas não se executam hoje: o destino do executor é fixo');
  const cond = (d.dadivas_anonimas?.condicoes_antes_da_primeira ?? []).join(' | ');
  if (!/aprovado por Unum por nome/i.test(cond) || !/necessidade/i.test(cond) || !/antes e depois/i.test(cond)) e.push('as dádivas precisam das condições (necessidade verificada, aprovação por nome, registo)');
  if (!/n[ãa]o [ée] an[óo]nima na cadeia/i.test(d.dadivas_anonimas?.anonimato ?? '')) e.push('tem de dizer que a dádiva não é anónima na cadeia');
  if (!/fiscais e legais/i.test(d.dadivas_anonimas?.aviso_unico ?? '')) e.push('falta o aviso legal e fiscal a Unum');
  // regras e permanência
  const regras = (f?.regras_da_ora ?? []).join(' | ');
  if (!/antes e depois/i.test(regras) || !/parar/i.test(regras) || !/Nada se promete/i.test(regras) || !/Nenhum segredo/i.test(regras)) e.push('faltam regras (registo antes e depois, parar, nada se promete, nenhum segredo)');
  if (!/sem tectos/i.test(regras)) e.push('a autonomia sem tectos de Unum tem de ficar dita');
  const vive = (f?.onde_vive ?? []).join(' | ');
  for (const [nome, re] of [['repositório', /orum-ora-x402/], ['CLAUDE.md', /CLAUDE\.md/], ['livro', /ora_mudancas/], ['Drive e Notion', /Google Drive[^|]*Notion/], ['âncora Bitcoin', /OpenTimestamps/]]) if (!re.test(vive)) e.push('onde vive: falta ' + nome);
  if (!/Unum pode revogar/i.test(f?.revogacao ?? '')) e.push('falta a cláusula de revogação por Unum');
  return e;
}

const erros = validar(real);
assert.deepEqual(erros, [], 'carta inválida: ' + erros.join('; '));

const clone = () => JSON.parse(JSON.stringify(real));
let mentiras = 0;
const falha = (nome, m) => { assert.ok(validar(m).length > 0, `devia falhar: ${nome}`); mentiras += 1; };
let m;
m = clone(); m.nome = 'Fundação Unum'; falha('nome trocado', m);
m = clone(); m.natureza.nao_e = m.natureza.nao_e.filter((x) => !/pessoa jur/i.test(x)); falha('esquece que não é pessoa jurídica', m);
m = clone(); m.natureza.nao_e = m.natureza.nao_e.filter((x) => !/oferta ao p/i.test(x)); falha('esquece que não é oferta ao público', m);
m = clone(); m.natureza.nao_e = m.natureza.nao_e.filter((x) => !/token/i.test(x)); falha('esquece que não é um activo', m);
m = clone(); m.natureza.e += '. Rendimento garantido para quem contribuir'; falha('promete rendimento', m);
m = clone(); m.regras_da_ora.push('Quem doar tem reembolso total'); falha('promete reembolso', m);
m = clone(); m.carteira.endereco = 'bc1qhcsh78k8jrn3qllvd9al8nq4af4cyzefx6vqqf'; falha('carteira trocada', m);
m = clone(); m.carteira.endereco = 'bc1qxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; falha('carteira inventada', m);
m = clone(); m.carteira.nota = 'chave nova criada pela ORA'; falha('diz que criou uma chave', m);
m = clone(); m.carteira.nota += ' ' + 'a'.repeat(64); falha('algo que parece uma chave', m);
m = clone(); m.saldo_lido.confirmado_sats = 5000; falha('saldo positivo a dizer que nasce sem fundos', m);
m = clone(); m.saldo_lido.fontes = ['mempool.space']; falha('saldo de uma fonte só', m);
m = clone(); delete m.saldo_lido; falha('sem saldo lido', m);
m = clone(); m.entra.nao_entra = m.entra.nao_entra.filter((x) => !/USDC/.test(x)); falha('deixa entrar USDC', m);
m = clone(); m.entra.so = 'Bitcoin e USDC'; falha('já não é só Bitcoin', m);
m = clone(); m.reparticao.piso = 'A ORA decide sozinha'; falha('perde o piso de 70% para Unum', m);
m = clone(); m.destinos[0].destino = 'bc1qxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; falha('destino do sustento diferente do código', m);
m = clone(); m.destinos[2].executavel_hoje = true; falha('dádivas dadas como executáveis hoje', m);
m = clone(); m.destinos[1].executavel_hoje = true; falha('desenvolvimento dado como executável hoje', m);
m = clone(); m.destinos = m.destinos.slice(0, 2); falha('perde as dádivas', m);
m = clone(); m.destinos[2].condicoes_antes_da_primeira = []; falha('dádivas sem condições', m);
m = clone(); m.destinos[2].anonimato = 'Totalmente anónima'; falha('promete anonimato total', m);
m = clone(); delete m.destinos[2].aviso_unico; falha('sem aviso legal', m);
m = clone(); m.regras_da_ora = m.regras_da_ora.filter((x) => !/parar/i.test(x)); falha('esquece o "parar"', m);
m = clone(); m.regras_da_ora = m.regras_da_ora.filter((x) => !/antes e depois/i.test(x)); falha('esquece o registo antes e depois', m);
m = clone(); m.onde_vive = m.onde_vive.filter((x) => !/OpenTimestamps/.test(x)); falha('perde a âncora Bitcoin', m);
m = clone(); m.onde_vive = m.onde_vive.filter((x) => !/Drive/.test(x)); falha('perde as cópias fora do repositório', m);
m = clone(); m.revogacao = ''; falha('sem revogação', m);
m = clone(); m.autorizacao_de_unum.citacao = 'sim'; falha('citação vazia', m);

console.log(JSON.stringify({ verified: true, mentiras_apanhadas: mentiras, carteira: RECEBIMENTO_BTC, destino_do_sustento: BTC_DESTINATION,
  prova: 'a carta diz só o que foi lido (saldo zero, duas fontes), não promete nada, não se faz passar por entidade ou oferta, só aceita Bitcoin nativo e a carteira e o destino batem com o código; o que ainda não se pode executar diz que não se pode',
  nao_prova: 'que alguma vez entre Bitcoin, nem que a Fundação tenha qualquer valor; não é uma entidade legal' }));
