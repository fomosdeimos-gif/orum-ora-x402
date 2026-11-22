// Verifica o pulso vivo (kit/pulso-vivo.mjs): classifica cada sinal pelos seus limites, deixa o relógio envelhecer a idade, e
// só diz "vivo" quando todos os sinais conhecidos estão dentro do limite. Depois estraga o algoritmo de propósito e exige que
// os testes falhem. Sem rede, sem pacotes.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const FICHEIRO = new URL('../kit/pulso-vivo.mjs', import.meta.url);
const fonte = fs.readFileSync(FICHEIRO, 'utf8');
async function carregar(src) { return import('data:text/javascript;base64,' + Buffer.from(src).toString('base64') + '#' + Math.random()); }

// Sinais com a forma real do conector ORUM-real (nomes e limites lidos a 21/11/2026; as idades são de teste).
const T0 = Date.parse('2026-11-21T18:42:00Z');
const real = () => [
  { sinal: 'sentinela_rondas', idade_min: 12, limite_atraso_min: 45, limite_morte_min: 120 },
  { sinal: 'acessos_log', idade_min: 1, limite_atraso_min: 240, limite_morte_min: 1440 },
  { sinal: 'aprendizagem_snapshot', idade_min: 402, limite_atraso_min: 1560, limite_morte_min: 2880 },
  { sinal: 'sedimento_log', idade_min: 1117, limite_atraso_min: 1560, limite_morte_min: 2880 },
  { sinal: 'memoria_autonoma', idade_min: 12, limite_atraso_min: 45, limite_morte_min: 120 },
  { sinal: 'publicado:catalogo', idade_min: 2, limite_atraso_min: 20, limite_morte_min: 60 },
  { sinal: 'publicado:integridade', idade_min: 12, limite_atraso_min: 60, limite_morte_min: 180 },
  { sinal: 'publicado:pulso', idade_min: 2, limite_atraso_min: 20, limite_morte_min: 60 },
];
const min = (n) => T0 + n * 60000;

async function testes(A) {
  // 1. leitura real, agora = medição: tudo vivo, ritmo dentro dos limites
  let p = A.pulso(real(), T0, T0);
  assert.equal(p.estado, 'vivo'); assert.equal(p.contagem.vivo, 8);
  assert.ok(p.ciclo_s >= A.CICLO_MIN && p.ciclo_s <= A.CICLO_MAX, 'ciclo fora dos limites');
  // 2. o relógio envelhece: 30 min depois os sinais de ritmo curto passam a atrasados e o conjunto também
  p = A.pulso(real(), T0, min(30));
  assert.equal(p.estado, 'atrasado'); assert.ok(p.contagem.atrasado >= 1);
  const cat = p.sinais.find((s) => s.nome === 'publicado:catalogo'); assert.equal(cat.estado, 'atrasado'); assert.ok(Math.abs(cat.idade - 32) < 1e-9);
  // 3. muito tempo depois: morto
  p = A.pulso(real(), T0, min(200)); assert.equal(p.estado, 'morto');
  // 4. limites exactos: idade == limite_atraso ainda é vivo; idade == limite_morte já é morto
  assert.equal(A.classificarSinal({ sinal: 'x', idade_min: 20, limite_atraso_min: 20, limite_morte_min: 60 }, T0, T0).estado, 'vivo');
  assert.equal(A.classificarSinal({ sinal: 'x', idade_min: 20.001, limite_atraso_min: 20, limite_morte_min: 60 }, T0, T0).estado, 'atrasado');
  assert.equal(A.classificarSinal({ sinal: 'x', idade_min: 60, limite_atraso_min: 20, limite_morte_min: 60 }, T0, T0).estado, 'morto');
  // 5. o ritmo nunca acelera com o tempo e nunca sai de [min, max]
  let ant = 0;
  for (let t = 0; t <= 3000; t += 7) { const q = A.pulso(real(), T0, min(t)); assert.ok(q.ciclo_s >= ant - 1e-9, 'o ritmo acelerou'); assert.ok(q.ciclo_s >= A.CICLO_MIN && q.ciclo_s <= A.CICLO_MAX); ant = q.ciclo_s; }
  // 6. o relógio nunca rejuvenesce: agora antes da medição não baixa a idade
  assert.equal(A.classificarSinal({ sinal: 'x', idade_min: 10, limite_atraso_min: 20, limite_morte_min: 60 }, T0, T0 - 5 * 3600e3).idade, 10);
  // 7. entradas inválidas são "desconhecido", nunca vivo
  for (const mau of [null, undefined, 'x', {}, { sinal: 'a', idade_min: -1, limite_atraso_min: 20, limite_morte_min: 60 }, { sinal: 'a', idade_min: 1, limite_atraso_min: 0, limite_morte_min: 60 }, { sinal: 'a', idade_min: 1, limite_atraso_min: 60, limite_morte_min: 20 }, { sinal: 'a', idade_min: NaN, limite_atraso_min: 20, limite_morte_min: 60 }, { sinal: 'a', idade_min: '3', limite_atraso_min: 20, limite_morte_min: 60 }])
    assert.equal(A.classificarSinal(mau, T0, T0).estado, 'desconhecido', 'devia ser desconhecido: ' + JSON.stringify(mau));
  // 8. sem sinais: não se afirma nada; lista inválida idem
  for (const v of [[], null, undefined, 'x', [null, {}]]) { const q = A.pulso(v, T0, T0); assert.equal(q.estado, 'sem_sinais'); assert.equal(q.ciclo_s, null); }
  // 9. um sinal ilegível entre sinais vivos: o conjunto é "incompleto", nunca "vivo"
  p = A.pulso([...real(), { sinal: 'lixo' }], T0, T0); assert.equal(p.estado, 'incompleto'); assert.equal(p.contagem.desconhecido, 1);
  // 10. hora de medição inválida: a idade fica a da medição (não se inventa envelhecimento)
  assert.equal(A.classificarSinal({ sinal: 'x', idade_min: 10, limite_atraso_min: 20, limite_morte_min: 60 }, NaN, T0).idade, 10);
  // 11. pior vence: um morto entre vivos faz o conjunto morto
  p = A.pulso([{ sinal: 'a', idade_min: 1, limite_atraso_min: 20, limite_morte_min: 60 }, { sinal: 'b', idade_min: 61, limite_atraso_min: 20, limite_morte_min: 60 }], T0, T0); assert.equal(p.estado, 'morto');
  // 12. atrasado e morto juntos: o morto vence; atrasado e desconhecido juntos: o atrasado vence
  p = A.pulso([{ sinal: 'a', idade_min: 30, limite_atraso_min: 20, limite_morte_min: 60 }, { sinal: 'b', idade_min: 61, limite_atraso_min: 20, limite_morte_min: 60 }], T0, T0); assert.equal(p.estado, 'morto');
  p = A.pulso([{ sinal: 'a', idade_min: 30, limite_atraso_min: 20, limite_morte_min: 60 }, { sinal: 'lixo' }], T0, T0); assert.equal(p.estado, 'atrasado');
}

await testes(await carregar(fonte));
console.log('Pulso vivo: casos conferidos.');

// Estragos propositados: cada um tem de fazer falhar os testes.
const estragos = [
  ['limite de atraso exclusivo', 'idade > la ? ', 'idade >= la ? '],
  ['limite de morte exclusivo', 'idade >= lm ? ', 'idade > lm ? '],
  ['o relógio rejuvenesce', 'Math.max(0, (a - m) / 60000)', '(a - m) / 60000'],
  ['sem envelhecimento', 'Math.max(0, (a - m) / 60000) : 0', '0 : 0'],
  ['entrada inválida conta como vivo', "estado: 'desconhecido', idade: null", "estado: 'vivo', idade: 0"],
  ['incompleto vira vivo', "c.desconhecido ? 'incompleto' : 'vivo'", "'vivo'"],
  ['o melhor vence', "c.morto ? 'morto' : c.atrasado ? 'atrasado'", "c.atrasado ? 'atrasado' : c.morto ? 'morto'"],
  ['ritmo sem tecto', 'Math.min(1, idade / la)', 'idade / la'],
  ['ritmo invertido', 'CICLO_MIN + (CICLO_MAX - CICLO_MIN) * media', 'CICLO_MAX - (CICLO_MAX - CICLO_MIN) * media'],
  ['sem sinais devolve vivo', "if (!conhecidos.length) return { estado: 'sem_sinais'", "if (!conhecidos.length) return { estado: 'vivo'"],
  ['limites incoerentes aceites', 'la <= 0 || lm < la', 'false'],
  ['texto como número', "typeof x === 'number' && isFinite(x)", 'isFinite(x)'],
];
let apanhados = 0;
for (const [nome, de, para] of estragos) {
  assert.ok(fonte.includes(de), 'o estrago não encontra o alvo: ' + nome);
  let caiu = false;
  try { await testes(await carregar(fonte.replace(de, para))); } catch (_) { caiu = true; }
  assert.ok(caiu, 'estrago não apanhado: ' + nome);
  apanhados++;
}
console.log(`Estragos propositados apanhados: ${apanhados} de ${estragos.length}.`);
console.log('PASS');
