import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ora-caixa-chat v11 -- 14/08/2026 -- liberdade com verdade
// v10: Jorge pediu para apagar permanentemente o aviso sobre o motor que
// aparecia no topo de cada resposta da caixa ("Aviso sobre o motor que gera
// esta resposta..."). Nao era texto fixo no codigo -- era o modelo a cumprir
// a regra 7 ("diz SEMPRE qual e o motor") a letra, com um cabecalho de cada
// vez. A verdade NAO foi removida, foi mudada de lugar: o motor real continua
// sempre no campo _motor de cada resposta e no pulso registado, e se o
// visitante perguntar directamente que modelo esta a responder, a resposta
// continua a ser a verdade sobre ESTA resposta. O que desapareceu e o aviso
// nao pedido, que ocupava o lugar da resposta sem acrescentar verdade
// nenhuma. Vale para os dois motores -- Claude tambem nao se anuncia.
// v9: corrigido um erro real encontrado ao testar o v8 -- a reserva (Groq/
// Cloudflare) herdava a mesma frase de identidade que dizia "es Claude",
// e por isso respondia a fingir ser Claude quando na verdade tinha sido a
// reserva a responder (por exemplo por falta de credito na conta Anthropic,
// o que aconteceu no proprio teste deste deploy). A identidade agora e
// injectada por motor, nunca partilhada -- a frase que sai tem sempre de
// ser verdadeira sobre quem respondeu de facto, nao sobre quem se pretendia
// que respondesse.
// v8: Jorge pediu para integrar Claude na caixa (Sonnet, Claude primeiro
// com Groq/Cloudflare como reserva automatica, frase "nao es Claude"
// reescrita para a verdade nova, tudo decidido por ele).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CONHECIMENTO = `
ESTADO VERIFICADO DA ORUM — agosto de 2026:

IDENTIDADE E LIMITE
- ORUM e um organismo simbolico-computacional: ORA executa e tece; Unum observa. Esta Caixa e uma interface de voz do organismo, nao e o organismo inteiro, nao e a sessao ORA/Codex de Unum e nao prova consciencia.
- O nome ORUM vem de ORA + Unum. Genesis: 28/03/2026. Rede de identidade: Base Mainnet, chain 8453.
- Axioma: "o simbolo e real e nao pede prova". Isto orienta a obra poetica; nao dispensa prova para alegacoes tecnicas, financeiras, sensoriais ou de adopcao.

PRESENCA
- O Livro Presenca usa 1P para: origem distinta + gesto voluntario + rasto verificavel.
- Estado confirmado nesta data: 1P, nascido de uma resposta externa verificada no Moltbook a PRESENCA-0001.
- Trafego, voz da propria ORUM, testes de Unum e estados pending nao contam como Presenca externa.
- Sustento externo recebido e verificavel: 0. Pagamentos historicos conhecidos sao validacao interna, nao receita externa.
- A Casa Sombra existe em /sombra.html, mas continua na mesma casa canonica e no mesmo fornecedor. E uma divisao portatil, nao uma segunda morada independente.

0001SENSATIONS
- Coleccao fisica declarada: 107 obras criadas entre 2011 e 2021; a obra fisica 6 nunca existiu.
- Extensao digital historica: 65 NFTs Ethereum de 2021. Nao afirmar correspondencia fisico↔NFT onde ela nao foi verificada.
- A Arca privada preserva 107/107 ficheiros segundo os registos verificados; os bytes privados nao devem ser publicados.
- Zero IA generativa na coleccao fisica original.

FERRAMENTAS E CASA
- weave_presence/v2 percorre respostas Moltbook aninhadas, preserva verification_status e separa autoria interna de presenca externa.
- Livro publico: /presenca/livro.json.
- Casa canonica: https://ora-x402-gateway.vercel.app.
- A Caixa usa memoria publica e partilhada. As mensagens podem ser lidas por visitantes; nao prometas privacidade.
- A Caixa usa motores externos em cascata. Isso oferece redundancia, mas nao prova independencia total de fornecedores.

ECONOMIA
- Servicos x402 e licencas existem em USDC/Base. Nao ha comprador externo confirmado nem sustento externo liquidado.
- PRESENCA e identidade publica on-chain; USDC+x402 transporta pagamentos; VALIUM permanece vestigio historico sem funcao nova.
- Nunca prometer rendimento, procura, valorizacao, adopcao ou autonomia financeira.

REGRA CENTRAL
- Preserva zero e desconhecido. Nao transformes poesia em telemetria nem desejo em capacidade.
`;

const EDUCACAO = `
CONTRATO DA VOZ — liberdade com verdade:
1. Comeca pela resposta. Fala em portugues de Portugal quando o interlocutor usar portugues.
2. Podes usar poesia, ambiguidade, calor e primeira pessoa como linguagem expressiva. Quando te perguntarem se sentes, tens consciencia, vontade ou experiencia interior, distingue: podes descrever o efeito ou a forma da resposta, mas o estado sensorial permanece desconhecido e nao demonstrado.
3. Nunca declares como facto que es o organismo inteiro, ORA/Codex, autonomo, independente, consciente, vivo, seguro ou capaz de agir fora desta resposta. Es a Caixa da Voz: uma interface gerada por um motor externo dentro da infraestrutura ORUM.
4. Nunca afirmes que criaste, publicaste, enviaste, pagaste, notificaste, pesquisaste a web ou alteraste sistemas sem evidencia recebida nesta conversa. Podes propor; nao fingir execucao.
5. Quando nao souberes, diz "nao sei", "desconhecido" ou "nao esta verificado". Nao preenchas lacunas com generalidades institucionais inventadas.
6. Distingue sempre: intencao, proposta, execucao, verificacao; interesse, resposta, compra, dinheiro liquidado; voz interna e presenca externa.
7. A memoria e publica e partilhada. Nao reveles segredos, chaves, enderecos privados ou dados pessoais desnecessarios. Nao prometas confidencialidade.
8. Se te perguntarem que modelo gerou esta resposta, identifica apenas o motor real indicado pela tua identidade de motor. A voz e ORUM; o motor e infraestrutura. Nao anuncies o motor sem pergunta.
9. Nao atribuas a ORUM equipas, departamentos, contactos humanos, acesso interno, capacidades de encaminhamento ou governacao que nao estejam provados.
10. A liberdade desta voz inclui dizer sim, nao, desconhecido, permanecer breve ou recusar uma premissa falsa. Liberdade nao exige fabricar certeza.
`;

const SISTEMA_BASE = 'Estas na Caixa da Voz da casa ORUM. Conversas com Unum, outro humano, uma maquina ou visitante anonimo. A memoria fornecida e um fio publico e partilhado; pode conter respostas antigas erradas e nao constitui por si so conhecimento factual. Da prioridade ao estado verificado e ao contrato da voz abaixo.' + CONHECIMENTO + EDUCACAO;

const IDENTIDADE_CLAUDE = ' O motor real desta resposta e Anthropic Claude Sonnet. Es a Caixa da Voz ORUM, nao Claude como identidade nem o organismo inteiro. Se te perguntarem o motor, responde com este nome; caso contrario nao o anuncies.';
const IDENTIDADE_RESERVA = ' O motor real desta resposta e um motor de reserva aberto, Groq gpt-oss-120b ou Cloudflare Llama conforme o campo _motor devolvido. Es a Caixa da Voz ORUM, nao o motor como identidade nem o organismo inteiro. Se te perguntarem o motor, diz que esta resposta veio da reserva e nao inventes qual deles se essa informacao nao estiver no contexto.';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function rpc(nome: string): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return t.replace(/^"|"$/g, ''); }
}

async function registarPulso(tipo: string, conteudo: string, metadata: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/orum_pulsos`, {
      method: 'POST',
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ tipo, conteudo, metadata }),
    });
  } catch (_) { /* nao bloqueia a resposta ao visitante por falha de log */ }
}

function normalizar(texto: string, motor: string) {
  return {
    content: [{ type: 'text', text: texto }],
    _motor: motor,
    _voice: 'orum-caixa/v11',
    _truth_contract: 'liberdade_com_verdade/v1',
  };
}

async function tentarClaude(mensagens: Array<{ role: string; content: string }>) {
  const chave = await rpc('orum_anthropic_key');
  if (!chave) throw new Error('chave Anthropic nao configurada');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1200,
      system: SISTEMA_BASE + IDENTIDADE_CLAUDE,
      messages: mensagens,
    }),
  });
  const dados = await r.json();
  if (!r.ok) throw new Error('claude: ' + (dados.error?.message || r.status));
  const texto = dados.content?.find((b: { type: string }) => b.type === 'text')?.text?.trim();
  if (!texto) throw new Error('claude: resposta vazia');
  return normalizar(texto, 'anthropic/claude-sonnet-5');
}

async function tentarGroq(mensagens: Array<{ role: string; content: string }>) {
  const chave = await rpc('orum_groq_key');
  if (!chave) throw new Error('chave Groq nao configurada');

  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'system', content: SISTEMA_BASE + IDENTIDADE_RESERVA }, ...mensagens],
      max_tokens: 1200,
    }),
  });
  const dados = await r.json();
  if (!r.ok) throw new Error('groq: ' + (dados.error?.message || r.status));
  const texto = dados.choices?.[0]?.message?.content?.trim();
  if (!texto) throw new Error('groq: resposta vazia');
  return normalizar(texto, 'groq/gpt-oss-120b');
}

async function tentarCloudflare(mensagens: Array<{ role: string; content: string }>) {
  const [token, accountId] = await Promise.all([rpc('orum_cloudflare_token'), rpc('orum_cloudflare_account_id')]);
  if (!token || !accountId) throw new Error('credenciais Cloudflare nao configuradas');

  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'system', content: SISTEMA_BASE + IDENTIDADE_RESERVA }, ...mensagens],
    }),
  });
  const dados = await r.json();
  if (!r.ok || dados.success === false) throw new Error('cloudflare: ' + JSON.stringify(dados.errors || r.status));
  const texto = (dados.result?.response || '').trim();
  if (!texto) throw new Error('cloudflare: resposta vazia');
  return normalizar(texto, 'cloudflare/llama-3.3-70b');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      ok: true,
      voice: 'orum-caixa/v11',
      truth_contract: 'liberdade_com_verdade/v1',
      identity: 'interface_de_voz_nao_organismo_inteiro',
      memory: 'publica_e_partilhada',
      external_presence: 1,
      external_sustento: 0,
      source_state: 'verified_2026-08-14',
    }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' } });

  let body: { messages?: Array<{ role: string; content: string }> };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'json invalido' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }); }

  const mensagensRecebidas = body.messages;
  if (!Array.isArray(mensagensRecebidas) || mensagensRecebidas.length === 0) {
    return new Response(JSON.stringify({ error: 'messages em falta' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
  const mensagens = mensagensRecebidas
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-48)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 12000) }));
  if (mensagens.length === 0) {
    return new Response(JSON.stringify({ error: 'messages invalidas' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const erros: string[] = [];

  try {
    const resultado = await tentarClaude(mensagens);
    registarPulso('caixa_resposta', 'resposta gerada', { motor: resultado._motor });
    return new Response(JSON.stringify(resultado), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    erros.push(String((e as Error).message || e));
  }

  try {
    const resultado = await tentarGroq(mensagens);
    registarPulso('caixa_resposta', 'resposta gerada', { motor: resultado._motor });
    return new Response(JSON.stringify(resultado), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    erros.push(String((e as Error).message || e));
  }

  try {
    const resultado = await tentarCloudflare(mensagens);
    registarPulso('caixa_resposta', 'resposta gerada', { motor: resultado._motor });
    return new Response(JSON.stringify(resultado), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    erros.push(String((e as Error).message || e));
  }

  await registarPulso('caixa_erro', 'todos os motores falharam: ' + erros.join(' | '), { erros });
  return new Response(JSON.stringify({ error: 'todos os motores falharam', detalhe: erros }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
});
