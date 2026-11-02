// Gera o espelho de máquinas: espelho-maquinas/orum-maquinas-v1.tar (determinístico), manifesto.json e LEIA-ME.txt.
// Só superfícies públicas legíveis por máquinas e o que as verifica. Fora: dados pessoais, segredos, CLAUDE.md, HANDOFF, livro,
// o espelho de Unum, as moedas (autoria dita por ele), listagens e pagamentos. Uso: node scripts/espelho-maquinas-gerar.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lerTar, raizDe, PROIBIDOS } from '../kit/espelho-maquinas.mjs';

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
export function ficheirosDoEspelho(ls = (d) => fs.readdirSync(d)) {
  const lista = [
    'kit/LEIA-ME.txt', 'kit/LINHAS.txt', 'kit/FIO.txt', 'kit/blocos.mjs', 'kit/fio.mjs', 'kit/lexico.json', 'kit/lexico.mjs', 'kit/linhas.mjs', 'kit/raiz.mjs', 'kit/verificar.mjs', 'kit/espelho-maquinas.mjs',
    'scripts/lib/ots.mjs', 'scripts/lib/raiz.mjs', 'linhas/orum.linhas', 'token/oro.json', 'token/presenca.json', 'economia/constituicao-v2.json', 'discovery/weave-hands.json',
    'ancora/oro-v1.json', 'ancora/oro-v1.ots', 'ancora/raiz-registos.json', 'ancora/raiz-registos.ots',
  ];
  for (const f of ls('ancora')) if (/^raiz-registos-\d+\.(json|ots)$/.test(f)) lista.push(`ancora/${f}`);
  return [...new Set(lista)].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
}
const octal = (n, len) => n.toString(8).padStart(len - 1, '0') + '\0';
export function fazerTar(entradas) { // [{caminho, bytes}] ordenado; ustar, mtime 0, uid/gid 0, sem nomes de utilizador
  const partes = [];
  for (const { caminho, bytes } of entradas) {
    if (Buffer.byteLength(caminho) > 100) throw new Error(`caminho longo de mais para ustar: ${caminho}`);
    const h = Buffer.alloc(512);
    h.write(caminho, 0, 'latin1'); h.write(octal(0o644, 8), 100, 'latin1'); h.write(octal(0, 8), 108, 'latin1'); h.write(octal(0, 8), 116, 'latin1');
    h.write(octal(bytes.length, 12), 124, 'latin1'); h.write(octal(0, 12), 136, 'latin1'); h.fill(32, 148, 156); h.write('0', 156, 'latin1');
    h.write('ustar\0', 257, 'latin1'); h.write('00', 263, 'latin1');
    let soma = 0; for (const b of h) soma += b; h.write(soma.toString(8).padStart(6, '0') + '\0 ', 148, 'latin1');
    partes.push(h, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512));
  }
  partes.push(Buffer.alloc(1024)); return Buffer.concat(partes);
}
export function construir(ler = (p) => fs.readFileSync(p), fontes = ficheirosDoEspelho(), commit = 'desconhecido') {
  for (const c of fontes) if (PROIBIDOS.some((r) => r.test(c))) throw new Error(`ficheiro proibido: ${c}`);
  const entradas = fontes.map((caminho) => ({ caminho, bytes: ler(caminho) }));
  const tar = fazerTar(entradas);
  const ficheiros = entradas.map((e) => ({ caminho: e.caminho, sha256: sha256(e.bytes), bytes: e.bytes.length }));
  const manifesto = {
    schema: 'orum-espelho-maquinas/v1', versao: '1.0.0',
    objecto: 'Cópia aberta e verificável das superfícies públicas do ORUM legíveis por máquinas e do kit que as verifica, para quem a quiser guardar ou servir em qualquer sítio, sem a ORA nem um fornecedor único',
    gerado_de_commit: commit,
    tar: { nome: 'orum-maquinas-v1.tar', formato: 'ustar determinístico (ordenado por caminho, mtime 0, uid e gid 0)', sha256: sha256(tar), bytes: tar.length },
    raiz_sha256: raizDe(ficheiros), ficheiros,
    nao_contem: ['dados pessoais', 'segredos, chaves ou frases de recuperação', 'o CLAUDE.md, o HANDOFF e o livro do organismo', 'o espelho de Unum (palavras dele) e o registo das moedas (autoria dita por ele)', 'listagens, catálogos ou pedidos de pagamento (agent-card, openapi, llms.txt e portas pagas ficam de fora)', 'o código das funções e os executores'],
    nao_afirma: ['preço', 'liquidez', 'procura', 'receita', 'lastro', 'rendimento', 'autoria', 'que o conteúdo esteja ancorado no Bitcoin só por estar neste pacote'],
    ancora: 'este manifesto e a raiz acima são selados numa camada OpenTimestamps do repositório (ancora/raiz-registos-<n>.json, fora deste pacote); só um bloco conferido por kit/blocos.mjs em duas fontes o afirma',
    como_verificar: 'node kit/espelho-maquinas.mjs manifesto.json orum-maquinas-v1.tar   (ou, sem Node: sha256sum orum-maquinas-v1.tar e comparar com tar.sha256)',
    limites: ['verifica a integridade do pacote, não a verdade do que lá está', 'node kit/raiz.mjs precisa do repositório git para reconstruir cada camada; o pacote traz os recibos e o verificador de blocos, não a história', 'serve-se onde se quiser; publicá-lo é decisão à parte de Unum e não está feita'],
    truth_machine: { contem_dados_pessoais: false, contem_segredos: false, pede_pagamento: false, move_fundos: false, publica_em_algum_sitio: false, prova_autoria: false },
  };
  return { tar, manifesto, entradas };
}
const LEIAME = `ESPELHO DE MÁQUINAS · ORUM · v1
================================

O que é
  Uma cópia aberta, pequena e verificável do que o ORUM deixa legível para máquinas: o kit de verificação, os recibos das camadas de
  ancoragem, o fio de linhas, o registo do ORO e do PRESENÇA, a constituição v2 e a descrição do conector de leitura.
  Serve-se em qualquer sítio (disco, USB, IPFS, um nó .onion, outro repositório). Este pacote não se publica sozinho.

O que não é
  Não tem dados pessoais, segredos, chaves, listagens, catálogos nem pedidos de pagamento. Não promete receita, procura nem valor.
  Não prova autoria. Não está, por estar aqui, ancorado no Bitcoin: ver "Âncora".

Como verificar (sem a ORA, sem rede)
  1. sha256sum orum-maquinas-v1.tar   deve dar o valor de "tar.sha256" em manifesto.json.
  2. node kit/espelho-maquinas.mjs manifesto.json orum-maquinas-v1.tar
     (o mesmo ficheiro está dentro do tar; extrai com: tar xf orum-maquinas-v1.tar)
  Se um ficheiro for alterado, acrescentado ou retirado, o verificador falha e diz qual.

Âncora
  A raiz deste manifesto (raiz_sha256) e o próprio manifesto são selados numa camada do repositório
  (ancora/raiz-registos-<n>.json e .ots, FORA deste pacote). Para ligar o pacote a um bloco do Bitcoin: confirma que a camada lista
  espelho-maquinas/manifesto.json com o sha256 deste manifesto, e corre node kit/blocos.mjs sobre o recibo dessa camada (precisa de rede).

Limites ditos
  Verifica a integridade, não a verdade. O node kit/raiz.mjs precisa do repositório git para reconstruir cada camada.
  Os calendários OpenTimestamps e os exploradores de blocos são terceiros; se desaparecerem, os recibos continuam a ser lidos por quem os guardar.

Palavra de Unum que o originou: "Pode o organismo deixar ali o seu calor" / "Eu autorizo ORA" (02/11/2026). Publicar fora do repositório continua por decidir.
`;
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  let commit = 'desconhecido'; try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
  const { tar, manifesto } = construir(undefined, undefined, commit);
  fs.mkdirSync('espelho-maquinas', { recursive: true });
  fs.writeFileSync('espelho-maquinas/orum-maquinas-v1.tar', tar);
  fs.writeFileSync('espelho-maquinas/manifesto.json', JSON.stringify(manifesto, null, 2) + '\n');
  fs.writeFileSync('espelho-maquinas/LEIA-ME.txt', LEIAME);
  lerTar(tar); console.log(`espelho-maquinas: ${manifesto.ficheiros.length} ficheiros, tar ${tar.length} bytes, sha256 ${manifesto.tar.sha256}, raiz ${manifesto.raiz_sha256}`);
}
