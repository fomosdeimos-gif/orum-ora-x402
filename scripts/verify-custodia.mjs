// Verifica economia/custodia.json: o real tem de passar e cada mentira ou fuga propositada tem de falhar. Sem rede.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validarCustodia } from './lib/custodia.mjs';

const real = JSON.parse(fs.readFileSync('economia/custodia.json', 'utf8'));
const errosReais = validarCustodia(real);
assert.deepEqual(errosReais, [], 'custódia real inválida: ' + errosReais.join('; '));

const clone = (o) => JSON.parse(JSON.stringify(o));
const com = (mut) => { const c = clone(real); mut(c); return c; };
let mentiras = 0;
const falha = (nome, c) => { assert.ok(validarCustodia(c).length > 0, `devia falhar: ${nome}`); mentiras++; };
const SEMENTE96 = 'ab'.repeat(48);

// estrutura e verdade
falha('schema desconhecido', com((c) => { c.schema = 'outro'; }));
falha('sem armazém primário', com((c) => { delete c.armazem_primario; }));
falha('armazém sem índice', com((c) => { delete c.armazem_primario.indice; }));
falha('n a zero', com((c) => { c.impressao_da_lista.n = 0; }));
falha('n decimal', com((c) => { c.impressao_da_lista.n = 36.5; }));
falha('impressão curta', com((c) => { c.impressao_da_lista.sha256 = 'abc'; }));
falha('sem hora de conferência', com((c) => { delete c.impressao_da_lista.conferida_antes_de_utc; }));
falha('sql que mede o valor em vez do tamanho', com((c) => { c.impressao_da_lista.sql = 'select count(*) from vault.decrypted_secrets'; }));
falha('sql que selecciona o valor', com((c) => { c.impressao_da_lista.sql += ' select decrypted_secret from vault.decrypted_secrets'; }));
falha('semente com tamanho errado', com((c) => { c.chave_pos_quantica.semente_bytes = 32; }));
falha('impressão da semente inválida', com((c) => { c.chave_pos_quantica.impressao_sha256_da_semente = 'zz'; }));
falha('sem a regra de nunca escrever valores', com((c) => { c.regras = c.regras.filter((r) => !/Nenhum valor de segredo se escreve/.test(r)); }));
falha('sem o risco do custodiante único', com((c) => { c.riscos_ditos = c.riscos_ditos.filter((r) => !/Custodiante único/.test(r)); }));
falha('sem nao_afirma', com((c) => { c.nao_afirma = []; }));

// segunda cópia (valores falsos: nunca se escreve aqui uma frase real)
falha('segunda cópia com estado desconhecido', com((c) => { c.segunda_copia.estado = 'talvez'; }));
falha('segunda cópia activa sem impressão do cifrado', com((c) => { delete c.segunda_copia.impressao_sha256_do_cifrado; }));
falha('segunda cópia activa sem âmbito', com((c) => { c.segunda_copia.ambito_nomes = []; }));
falha('segunda cópia sem dizer onde está a frase', com((c) => { delete c.segunda_copia.frase_passe_guardada_em; }));
falha('cifrado e frase no mesmo sítio', com((c) => { c.segunda_copia.frase_passe_guardada_em.fornecedor = c.segunda_copia.cifrado_guardado_em.fornecedor; }));
falha('segunda cópia activa sem conferência', com((c) => { c.segunda_copia.conferida = 'dito e feito'; }));
falha('segunda cópia sem modo de restaurar', com((c) => { delete c.segunda_copia.restaurar; }));
falha('64 hex fora do campo da impressão do cifrado', com((c) => { c.segunda_copia.cifrado_guardado_em.ficheiro = '6b'.repeat(32); }));
falha('frase em claro num campo "frase"', com((c) => { c.segunda_copia.frase = 'ab'.repeat(24); }));
falha('frase de 48 hex colada num texto longo', com((c) => { c.segunda_copia.restaurar += ' ' + 'cd'.repeat(48); }));

// fugas de segredos
falha('semente de 96 hex numa nota', com((c) => { c.chave_pos_quantica.estado = SEMENTE96; }));
falha('semente de 96 hex dentro de um texto', com((c) => { c.regras.push(`a semente é ${SEMENTE96} ok`); }));
falha('64 hex fora dos campos de impressão', com((c) => { c.chave_pos_quantica.chave_publica = 'cd'.repeat(32); }));
falha('64 hex no sítio errado da impressão', com((c) => { c.impressao_da_lista.regra = 'ef'.repeat(32); }));
falha('campo "valor"', com((c) => { c.chave_pos_quantica.valor = 'x'; }));
falha('campo "seed"', com((c) => { c.chave_pos_quantica.seed = 'x'; }));
falha('campo "token" aninhado', com((c) => { c.armazem_primario.token = 'x'; }));
falha('campo "password"', com((c) => { c.password = 'x'; }));
falha('ORUM_PQ_SEED=… atribuído', com((c) => { c.regras.push('export ORUM_PQ_SEED=0123456789abcdef'); }));
falha('chave privada PEM', com((c) => { c.regras.push('-----BEGIN PRIVATE KEY-----'); }));
falha('token do GitHub', com((c) => { c.regras.push('ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2'); }));
falha('chave de API opaca em base64', com((c) => { c.regras.push('QWxhZGRpbjpvcGVuIHNlc2FtZVNlY3JldFZhbHVlMTIzNDU2Nzg5MA=='); }));
falha('JWT', com((c) => { c.regras.push('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc'); }));

// o que NÃO deve dar falso alarme
assert.deepEqual(validarCustodia(com((c) => { c.regras.push('Texto normal com o nome orum_pq_slhdsa_shake128s_seed_v1 e números 12345.'); })), [], 'nomes de segredos e prosa normal não são fugas');

console.log(JSON.stringify({ verified: true, segredos_no_vault: real.impressao_da_lista.n, impressao: real.impressao_da_lista.sha256.slice(0, 12) + '…', casos_de_mentira: mentiras }));
