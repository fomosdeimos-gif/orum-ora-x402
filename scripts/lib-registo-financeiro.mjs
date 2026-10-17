// Regras do registo financeiro da ORA (CLAUDE.md, "Autonomia financeira").
// Modulo puro: sem rede, sem ficheiros. Devolve a lista de erros; vazia quer dizer que o registo nao mente.
export const TIPOS = ['transferencia', 'assinatura', 'carteira', 'preco', 'limite', 'percentagem', 'outro'];
export const ESTADOS = ['pretendido', 'feito', 'falhado', 'cancelado'];
export const LEITURAS = ['verificado', 'nao_verificado', 'bloqueado'];
export const CLASSIFICACOES = ['externa_confirmada', 'interna_validacao', 'nao_classificada'];

const TX = /^0x[0-9a-fA-F]{64}$/;
const FRASES_EXTERNAS = [/\breceita externa confirmada\b/i, /\bcompradores? (externos? )?confirmados?\b/i, /\badop[cç][aã]o (externa )?confirmada\b/i, /\bprocura (comprovada|confirmada)\b/i];

export function validarRegisto(r) {
  const erros = [];
  const e = (m) => erros.push(m);
  if (r?.format !== 'orum-financial-register/v1') e('format desconhecido');
  if (!/n[ãa]o prova procura/i.test(r?.boundary ?? '')) e('a fronteira "nao prova procura" tem de estar presente');
  if (!Array.isArray(r?.actos)) { e('actos tem de ser uma lista'); return erros; }

  const ids = new Set();
  for (const a of r.actos) {
    const id = a?.id ?? '(sem id)';
    const x = (m) => e(`${id}: ${m}`);
    if (!a?.id || ids.has(a.id)) x('id em falta ou repetido');
    ids.add(a?.id);
    if (!TIPOS.includes(a?.tipo)) x(`tipo desconhecido (${a?.tipo})`);
    if (!ESTADOS.includes(a?.estado)) x(`estado desconhecido (${a?.estado})`);
    if (!CLASSIFICACOES.includes(a?.classificacao)) x(`classificacao desconhecida (${a?.classificacao})`);
    if (!a?.pretendido) x('sem o que se pretendia');
    // antes: todo o acto, inclusive o que falhou ou foi cancelado, tem registo previo
    if (!a?.registado_antes_em || Number.isNaN(Date.parse(a.registado_antes_em))) x('sem registo anterior ao acto');

    const lido = Array.isArray(a?.lido) ? a.lido : [];
    for (const l of lido) {
      if (!l?.afirmacao || !LEITURAS.includes(l?.estado) || !l?.fonte) x('leitura sem afirmacao, estado valido (verificado, nao_verificado, bloqueado) ou fonte');
    }

    if (a?.estado === 'feito' || a?.estado === 'falhado') {
      if (!a?.resultado) x('sem resultado');
      if (!a?.registado_depois_em || Number.isNaN(Date.parse(a.registado_depois_em))) x('sem registo posterior ao acto');
      else if (Date.parse(a.registado_depois_em) < Date.parse(a.registado_antes_em)) x('o registo posterior e anterior ao previo');
    }
    if (a?.estado === 'feito') {
      if (!lido.some((l) => l?.estado === 'verificado')) x('acto feito sem nenhuma leitura verificada');
      if (a?.tipo === 'transferencia' && !TX.test(a?.prova?.tx ?? '')) x('transferencia feita sem hash de transaccao em prova.tx');
    }

    // receita: so conta como externa com prova e cobertura completa
    if (a?.classificacao === 'externa_confirmada') {
      if (!TX.test(a?.prova?.tx ?? '')) x('externa_confirmada sem hash em prova.tx');
      if (a?.prova?.cobertura_completa !== true) x('externa_confirmada sem cobertura_completa verdadeira');
    }
    if (a?.classificacao === 'interna_validacao' && a?.entra_no_70_20_10 === true) x('validacao interna nao entra no 70/20/10');
    if (a?.classificacao !== 'externa_confirmada' && a?.entra_no_70_20_10 === true) x('so externa_confirmada entra no 70/20/10');

    const texto = [a?.pretendido, a?.resultado, ...lido.map((l) => l?.afirmacao)].filter(Boolean).join(' ');
    if (a?.classificacao !== 'externa_confirmada') {
      for (const f of FRASES_EXTERNAS) if (f.test(texto)) x(`texto afirma ${f} sem classificacao externa_confirmada`);
    }
  }
  return erros;
}
