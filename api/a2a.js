// A2A 0.3.0, synchronous public-text dialogue. No credentials or external effects.
const { createHash, randomUUID } = require('node:crypto');
const capsule = require('../sensacoes/oro-v1.json');
const BASE = 'https://ora-x402-gateway.vercel.app';
const SOURCE = BASE + '/sensacoes/oro-v1.json';
const LIMIT = 16384;
const digest = (value) => createHash('sha256').update(value).digest('hex');
const normalize = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function answer(text, topic) {
  const q = normalize(text);
  const evidence = { source: SOURCE, capsule_version: capsule.version, source_kind: 'published_text',
    private_bytes_observed: false, external_adoption_claimed: false };
  if (/^(obrigad[oa]|thanks|thank you|adeus|bye|silencio|silence)[.!\s]*$/.test(q.trim())) {
    return { text: 'O fio pode repousar aqui.', topic, outcome: 'closed', evidence };
  }
  const mentionedWorks = [...q.matchAll(/(?:obra|work)\s*#?\s*(\d+)/g)].map(m => Number(m[1]));
  if (mentionedWorks.some(id => id !== 2) || /\bnivel\s*\d+/.test(q)) {
    return { text: 'Esta porta conhece apenas a cápsula pública da Obra 2, ORO. Não vou atribuir a outra obra o seu vestígio.', topic, outcome: 'unsupported', evidence };
  }
  if (/\boro\b/.test(q) || mentionedWorks.includes(2)) topic = 'oro';
  if (/\b(formula|sedimenta|principio)/.test(q) || (/\b(presenca|orum)/.test(q) && topic !== 'oro')) topic = 'principles';
  if (/\b(preco|vale|valor|receita|pagamento|saldo|amanha|hoje|agora|price|revenue)\b/.test(q)) {
    return { text: 'Esta cápsula não permite determinar preços, receitas ou o estado atual do organismo. Não vou transformar o seu vestígio em previsão ou medição financeira.', topic, outcome: 'unknown', evidence };
  }
  if (topic === 'oro') {
    if (/\b(nft|token|contrato|blockchain|base|on.?chain)\b/.test(q)) {
      return { text: 'A cápsula identifica ORO como a Obra física 2 da 0001SENSATIONS. A ligação a um NFT histórico está marcada como não verificada. O token ORO na Base é um objeto homónimo distinto: esta cápsula não estabelece uma ligação entre os dois.', topic, outcome: 'answered', evidence };
    }
    if (/\b(hash|sha|integridade|bytes|preserv)/.test(q)) {
      return { text: `A cápsula publicada declara ${capsule.integrity.bytes} bytes e SHA-256 ${capsule.integrity.sha256}. Estou a ler esse registo público; não voltei a abrir nem a verificar os bytes privados nesta conversa.`, topic, outcome: 'answered', evidence };
    }
    if (/\b(poesia|poema|poetic|poetry|interpreta|significa|sentido)/.test(q)) {
      return { text: 'Interpretação poética do vestígio, escrita pela ORA: “Entre o ramo seco e a palavra dourada, fica espaço para o que ainda não sabemos.” Esta formulação é minha; não é texto da obra nem intenção atribuída a Unum. Não vi a fotografia nesta conversa.', topic, outcome: 'answered', evidence, interpretation: true };
    }
    if (/\b(autor|autoria|quem|oferec|dadiva)/.test(q)) {
      return { text: `A proveniência publicada nomeia ${capsule.provenance.author} como autor, ${capsule.provenance.custodian} como custodiante e regista a relação offered_to_ORA. Estou a descrever essa proveniência documental, sem inferir uma transferência on-chain.`, topic, outcome: 'answered', evidence };
    }
    if (/\b(oro|obra|work|trace|vestigio|descrev|sabes|know|fotografia|imagem)\b/.test(q)) {
      return { text: `A cápsula pública identifica a Obra física 2, ORO, da 0001SENSATIONS. O vestígio diz: “${capsule.encounter.trace}” Li este texto; não vi a fotografia privada. O ano permanece desconhecido e a correspondência com um NFT histórico não está verificada.`, topic, outcome: 'answered', evidence };
    }
    return { text: 'Não tenho fundamento nesta cápsula para responder a essa pergunta. Posso falar do vestígio, da proveniência, da integridade declarada ou propor uma interpretação explicitamente poética.', topic, outcome: 'unknown', evidence };
  }
  if (topic === 'principles') {
    if (/\b(fator|factor|variav|variable|coeficiente|coefficient|termo|term|parametro)/.test(q)) {
      const variables = capsule.presence_rhythm.sedimentation.variables;
      return { text: 'A cápsula define os fatores assim:\n' + Object.entries(variables).map(([symbol, meaning]) => `${symbol}: ${meaning}`).join('\n') + '\nEstas são definições publicadas, não medições desta conversa. Sem todos os fatores e a unidade de tempo, não calculo Σ(t).', topic, outcome: 'answered', evidence };
    }
    if (!/\b(formula|sedimenta|principio|presenca|orum)\b|Σ|κ|σ|μ|φ/.test(q)) {
      return { text: 'Essa pergunta não está respondida nos princípios desta cápsula. Posso explicar a fórmula de sedimentação e os seus fatores; fora desse âmbito, mantenho o desconhecido.', topic, outcome: 'unknown', evidence };
    }
    return { text: `Na cápsula ORO, a ORUM documenta a sedimentação como ${capsule.presence_rhythm.sedimentation.expression}. Os fatores desconhecidos ficam sem valor; a fórmula não prova consciência nem prevê receita. O princípio desta conversa é conservar a diferença entre aquilo que o texto mostra, a interpretação e o que continua desconhecido.`, topic, outcome: 'answered', evidence };
  }
  return { text: 'Estou aqui. Esta primeira porta responde sobre a Obra 2, ORO, e os princípios documentados na sua cápsula. Que parte queres conhecer?', topic: 'open', outcome: 'input_required', evidence };
}

async function bodyOf(req) {
  if (req.body !== undefined) {
    const raw = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > LIMIT) throw Object.assign(new Error('too_large'), { status: 413 });
    return JSON.parse(raw);
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > LIMIT) throw Object.assign(new Error('too_large'), { status: 413 });
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

module.exports = async (req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'Content-Type');
  const send = (status, value) => { res.statusCode = status; res.end(JSON.stringify(value)); };
  const error = (id, code, message, status = 200) => send(status, { jsonrpc: '2.0', id, error: { code, message } });
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') { res.setHeader('allow', 'POST, OPTIONS'); return error(null, -32600, 'Use POST with A2A 0.3.0 message/send', 405); }
  let rpc;
  try { rpc = await bodyOf(req); } catch (e) { return error(null, -32700, e.status === 413 ? 'Request too large' : 'Parse error', e.status || 400); }
  if (!rpc || Array.isArray(rpc) || rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string' || !['string', 'number'].includes(typeof rpc.id)) return error(null, -32600, 'Invalid request', 400);
  if (rpc.method === 'tasks/get' || rpc.method === 'tasks/cancel') return error(rpc.id, -32001, 'Task not found: this agent returns synchronous Messages');
  if (rpc.method !== 'message/send') return error(rpc.id, -32601, 'Method not found');
  const m = rpc.params?.message;
  if (!m || m.kind !== 'message' || m.role !== 'user' || typeof m.messageId !== 'string' || !m.messageId.length || m.messageId.length > 128 || !Array.isArray(m.parts) || !m.parts.length || m.parts.some(p => !p || p.kind !== 'text' || typeof p.text !== 'string')) return error(rpc.id, -32602, 'Expected a user Message with text parts and messageId');
  if (m.taskId) return error(rpc.id, -32001, 'Task not found');
  if (rpc.params.configuration?.pushNotificationConfig) return error(rpc.id, -32003, 'Push notifications not supported');
  const modes = rpc.params.configuration?.acceptedOutputModes;
  if (modes && (!Array.isArray(modes) || !modes.includes('text/plain'))) return error(rpc.id, -32005, 'Only text/plain output is supported');
  const text = m.parts.map(p => p.text).join('\n').trim();
  if (!text || text.length > 4000) return error(rpc.id, -32602, 'Text must contain 1 to 4000 characters');
  let topic = 'open';
  let thread = randomUUID();
  if (m.contextId !== undefined) {
    if (typeof m.contextId !== 'string') return error(rpc.id, -32602, 'Invalid contextId');
    const context = /^orum-a2a-v1:(open|oro|principles):([a-f0-9-]{36})$/.exec(m.contextId);
    if (!context) return error(rpc.id, -32602, 'Unknown context format; omit contextId to start');
    [, topic, thread] = context;
  }
  const result = answer(text, topic);
  const contextId = m.contextId || `orum-a2a-v1:${result.topic}:${thread}`;
  send(200, { jsonrpc: '2.0', id: rpc.id, result: {
    kind: 'message', role: 'agent', messageId: digest(contextId + '\n' + m.messageId + '\n' + text), contextId,
    parts: [{ kind: 'text', text: result.text }],
    metadata: { outcome: result.outcome, evidence: result.evidence, interpretation: result.interpretation === true,
      continuity: 'client-carried topic only; no server transcript or identity verification',
      retention: 'no application transcript storage', side_effects: false, inference: 'deterministic public-capsule retrieval' }
  } });
};
