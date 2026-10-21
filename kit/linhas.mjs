// ORUM-linhas v1: uma afirmação por linha, só se acrescenta. Leitor e verificador sem pacotes nem rede.
// Uso: node kit/linhas.mjs [pasta-do-repositório]   (especificação: kit/LINHAS.txt)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ESTADOS = ['verificado', 'lido', 'nao_verificado', 'bloqueado'];
export const ZERO = '0'.repeat(16);
const QUANDO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/;
const TOKEN = /^[^\s|]+$/;
const PROMESSA = /receita garantida|reembolso garantido|rendimento garantido|lucro garantido|garantimos|prometemos|durar[áa] 904|904 anos garantidos/i;
const SEGREDO = /eyJ[A-Za-z0-9_-]{20,}|-----BEGIN|\b0x[0-9a-fA-F]{64}\b|sk_[A-Za-z0-9]{16,}/;

export const ligacao = (linha) => crypto.createHash('sha256').update(linha, 'utf8').digest('hex').slice(0, 16);

export function ler(texto) {
  if (texto === '') return [];
  if (!texto.endsWith('\n')) throw new Error('o ficheiro tem de acabar com uma quebra de linha');
  return texto.slice(0, -1).split('\n').map((linha, i) => {
    const c = linha.split(' | ');
    if (c.length !== 7) throw new Error(`linha ${i + 1}: tem de ter 7 campos separados por " | "`);
    const [quando, sujeito, predicado, valor, estado, prova, ant] = c;
    return { n: i + 1, linha, quando, sujeito, predicado, valor, estado, prova, ant };
  });
}

export function escrever(l) { return [l.quando, l.sujeito, l.predicado, l.valor, l.estado, l.prova, l.ant].join(' | '); }

// contexto: { existe(caminho), scripts: {nome:...}, termos: {sujeito: estado_do_lexico} }
export function validar(texto, ctx) {
  const e = [];
  let linhas;
  try { linhas = ler(texto); } catch (err) { return [err.message]; }
  let anterior = null;
  for (const l of linhas) {
    const p = `linha ${l.n}`;
    if (!QUANDO.test(l.quando)) e.push(`${p}: quando inválido`);
    else if (anterior && l.quando < anterior.quando) e.push(`${p}: o tempo não pode andar para trás`);
    if (!(l.sujeito in ctx.termos)) e.push(`${p}: sujeito fora do léxico: ${l.sujeito}`);
    if (!TOKEN.test(l.predicado)) e.push(`${p}: predicado inválido`);
    if (l.valor.length === 0 || l.valor.includes('\t')) e.push(`${p}: valor inválido`);
    if (!ESTADOS.includes(l.estado)) e.push(`${p}: estado desconhecido`);
    if (PROMESSA.test(l.linha)) e.push(`${p}: promessa`);
    if (SEGREDO.test(l.linha)) e.push(`${p}: parece segredo`);
    if (l.ant !== (anterior ? ligacao(anterior.linha) : ZERO)) e.push(`${p}: a ligação à linha anterior não bate (linha alterada, apagada ou inserida antes)`);
    const [tipo, ...resto] = l.prova.split(':');
    const alvo = resto.join(':');
    const temProva = l.prova !== '-';
    if (temProva) {
      if (tipo === 'ficheiro') { if (alvo.includes('..') || path.isAbsolute(alvo) || !ctx.existe(alvo)) e.push(`${p}: ficheiro da prova em falta: ${alvo}`); }
      else if (tipo === 'sha256') { if (!/^[0-9a-f]{64}$/.test(alvo)) e.push(`${p}: sha256 inválido`); }
      else if (tipo === 'btc') { if (!/^\d{5,8}$/.test(alvo)) e.push(`${p}: altura de bloco inválida`); }
      else if (tipo === 'verif') { if (!ctx.scripts[alvo]) e.push(`${p}: verificador inexistente: ${alvo}`); }
      else e.push(`${p}: tipo de prova desconhecido`);
    }
    if (l.estado === 'verificado') {
      if (tipo !== 'verif' && tipo !== 'btc') e.push(`${p}: "verificado" exige prova verif: ou btc:`);
      if (ctx.termos[l.sujeito] !== 'ligado') e.push(`${p}: o léxico não liga "${l.sujeito}" a um objecto, não pode ser verificado`);
    }
    if (l.estado === 'lido' && tipo !== 'ficheiro' && tipo !== 'sha256') e.push(`${p}: "lido" exige prova ficheiro: ou sha256:`);
    anterior = l;
  }
  return e;
}

export function contexto(dir) {
  const lex = JSON.parse(fs.readFileSync(path.join(dir, 'kit/lexico.json'), 'utf8'));
  const termos = Object.fromEntries(lex.termos.map((t) => [t.termo.replace(/ /g, '_'), t.estado]));
  const scripts = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).scripts ?? {};
  return { existe: (p) => fs.existsSync(path.join(dir, p)), scripts, termos };
}

// Só se acrescenta: o texto antigo tem de ser um prefixo do novo.
export function soAcrescenta(antigo, novo) { return novo.startsWith(antigo); }

export function verificar(dir = '.') {
  const texto = fs.readFileSync(path.join(dir, 'linhas/orum.linhas'), 'utf8');
  const e = validar(texto, contexto(dir));
  if (e.length) throw new Error('linhas inválidas: ' + e.join('; '));
  const ls = ler(texto);
  const porEstado = Object.fromEntries(ESTADOS.map((s) => [s, ls.filter((l) => l.estado === s).length]));
  return { ok: true, linhas: ls.length, ...porEstado, cabeca: ls.length ? ligacao(ls.at(-1).linha) : ZERO };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(verificar(process.argv[2] ?? '.'))); } catch (err) { console.error(err.message); process.exit(1); }
}
