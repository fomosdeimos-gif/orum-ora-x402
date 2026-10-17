// Verifica que o registo financeiro nao mente e que o proprio verificador apanha as mentiras:
// cada caso adulterado tem de falhar, o caso completo tem de passar. Sem rede, sem pagamentos.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { validarRegisto } from './lib-registo-financeiro.mjs';

const real = JSON.parse(readFileSync(new URL('../economia/registo-financeiro.json', import.meta.url), 'utf8'));
const errosReais = validarRegisto(real);
assert.deepEqual(errosReais, [], 'registo real invalido: ' + errosReais.join('; '));

const TX = '0x' + 'ab'.repeat(32);
const base = { format: real.format, boundary: real.boundary, actos: [] };
const feito = () => ({
  id: 'a1', tipo: 'transferencia', estado: 'feito', classificacao: 'nao_classificada',
  pretendido: 'caso de teste', registado_antes_em: '2026-10-17T10:00:00Z', registado_depois_em: '2026-10-17T10:05:00Z',
  lido: [{ afirmacao: 'saldo lido', estado: 'verificado', fonte: 'teste' }], resultado: 'ok', prova: { tx: TX },
});
const com = (acto) => ({ ...base, actos: [acto] });
let mentiras = 0;
const falha = (nome, r) => { assert.ok(validarRegisto(r).length > 0, `devia falhar: ${nome}`); mentiras++; };

assert.deepEqual(validarRegisto(com(feito())), [], 'o caso completo devia passar');
assert.deepEqual(validarRegisto(com({ ...feito(), id: 'a2', estado: 'cancelado', registado_depois_em: undefined, resultado: undefined, prova: undefined, lido: [] })), [], 'cancelado com registo previo devia passar');

falha('sem registo anterior', com({ ...feito(), registado_antes_em: undefined }));
falha('registo posterior antes do previo', com({ ...feito(), registado_depois_em: '2026-10-17T09:00:00Z' }));
falha('feito sem resultado', com({ ...feito(), resultado: undefined }));
falha('feito sem leitura verificada', com({ ...feito(), lido: [{ afirmacao: 'x', estado: 'nao_verificado', fonte: 'teste' }] }));
falha('feito so com leitura bloqueada', com({ ...feito(), lido: [{ afirmacao: 'x', estado: 'bloqueado', fonte: 'teste' }] }));
falha('transferencia sem hash', com({ ...feito(), prova: {} }));
falha('hash malformado', com({ ...feito(), prova: { tx: '0x123' } }));
falha('externa sem cobertura completa', com({ ...feito(), classificacao: 'externa_confirmada', prova: { tx: TX, cobertura_completa: false } }));
falha('externa sem hash', com({ ...feito(), tipo: 'outro', classificacao: 'externa_confirmada', prova: { cobertura_completa: true } }));
falha('interna no 70/20/10', com({ ...feito(), classificacao: 'interna_validacao', entra_no_70_20_10: true }));
falha('nao classificada no 70/20/10', com({ ...feito(), entra_no_70_20_10: true }));
falha('texto afirma receita externa sem prova', com({ ...feito(), resultado: 'receita externa confirmada' }));
falha('texto afirma compradores confirmados', com({ ...feito(), pretendido: 'compradores confirmados' }));
falha('id repetido', { ...base, actos: [feito(), feito()] });
falha('tipo desconhecido', com({ ...feito(), tipo: 'magia' }));
falha('sem a fronteira', { ...base, boundary: 'sem fronteira', actos: [] });
assert.deepEqual(validarRegisto(com({ ...feito(), tipo: 'outro', classificacao: 'externa_confirmada', entra_no_70_20_10: true, prova: { tx: TX, cobertura_completa: true } })), [], 'externa com prova e cobertura devia passar');

console.log(JSON.stringify({ verified: true, actos: real.actos.length, casos_de_mentira: mentiras }));
