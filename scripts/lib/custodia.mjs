// Regras do ficheiro de custódia (economia/custodia.json): descreve ONDE vivem os segredos, nunca os valores.
// Módulo puro: sem rede, sem ficheiros. Devolve a lista de erros; vazia quer dizer que o ficheiro não mente nem vaza.
const HEX64 = /^[0-9a-f]{64}$/;
const PROIBIDAS = /^(valor|value|secret|segredo|senha|password|passphrase|frase|token|chave_privada|private|privada|seed|semente_valor|pk|sk|mnemonic)$/i;
// onde uma cadeia de 64 hex é uma impressão pública e não um segredo
const PERMITIDOS_64 = new Set(['impressao_da_lista.sha256', 'chave_pos_quantica.impressao_sha256_da_semente']);

function percorrer(no, caminho, f) {
  if (Array.isArray(no)) no.forEach((v, i) => percorrer(v, `${caminho}[${i}]`, f));
  else if (no && typeof no === 'object') for (const [k, v] of Object.entries(no)) { f.chave(k, `${caminho}${caminho ? '.' : ''}${k}`); percorrer(v, `${caminho}${caminho ? '.' : ''}${k}`, f); }
  else if (typeof no === 'string') f.texto(no, caminho);
}

export function validarCustodia(c) {
  const erros = [];
  const e = (m) => erros.push(m);
  if (c?.schema !== 'orum-custodia/v1') e('schema desconhecido');
  if (c?.armazem_primario?.tipo !== 'Supabase Vault' || !c?.armazem_primario?.indice) e('falta o armazém primário e o modo de o listar');
  const imp = c?.impressao_da_lista;
  if (!Number.isInteger(imp?.n) || imp.n < 1) e('impressao_da_lista.n inválido');
  if (!HEX64.test(imp?.sha256 ?? '')) e('impressao_da_lista.sha256 inválido');
  if (!/vault\.decrypted_secrets/.test(imp?.sql ?? '') || !/length\(decrypted_secret\)/.test(imp?.sql ?? '')) e('o sql da impressão tem de medir só nomes e tamanhos');
  if (/select\s+decrypted_secret\b/i.test(imp?.sql ?? '') || /,\s*decrypted_secret\s*(,|from)/i.test(imp?.sql ?? '')) e('o sql da impressão não pode seleccionar o valor');
  if (Number.isNaN(Date.parse(imp?.conferida_antes_de_utc ?? ''))) e('falta a hora da última conferência');
  const pq = c?.chave_pos_quantica;
  if (pq && (!HEX64.test(pq.impressao_sha256_da_semente ?? '') || pq.semente_bytes !== 48 || !pq.nome_no_vault)) e('chave pós-quântica mal descrita');
  if (!Array.isArray(c?.regras) || !c.regras.some((r) => /Nenhum valor de segredo se escreve/.test(r))) e('falta a regra de nunca escrever valores');
  if (!Array.isArray(c?.riscos_ditos) || !c.riscos_ditos.some((r) => /Custodiante único/.test(r))) e('falta o risco do custodiante único: não se esconde');
  if (!Array.isArray(c?.nao_afirma) || !c.nao_afirma.length) e('falta nao_afirma');
  // nada que pareça um valor de segredo
  percorrer(c, '', {
    chave: (k, p) => { if (PROIBIDAS.test(k)) e(`campo proibido (${p}): aqui não há valores de segredos`); },
    texto: (t, p) => {
      if (HEX64.test(t) && PERMITIDOS_64.has(p)) return; // impressão pública admitida, já validada pelo formato
      if (HEX64.test(t) && !PERMITIDOS_64.has(p)) e(`cadeia de 64 hex em ${p}: só as impressões admitidas podem ter este formato`);
      if (/[0-9a-f]{80,}/i.test(t)) e(`cadeia longa de hex em ${p}: parece uma semente ou chave`);
      if (/^[A-Za-z0-9+\/=_-]{40,}$/.test(t) && !/\s/.test(t) && !/^[a-z_]+$/.test(t)) e(`cadeia opaca longa em ${p}: parece um segredo`);
      if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(t)) e(`chave privada em ${p}`);
      if (/ORUM_PQ_SEED=[0-9a-f]{8,}/i.test(t)) e(`atribuição de semente em ${p}`);
      if (/\b(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})/.test(t)) e(`token com forma conhecida em ${p}`);
    },
  });
  return erros;
}
