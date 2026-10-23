// Verifica a decisão do aviso por email (ora-acesso-notificar V3): o cabeçalho de pagamento sozinho não é pagamento.
// Os casos 85129-85133 são linhas reais de ora_acessos_log de 23/10/2026 14:33 UTC (x402lint, HEAD, 402/409), que geraram 2 emails falsos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DIR = 'supabase/functions/ora-acesso-notificar';
const FONTE = path.resolve(DIR, 'decisao.mjs');
const INDEX = fs.readFileSync(path.join(DIR, 'index.ts'), 'utf8');
const UA = 'x402lint/0.1 (+https://x402lint.dev)';

const casos = [
  ['linha 85129: HEAD /ora-oraculo com cabeçalho, sem estado', { tem_pagamento: true, metodo: 'HEAD', user_agent: UA, status_code: null }, undefined, false],
  ['linha 85130: HEAD /ora-x402 com cabeçalho, 402', { tem_pagamento: true, metodo: 'HEAD', user_agent: UA, status_code: 402 }, undefined, false],
  ['linha 85131: HEAD licença 409', { tem_pagamento: true, metodo: 'HEAD', user_agent: UA, status_code: 409 }, undefined, false],
  ['HEAD com cabeçalho e 200 (um HEAD nunca entrega)', { tem_pagamento: true, metodo: 'HEAD', status_code: 200 }, undefined, false],
  ['HEAD sem estado com pagamento verificado por outro', { tem_pagamento: true, metodo: 'HEAD', status_code: null }, true, false],
  ['GET com cabeçalho e 402 (pagamento recusado)', { tem_pagamento: true, metodo: 'GET', status_code: 402 }, undefined, false],
  ['GET com cabeçalho e 500', { tem_pagamento: true, metodo: 'GET', status_code: 500 }, undefined, false],
  ['sem cabeçalho e 200', { tem_pagamento: false, metodo: 'GET', status_code: 200 }, undefined, false],
  ['GET sem estado e sem pagamento verificado (oráculo)', { tem_pagamento: true, metodo: 'GET', status_code: null }, false, false],
  ['estado inválido', { tem_pagamento: true, metodo: 'GET', status_code: '200' }, undefined, false],
  ['corpo vazio', {}, undefined, false],
  ['GET com cabeçalho e 200 (entrega)', { tem_pagamento: true, metodo: 'GET', status_code: 200 }, undefined, true],
  ['GET com cabeçalho e 201', { tem_pagamento: true, metodo: 'POST', status_code: 201 }, undefined, true],
  ['GET sem estado mas pagamento verificado na cadeia (oráculo)', { tem_pagamento: true, metodo: 'GET', status_code: undefined }, true, true],
];

async function correr(ficheiro) {
  const { classificar } = await import(pathToFileURL(ficheiro).href + '?v=' + Math.random());
  for (const [nome, acesso, rec, esperado] of casos) {
    const r = classificar(acesso, rec);
    assert.equal(r.enviar, esperado, `${nome}: esperava enviar=${esperado}, deu ${r.enviar} (${r.motivo})`);
    assert.ok(typeof r.motivo === 'string' && r.motivo.length > 0, `${nome}: sem motivo`);
  }
}
await correr(FONTE);

// O index.ts tem de usar a decisão antes de enviar, e só espera pela cadeia quando o estado é desconhecido.
assert.ok(/import \{ classificar \} from "\.\/decisao\.mjs"/.test(INDEX), 'index.ts importa classificar');
const iDec = INDEX.indexOf('classificar(acesso, undefined)'), iMail = INDEX.indexOf('fetch(MAILER_URL');
assert.ok(iDec > 0 && iMail > iDec, 'a decisão vem antes do envio');
assert.ok(!INDEX.includes('if (!acesso.tem_pagamento)'), 'o teste antigo (só o cabeçalho) desapareceu');
assert.ok(/\.eq\("status", "verificado_onchain"\)/.test(INDEX), 'a espera usa só pagamentos verificados na cadeia');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aviso-'));
const original = fs.readFileSync(FONTE, 'utf8');
const estragos = [
  ['cabeçalho chega para enviar', "if (!acesso || acesso.tem_pagamento !== true) return { enviar: false, motivo: 'sem_cabecalho_de_pagamento' };", "if (!acesso) return { enviar: false, motivo: 'x' }; if (acesso.tem_pagamento === true) return { enviar: true, motivo: 'cabecalho' };"],
  ['HEAD passa', "if (metodo === 'HEAD' || metodo === 'OPTIONS') return", "if (false) return"],
  ['402 passa', "if (s >= 200 && s < 300) return { enviar: true, motivo: 'resposta_2xx' };", "if (s >= 200 && s < 500) return { enviar: true, motivo: 'resposta_2xx' };"],
  ['500 passa', "if (s >= 200 && s < 300) return { enviar: true, motivo: 'resposta_2xx' };", "if (s >= 200) return { enviar: true, motivo: 'resposta_2xx' };"],
  ['estado desconhecido passa sem cadeia', "return pagamentoVerificadoRecente === true\n      ? ", "return true\n      ? "],
  ['estado desconhecido nunca passa', "? { enviar: true, motivo: 'pagamento_verificado_na_cadeia' }", "? { enviar: false, motivo: 'pagamento_verificado_na_cadeia' }"],
  ['estado em texto passa', "if (!Number.isInteger(s)) return { enviar: false, motivo: 'estado_invalido' };", ""],
  ['200 deixa de passar', "if (s >= 200 && s < 300) return { enviar: true, motivo: 'resposta_2xx' };", "if (s >= 201 && s < 300) return { enviar: true, motivo: 'resposta_2xx' };"],
];
let n = 0;
for (const [nome, de, para] of estragos) {
  assert.ok(original.includes(de), 'texto a estragar existe: ' + nome);
  const f = path.join(dir, `d${n}.mjs`);
  fs.writeFileSync(f, original.replace(de, para));
  let apanhou = false;
  try { await correr(f); } catch { apanhou = true; }
  assert.ok(apanhou, 'estrago não apanhado: ' + nome);
  n++;
}
// Estragos no index.ts (texto): voltar ao teste antigo ou enviar antes de decidir.
const mentirasIndex = [
  ['volta ao teste só do cabeçalho', (t) => t.replace('let decisao = classificar(acesso, undefined);', 'if (!acesso.tem_pagamento) { return new Response("x"); } let decisao = { enviar: true, motivo: "x" };')],
  ['espera por qualquer pagamento, não só verificado', (t) => t.replace('.eq("status", "verificado_onchain")', '')],
];
for (const [nome, f] of mentirasIndex) {
  const t = f(INDEX);
  const falhou = !(/import \{ classificar \}/.test(t) && t.indexOf('classificar(acesso, undefined)') > 0 && !t.includes('if (!acesso.tem_pagamento)') && /\.eq\("status", "verificado_onchain"\)/.test(t));
  assert.ok(falhou, 'estrago no index.ts não apanhado: ' + nome);
  n++;
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(JSON.stringify({ verified: true, casos: casos.length, estragos_apanhados: n }));
