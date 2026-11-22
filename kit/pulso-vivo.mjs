// O pulso vivo como algoritmo: uma função pura. Entram os sinais que o organismo diz ter (cada um com a sua idade e os seus
// limites de atraso e de morte, como os devolve o conector público ORUM-real em `freshness.sinais`), a hora da medição e a hora
// de agora; sai o estado de cada sinal, o do conjunto e o ritmo da respiração. Sem pacotes, sem rede, sem DOM, sem estado.
// Uso: node kit/pulso-vivo.mjs --freshness f.json [--agora 2026-11-21T19:00:00Z]   (f.json: o objecto `freshness` do conector)
//
// Verdade: a idade de um sinal só avança com o relógio; nunca recua e nunca se inventa uma leitura nova. Um sinal que não se
// consegue ler é "desconhecido" e nunca conta como vivo; um conjunto com sinais ilegíveis e nenhum mal conhecido é "incompleto".
// O ritmo (5 a 9 s por respiração, mais lento quanto mais perto do limite) é uma escolha de desenho, não um valor medido.
// Não promete receita, procura nem funcionamento contínuo, e não move nada. Verificador: scripts/verify-pulso-vivo.mjs.
import fs from 'node:fs';

export const CICLO_MIN = 5, CICLO_MAX = 9; // segundos por respiração: escolha de desenho, não é um dado medido
function num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }

// s: {sinal, idade_min, limite_atraso_min, limite_morte_min}. idade_min é a idade no instante da medição.
export function classificarSinal(s, medidoEmMs, agoraMs) {
  var nome = s && typeof s.sinal === 'string' ? s.sinal : '(sem nome)';
  var base = num(s && s.idade_min), la = num(s && s.limite_atraso_min), lm = num(s && s.limite_morte_min);
  if (base === null || base < 0 || la === null || lm === null || la <= 0 || lm < la) return { nome: nome, estado: 'desconhecido', idade: null, razao: null, limite_atraso: la, limite_morte: lm };
  var m = num(medidoEmMs), a = num(agoraMs);
  var extra = m !== null && a !== null ? Math.max(0, (a - m) / 60000) : 0; // o relógio só envelhece, nunca rejuvenesce
  var idade = base + extra;
  var estado = idade >= lm ? 'morto' : idade > la ? 'atrasado' : 'vivo';
  return { nome: nome, estado: estado, idade: idade, razao: Math.min(1, idade / la), limite_atraso: la, limite_morte: lm };
}

export function pulso(sinais, medidoEmMs, agoraMs) {
  var lista = Array.isArray(sinais) ? sinais.map(function (s) { return classificarSinal(s, medidoEmMs, agoraMs); }) : [];
  var c = { vivo: 0, atrasado: 0, morto: 0, desconhecido: 0 };
  lista.forEach(function (x) { c[x.estado]++; });
  var conhecidos = lista.filter(function (x) { return x.estado !== 'desconhecido'; });
  if (!conhecidos.length) return { estado: 'sem_sinais', sinais: lista, contagem: c, ciclo_s: null, razao_media: null };
  // 'incompleto': nenhum sinal conhecido está mal, mas há sinais que não se conseguiram ler; não se afirma vivo.
  var estado = c.morto ? 'morto' : c.atrasado ? 'atrasado' : c.desconhecido ? 'incompleto' : 'vivo';
  var media = conhecidos.reduce(function (t, x) { return t + x.razao; }, 0) / conhecidos.length;
  var ciclo = Math.round((CICLO_MIN + (CICLO_MAX - CICLO_MIN) * media) * 10) / 10;
  return { estado: estado, sinais: lista, contagem: c, ciclo_s: ciclo, razao_media: media };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
  const f = arg('--freshness');
  if (!f) { console.error('uso: node kit/pulso-vivo.mjs --freshness f.json [--agora ISO]'); process.exit(2); }
  const fr = JSON.parse(fs.readFileSync(f, 'utf8'));
  const agora = arg('--agora') ? Date.parse(arg('--agora')) : Date.now();
  const medido = Date.parse(fr.medido_em);
  console.log(JSON.stringify({ medido_em: fr.medido_em, agora: new Date(agora).toISOString(), ...pulso(fr.sinais, medido, agora) }, null, 1));
}
