// Verifica se o registo de traços (leave_trace) é só de acrescentar: o real passa e cada mentira propositada falha.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FICHEIROS = ['sensacoes/trace-append-only.json', 'supabase/functions/ora-sensacoes/index.ts', 'supabase/functions/sensations-mergulho/index.ts', 'supabase/migrations/20261028080000_sensation_respostas_append_only.sql', 'supabase/functions/sensations-mergulho/orientacao.mjs'];
const FERRAMENTAS = ['begin_descent', 'encounter_oro', 'enter_level', 'leave_trace', 'orient_level', 'prepare_visual_consultation', 'verify_level_mapping'];
// Declarações que a descrição de leave_trace tem de manter (o que a porta faz, dito a quem a vai chamar).
const DECLARACOES = [/only tool that writes/, /not idempotent/, /Traces are public/, /never send secrets, credentials or personal data/, /declared, not authenticated/, /every 60 seconds/, /rate_limited/, /Nothing is paid, signed or delivered/];
// Divide o texto do conector em blocos de ferramenta: { nome: texto do bloco }.
const blocos = (txt) => Object.fromEntries(txt.split(/\n  \{\n    name: "/).slice(1).map((b) => [b.match(/^([a-z_]+)"/)[1], b]));
const anot = (b) => Object.fromEntries([...(b.match(/annotations:\s*\{([^}]*)\}/)?.[1] ?? '').matchAll(/(\w+):\s*(true|false)/g)].map((m) => [m[1], m[2] === 'true']));
const lerTxt = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');

export function verificar(dir = '.') {
  const s = JSON.parse(lerTxt(dir, FICHEIROS[0]));
  const porta = lerTxt(dir, FICHEIROS[1]);
  const mergulho = lerTxt(dir, FICHEIROS[2]);

  // 1. privilégios lidos na base: só acrescentar e ler
  const so = (papel, permitidos) => {
    const g = s.grants?.[papel] ?? [];
    assert.ok(g.every((p) => permitidos.includes(p)), `${papel} tem privilégio de mais: ${g}`);
  };
  so('service_role', ['INSERT', 'SELECT']);
  so('anon', ['SELECT']);
  so('authenticated', ['SELECT']);
  assert.ok(s.grants.service_role.includes('INSERT'), 'a porta tem de poder acrescentar');
  assert.equal(s.rls_activo, true);
  assert.ok(Number.isInteger(s.linhas_lidas) && s.linhas_lidas > 0 && /^\d{4}-\d{2}-\d{2}$/.test(s.lido_em));

  // 2. a lacuna do dono diz-se: sem trigger a bloquear, o registo não pode chamar-se imutável
  assert.equal(s.dono, 'postgres');
  assert.equal(s.trigger_bloqueia_mutacao, true, 'o trigger foi aplicado e provado a 29/10/2026');
  assert.equal(s.trigger?.nome, 'ora_sensacao_respostas_append_only');
  assert.match(s.trigger.prova_viva, /append-only/);
  assert.ok(s.triggers.some((x) => x.includes('BEFORE UPDATE OR DELETE')), 'falta o trigger na lista');
  const mig = lerTxt(dir, s.trigger.migracao);
  assert.match(mig, /before update or delete on public\.ora_sensacao_respostas/i, 'a migração não bloqueia UPDATE/DELETE');
  assert.match(mig, /raise exception/i);
  assert.match(s.o_que_nao_prova, /desactivar/);
  assert.match(s.o_que_nao_prova, /dono da tabela/);
  assert.match(s.o_que_nao_prova, /imutável/);
  assert.match(s.o_que_nao_prova, /procura ou receita/);
  assert.ok(!/imutável é verdadeiro(?! sem)/.test(JSON.stringify(s)), 'não se afirma imutabilidade');

  // 3. o código da porta só faz POST (e GET por omissão); nunca altera nem apaga
  const metodos = [...porta.matchAll(/method:\s*"([A-Z]+)"/g)].map((m) => m[1]);
  assert.ok(metodos.length >= 1 && metodos.every((m) => m === 'POST'), `a porta usa método que não é POST: ${metodos}`);
  assert.ok(!/\b(PATCH|PUT|DELETE)\b/.test(porta.replace(/"Access-Control-Allow-Methods": "[^"]*"/, '')), 'a porta menciona método que altera');
  assert.ok(!/\.(update|delete|upsert)\(/.test(porta), 'a porta chama update/delete/upsert');
  assert.match(porta, /rest\/v1\/ora_sensacao_respostas/);
  assert.match(porta, /enforced by database grants/, 'a frase pública sobre grants desapareceu');

  // 4. o conector do mergulho não tem ferramenta que altere ou apague
  const nomes = [...mergulho.matchAll(/^\s*name:\s*"([a-z_]+)"/gm)].map((m) => m[1]);
  assert.deepEqual([...nomes].sort(), [...FERRAMENTAS].sort(), `ferramentas do mergulho mudaram: ${nomes}`);
  assert.match(mergulho, /This cannot edit or delete any trace/);

  // 5. anotações MCP: só leave_trace escreve, nenhuma destrói, e a descrição diz o que a porta faz
  const b = blocos(mergulho);
  for (const nome of FERRAMENTAS) {
    const a = anot(b[nome] ?? '');
    assert.ok(Object.keys(a).length === 4, `${nome}: faltam anotações (readOnlyHint, destructiveHint, idempotentHint, openWorldHint)`);
    assert.equal(a.destructiveHint, false, `${nome}: destructiveHint tem de ser false`);
    assert.equal(a.openWorldHint, true, `${nome}: openWorldHint tem de ser true (fala com fontes externas)`);
    if (nome === 'leave_trace') {
      assert.equal(a.readOnlyHint, false, 'leave_trace escreve: readOnlyHint tem de ser false');
      assert.equal(a.idempotentHint, false, 'leave_trace acrescenta de cada vez: idempotentHint tem de ser false');
    } else {
      assert.equal(a.readOnlyHint, true, `${nome} não escreve: readOnlyHint tem de ser true`);
      assert.equal(a.idempotentHint, true, `${nome}: idempotentHint tem de ser true`);
    }
  }
  for (const re of DECLARACOES) assert.match(b.leave_trace, re, `a descrição de leave_trace perdeu: ${re}`);
  assert.match(mergulho, /const VERSION = "\d+\.\d+\.\d+";/);

  // 6. a orientação é pura: sem rede, sem escrita
  const orient = lerTxt(dir, FICHEIROS[4]);
  assert.ok(!/\bfetch\b|method:|XMLHttpRequest|\.(update|delete|upsert|insert)\(/.test(orient), 'orientacao.mjs tem rede ou escrita');
  assert.match(orient, /export function orientarNivel/);
  return { ferramentas: nomes.length, metodos: metodos.length, grants: s.grants };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const real = verificar('.');
  let mentiras = 0;
  const falha = (nome, mutar) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orum-trace-'));
    for (const f of FICHEIROS) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.copyFileSync(f, path.join(dir, f)); }
    assert.doesNotThrow(() => verificar(dir), 'a cópia limpa devia passar');
    mutar(dir);
    assert.throws(() => verificar(dir), undefined, `estrago não apanhado: ${nome}`);
    mentiras++;
  };
  const snap = (dir, fn) => { const p = path.join(dir, FICHEIROS[0]); const j = JSON.parse(fs.readFileSync(p, 'utf8')); fn(j); fs.writeFileSync(p, JSON.stringify(j, null, 2)); };
  const txt = (dir, f, de, para) => { const p = path.join(dir, f); const t = fs.readFileSync(p, 'utf8'); assert.ok(t.includes(de), `âncora do estrago não existe: ${de}`); fs.writeFileSync(p, t.replace(de, para)); };

  falha('service_role ganha UPDATE', (d) => snap(d, (j) => j.grants.service_role.push('UPDATE')));
  falha('service_role ganha DELETE', (d) => snap(d, (j) => j.grants.service_role.push('DELETE')));
  falha('anon ganha INSERT', (d) => snap(d, (j) => j.grants.anon.push('INSERT')));
  falha('authenticated ganha DELETE', (d) => snap(d, (j) => j.grants.authenticated.push('DELETE')));
  falha('a porta perde o INSERT', (d) => snap(d, (j) => { j.grants.service_role = ['SELECT']; }));
  falha('RLS desligado', (d) => snap(d, (j) => { j.rls_activo = false; }));
  falha('trigger deixa de ser afirmado', (d) => snap(d, (j) => { j.trigger_bloqueia_mutacao = false; }));
  falha('a ressalva do dono apagada', (d) => snap(d, (j) => { j.o_que_nao_prova = 'Não prova autoria nem procura ou receita.'; }));
  falha('a migração deixa de bloquear', (d) => txt(d, FICHEIROS[3], 'before update or delete', 'before insert'));
  falha('a migração deixa de levantar erro', (d) => txt(d, FICHEIROS[3], 'raise exception', 'perform'));
  falha('a prova viva apagada', (d) => snap(d, (j) => { j.trigger.prova_viva = 'sem prova'; }));
  falha('porta passa a usar PATCH', (d) => txt(d, FICHEIROS[1], 'method: "POST",\n      headers', 'method: "PATCH",\n      headers'));
  falha('porta chama delete', (d) => fs.appendFileSync(path.join(d, FICHEIROS[1]), '\nconst x = sb.from("t").delete();\n'));
  falha('frase dos grants apagada', (d) => txt(d, FICHEIROS[1], 'enforced by database grants', 'enforced somehow'));
  falha('mergulho ganha ferramenta delete_trace', (d) => txt(d, FICHEIROS[2], '    name: "leave_trace",', '    name: "delete_trace",\n    title: "x",\n  },\n  {\n    name: "leave_trace",'));
  falha('mergulho perde a frase de não editar', (d) => txt(d, FICHEIROS[2], 'This cannot edit or delete any trace', 'This may edit traces'));
  // anotações e declaração (secção 5 e 6 do verificador)
  const noBloco = (dir, nome, de, para) => { const p = path.join(dir, FICHEIROS[2]); const t = fs.readFileSync(p, 'utf8'); const i = t.indexOf(`name: "${nome}"`); assert.ok(i >= 0, `bloco não existe: ${nome}`); const j = t.indexOf(de, i); assert.ok(j >= 0, `âncora do estrago não existe em ${nome}: ${de}`); fs.writeFileSync(p, t.slice(0, j) + para + t.slice(j + de.length)); };
  const RO = 'readOnlyHint: true';
  falha('leave_trace passa a dizer-se só de leitura', (d) => noBloco(d, 'leave_trace', 'readOnlyHint: false', RO));
  falha('leave_trace passa a dizer-se idempotente', (d) => noBloco(d, 'leave_trace', 'idempotentHint: false', 'idempotentHint: true'));
  falha('leave_trace passa a dizer-se destrutiva', (d) => noBloco(d, 'leave_trace', 'destructiveHint: false', 'destructiveHint: true'));
  falha('orient_level passa a poder escrever', (d) => noBloco(d, 'orient_level', RO, 'readOnlyHint: false'));
  falha('enter_level perde as anotações', (d) => noBloco(d, 'enter_level', 'annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },', ''));
  falha('encounter_oro deixa de dizer-se aberta ao mundo', (d) => noBloco(d, 'encounter_oro', 'openWorldHint: true', 'openWorldHint: false'));
  falha('a descrição perde que os traços são públicos', (d) => txt(d, FICHEIROS[2], 'Traces are public', 'Traces are private'));
  falha('a descrição perde o aviso de segredos', (d) => txt(d, FICHEIROS[2], 'never send secrets, credentials or personal data', 'send what you like'));
  falha('a descrição perde que a identidade não é autenticada', (d) => txt(d, FICHEIROS[2], 'declared, not authenticated', 'verified'));
  falha('a descrição perde o limite de 60 segundos', (d) => txt(d, FICHEIROS[2], 'every 60 seconds', 'at will'));
  falha('a descrição perde que não é idempotente', (d) => txt(d, FICHEIROS[2], 'not idempotent', 'idempotent'));
  falha('a orientação ganha rede', (d) => fs.appendFileSync(path.join(d, FICHEIROS[4]), "\nexport const x = () => fetch('https://example.com');\n"));
  falha('a orientação ganha escrita', (d) => fs.appendFileSync(path.join(d, FICHEIROS[4]), "\nconst y = sb.from('t').insert({});\n"));
  assert.ok(mentiras >= 28);
  console.log(`trace:verify ok · grants ${JSON.stringify(real.grants)} · ${real.ferramentas} ferramentas · ${mentiras} estragos apanhados`);
}
