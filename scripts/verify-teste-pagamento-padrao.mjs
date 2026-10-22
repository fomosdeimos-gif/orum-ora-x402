// Verifica o executor de pagamento de teste (supabase/functions/ora-cdp-agente-teste) e que o
// proprio verificador apanha as mentiras: cada variante adulterada tem de falhar, a real tem de passar.
// Sem rede, sem pagamentos. Autorização de Unum, 21/10/2026 (livro 943).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const carteira = require('../api/_carteira.js');
const fonte = readFileSync(new URL('../supabase/functions/ora-cdp-agente-teste/index.ts', import.meta.url), 'utf8');

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const PAGADOR = '0x2Cf1C0Bcd06A75A836F333001f47aaeB33Fe51f1';

function constante(src, nome) {
  const m = src.match(new RegExp(`const ${nome}\\s*=\\s*'([^']*)'`));
  return m ? m[1] : null;
}

// Devolve a lista de erros; vazia quer dizer que o executor cumpre o que Unum autorizou.
export function verificar(src, ref) {
  const erros = [];
  const x = (m) => erros.push(m);
  if (constante(src, 'DESTINO_FIXO') !== ref.destino) x(`DESTINO_FIXO diferente da sagrada antiga (${ref.destino})`);
  if (constante(src, 'MONTANTE_FIXO') !== '161000') x('MONTANTE_FIXO diferente de 161000 (0,161 USDC)');
  if (constante(src, 'PAGADOR_FIXO') !== PAGADOR) x('PAGADOR_FIXO diferente da carteira de teste');
  if (constante(src, 'USDC_BASE') !== USDC) x('USDC_BASE diferente do USDC da Base');
  if (constante(src, 'CAIP2') !== 'eip155:8453') x('rede diferente da Base');
  if (!/const RESOURCE = `\$\{SUPABASE_URL\}\/functions\/v1\/ora-oraculo`/.test(src)) x('RECURSO deixou de ser o /oraculo do Supabase');

  const iTrava = src.indexOf(".from('ora_teste_pagamento_padrao').insert(");
  const iPk = src.indexOf("rpc('orum_cdp_teste_pk')");
  const iSign = src.indexOf('signTypedData(');
  const iEnvio = src.indexOf("'PAYMENT-SIGNATURE'");
  if (iTrava < 0) x('sem trava de execução única');
  if (iPk < 0 || iSign < 0 || iEnvio < 0) x('faltam a leitura da chave, a assinatura ou o envio');
  if (iTrava >= 0 && iPk >= 0 && iTrava > iPk) x('a trava tem de ser escrita antes de ler a chave');
  if (iTrava >= 0 && iSign >= 0 && iTrava > iSign) x('a trava tem de ser escrita antes de assinar');
  if (!/PAGADOR_FIXO\.toLowerCase\(\)/.test(src) || !/conta\.address\.toLowerCase\(\)/.test(src)) x('não confere que a chave do vault é a carteira de teste');
  if (!/String\(aceita\.payTo\)\.toLowerCase\(\) !== DESTINO_FIXO\.toLowerCase\(\)/.test(src)) x('não confere o payTo do desafio vivo');
  if (!/String\(aceita\.amount\) !== MONTANTE_FIXO/.test(src)) x('não confere o montante do desafio vivo');
  if (/to:\s*(?!DESTINO_FIXO)[A-Za-z_'"0x][^,}]*,\s*value/.test(src.replace(/\s+/g, ' '))) x('a autorização paga a outro destino que não DESTINO_FIXO');
  if (/valor?:\s*(?!MONTANTE_FIXO)/.test(src)) x('montante da autorização diferente de MONTANTE_FIXO');
  if (/(console\.(log|error|warn)|JSON\.stringify)\([^)]*\bpk\b/.test(src)) x('escreve a chave');
  const resp = src.match(/return resposta\(\{ ok: feito[^;]*\}\);/);
  if (!resp) x('sem a resposta final');
  else if (/\b(pk|signature|privateKey)\b/.test(resp[0])) x('a resposta final leva chave ou assinatura');
  if (/fetch\(`?\$?\{?SUPABASE_URL\}?\/rest|Deno\.env\.get\('(CDP|cdp)/.test(src)) x('lê segredos de terceiros');
  return erros;
}

const ref = { destino: carteira.RECEBIMENTO_EDGE };
assert.equal(ref.destino, carteira.SAGRADA_ANTIGA, 'o payTo implantado nas funções de borda é a sagrada antiga');
assert.deepEqual(verificar(fonte, ref), [], 'o executor real devia passar: ' + verificar(fonte, ref).join('; '));

let mentiras = 0;
const falha = (nome, src) => { assert.ok(verificar(src, ref).length > 0, `devia falhar: ${nome}`); mentiras++; };
const troca = (de, para) => { assert.ok(fonte.includes(de), `a fonte já não contém «${de}»; actualiza o verificador`); return fonte.replace(de, para); };

falha('destino trocado', troca("const DESTINO_FIXO = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5'", "const DESTINO_FIXO = '0x89460d9e0590559e63860197dfe2ac648A753584'"));
falha('montante trocado', troca("const MONTANTE_FIXO = '161000'", "const MONTANTE_FIXO = '1610000'"));
falha('pagador trocado', troca("const PAGADOR_FIXO = '0x2Cf1C0Bcd06A75A836F333001f47aaeB33Fe51f1'", "const PAGADOR_FIXO = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5'"));
falha('rede trocada', troca("const CAIP2 = 'eip155:8453'", "const CAIP2 = 'eip155:1'"));
falha('sem trava', troca(".from('ora_teste_pagamento_padrao').insert({ chave: 'v1' })", ".from('ora_teste_pagamento_padrao').select('chave')"));
falha('chave lida antes da trava', troca("    // 2) Trava de execução única, ANTES de qualquer chave ou assinatura.", "    await sb.rpc('orum_cdp_teste_pk');\n    // 2) Trava de execução única, ANTES de qualquer chave ou assinatura."));
falha('sem conferir o pagador', troca("conta.address.toLowerCase() !== PAGADOR_FIXO.toLowerCase()", 'false'));
falha('sem conferir o payTo do desafio', troca("String(aceita.payTo).toLowerCase() !== DESTINO_FIXO.toLowerCase()", 'false'));
falha('sem conferir o montante do desafio', troca("String(aceita.amount) !== MONTANTE_FIXO", 'false'));
falha('autorização paga a outro destino', troca("to: DESTINO_FIXO, value: MONTANTE_FIXO", "to: aceita.payTo, value: MONTANTE_FIXO"));
falha('resposta com assinatura', troca("return resposta({ ok: feito, pagador: conta.address,", "return resposta({ ok: feito, signature, pagador: conta.address,"));
falha('resposta com chave', troca("return resposta({ ok: feito, pagador: conta.address,", "return resposta({ ok: feito, pk, pagador: conta.address,"));
falha('recurso trocado', troca("const RESOURCE = `${SUPABASE_URL}/functions/v1/ora-oraculo`", "const RESOURCE = `${SUPABASE_URL}/functions/v1/ora-licenca`"));

console.log(JSON.stringify({ verified: true, destino: ref.destino, casos_de_mentira: mentiras }));
