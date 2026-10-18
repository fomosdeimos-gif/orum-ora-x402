// Acrescenta uma leitura de /economia/saldos.json (guardada num ficheiro) ao historial de saldos.
// Uso: node scripts/registar-saldos.mjs <saldos.json lido do conector>
// Recusa a leitura se o historial a rejeitar; nao toca na rede.
import { readFileSync, writeFileSync } from 'node:fs';
import { acrescentar, leituraDeSaldos, variacoes } from './lib-saldos-historico.mjs';

const alvo = new URL('../economia/saldos-historico.json', import.meta.url);
const caminho = process.argv[2];
if (!caminho) { console.error('uso: node scripts/registar-saldos.mjs <ficheiro com a resposta de /economia/saldos.json>'); process.exit(2); }
const historico = JSON.parse(readFileSync(alvo, 'utf8'));
const novo = acrescentar(historico, leituraDeSaldos(JSON.parse(readFileSync(caminho, 'utf8'))));
writeFileSync(alvo, JSON.stringify(novo, null, 2) + '\n');
const v = variacoes(novo);
console.log(JSON.stringify({ leituras: novo.leituras.length, ultima_variacao: v.filter((x) => x.ate === novo.leituras.at(-1).observado_utc) }));
