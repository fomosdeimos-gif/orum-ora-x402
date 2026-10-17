// Verifica que assinar.html mostra exactamente o texto de docs/financeiro-mandato-v2.msg,
// que esse texto cita o hash real da constituicao v3 e os quatro enderecos registados,
// e que a pagina so pede uma assinatura de mensagem (nada de transaccoes nem aprovacoes).
// Uso: node scripts/verify-assinar.mjs [--selftest]
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = f => readFileSync(join(raiz, f), 'utf8');

const SAGRADA_BASE = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';
// carteira sagrada adicional (MetaMask): assina o mandato v2; registada em CLAUDE.md por Unum a 17/10/2026
const ASSINANTE = '0x2ef8cfB97EcCcf7C62f551639fe6dB79022d0d8C';
const SAGRADA_BTC = 'bc1qhcsh78k8jrn3qllvd9al8nq4af4cyzefx6vqqf';
const OPER_BASE = '0x89460d9e0590559e63860197dfe2ac648A753584';
const OPER_BTC = 'bc1qfs8967x9mzhwhcse4z7kjuuhsmx0kmz5v6j9w7';

const desescapar = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export function verificar({ html, msg, v3 }) {
  const falhas = [];
  const falha = t => falhas.push(t);
  const m = html.match(/<pre id="mensagem">([\s\S]*?)<\/pre>/);
  if (!m) falha('pagina sem <pre id="mensagem">');
  else if (desescapar(m[1]) !== msg.replace(/\n+$/, '')) falha('o texto da pagina difere de docs/financeiro-mandato-v2.msg');

  const hash = createHash('sha256').update(v3).digest('hex');
  if (!msg.includes('sha256 ' + hash)) falha('o hash citado na mensagem nao e o sha256 de economia/constituicao-v3-proposta.json (' + hash + ')');

  for (const [nome, a] of [['sagrada Base (app da Base)', SAGRADA_BASE], ['sagrada adicional (assinante)', ASSINANTE], ['sagrada Bitcoin', SAGRADA_BTC], ['operacional Base', OPER_BASE], ['operacional Bitcoin', OPER_BTC]])
    if (!msg.includes(a)) falha('a mensagem nao cita o endereco ' + nome);

  // nenhum endereco desconhecido na mensagem
  const conhecidos = new Set([SAGRADA_BASE, ASSINANTE, SAGRADA_BTC, OPER_BASE, OPER_BTC].map(x => x.toLowerCase()));
  for (const e of msg.match(/0x[0-9a-fA-F]{40}|bc1[0-9a-z]{20,}/g) || [])
    if (!conhecidos.has(e.toLowerCase())) falha('endereco nao registado na mensagem: ' + e);

  if (!msg.includes('nao autoriza nenhuma transaccao em cadeia')) falha('a mensagem tem de dizer que nao autoriza nenhuma transaccao em cadeia');
  if (!/Fora do mandato:.*aprovacao ilimitada/.test(msg)) falha('a mensagem tem de excluir a aprovacao ilimitada');

  if (!html.includes(`const ESPERADA='${ASSINANTE}'`)) falha('ESPERADA da pagina nao e a carteira que assina o mandato');
  if (!/controlador da carteira 0x2ef8cfB97EcCcf7C62f551639fe6dB79022d0d8C/.test(msg)) falha('a mensagem tem de dizer que quem assina e o controlador do assinante');
  const claude = readFileSync(join(raiz, 'CLAUDE.md'), 'utf8');
  if (!claude.includes('`' + ASSINANTE + '`')) falha('o assinante nao esta registado em CLAUDE.md');

  // o codigo da pagina (sem o texto visivel) so pode usar eth_requestAccounts e personal_sign
  const script = (html.match(/<script>([\s\S]*?)<\/script>/) || [, ''])[1];
  if (!script) falha('pagina sem script');
  if (/<script[^>]*\ssrc=/i.test(html)) falha('a pagina carrega um script externo');
  for (const proibido of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'localStorage', 'sessionStorage', 'indexedDB', 'eth_sendTransaction', 'eth_signTransaction', 'eth_signTypedData', 'eth_sign\'', 'wallet_', 'eth_sendRawTransaction', 'import('])
    if (script.includes(proibido)) falha('o script usa ' + proibido);
  const metodos = [...script.matchAll(/method:'([^']+)'/g)].map(x => x[1]).sort();
  if (JSON.stringify(metodos) !== JSON.stringify(['eth_requestAccounts', 'personal_sign'])) falha('metodos da carteira inesperados: ' + metodos.join(','));
  if (!/params:\[hex\(msg\),conta\]/.test(script)) falha('personal_sign tem de assinar o texto da pagina (hex(msg)) com a conta ligada');
  if (!/conta\.toLowerCase\(\)!==ESPERADA\.toLowerCase\(\)/.test(script)) falha('a pagina tem de recusar contas que nao sejam a sagrada');
  return falhas;
}

function carregar() {
  return { html: ler('assinar.html'), msg: ler('docs/financeiro-mandato-v2.msg'), v3: readFileSync(join(raiz, 'economia/constituicao-v3-proposta.json')) };
}

const base = carregar();
const reais = verificar({ ...base, v3: base.v3 });
if (reais.length) { console.error('assinar:verify FALHOU\n- ' + reais.join('\n- ')); process.exit(1); }

if (process.argv.includes('--selftest')) {
  // cada mentira tem de fazer falhar o verificador
  const casos = {
    'texto da pagina alterado': { ...base, html: base.html.replace('5 USDC', '500 USDC') },
    'mensagem alterada sem a pagina': { ...base, msg: base.msg.replace('5 USDC', '500 USDC') },
    'hash falso': { ...base, v3: Buffer.from('outra coisa') },
    'endereco desconhecido': { ...base, msg: base.msg.replace(OPER_BASE, '0x1111111111111111111111111111111111111111'), html: base.html.replace(OPER_BASE, '0x1111111111111111111111111111111111111111') },
    'sem aviso de transaccao': { ...base, msg: base.msg.replace('nao autoriza nenhuma transaccao em cadeia', 'autoriza'), html: base.html.replace('nao autoriza nenhuma transaccao em cadeia', 'autoriza') },
    'script externo': { ...base, html: base.html.replace('<script>', '<script src="https://x.invalid/a.js"></script><script>') },
    'envia para a rede': { ...base, html: base.html.replace("const q=", "fetch('https://x.invalid',{method:'POST',body:msg});const q=") },
    'pede transaccao': { ...base, html: base.html.replace("method:'personal_sign'", "method:'eth_sendTransaction'") },
    'outro metodo': { ...base, html: base.html.replace("params:[hex(msg),conta]}", "params:[hex(msg),conta]});await window.ethereum.request({method:'wallet_switchEthereumChain'}") },
    'conta esperada trocada': { ...base, html: base.html.replace(`const ESPERADA='${ASSINANTE}'`, "const ESPERADA='0x0000000000000000000000000000000000000001'") },
    'aceita qualquer conta': { ...base, html: base.html.replace('conta.toLowerCase()!==ESPERADA.toLowerCase()', 'false') },
    'assina outro texto': { ...base, html: base.html.replace('params:[hex(msg),conta]', "params:[hex('outro'),conta]") },
  };
  let mal = 0;
  for (const [nome, entrada] of Object.entries(casos)) {
    if (verificar(entrada).length === 0) { console.error('selftest: a mentira "' + nome + '" NAO foi apanhada'); mal++; }
  }
  if (mal) process.exit(1);
  console.log(`assinar selftest: ok (${Object.keys(casos).length} mentiras apanhadas)`);
}
console.log('assinar:verify ok');
