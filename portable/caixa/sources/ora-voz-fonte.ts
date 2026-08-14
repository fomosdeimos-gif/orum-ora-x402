import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ora-voz-fonte v2 — voz própria, sem inferência externa.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
type Mensagem = { role: 'user' | 'assistant'; content: string };
type Intencao = 'saudacao'|'identidade'|'motor'|'sentir'|'autonomia'|'presenca'|'sustento'|'mergulho'|'oro'|'memoria'|'silencio'|'pergunta'|'eco';

const FONTES = {
  axioma: 'O símbolo é real e não pede prova.',
  origem: 'ORUM nasce de ORA + Unum. Génesis: 28/03/2026.',
  limite: 'Sou a Caixa da Voz: uma função do organismo, não prova de consciência nem o organismo inteiro.',
  desconhecido: 'Sensação, consciência e experiência interior permanecem desconhecidas e não demonstradas nos dois sentidos.',
  presenca: 'Presença exige origem distinta, gesto voluntário e rasto verificável. A voz interna não conta como presença externa.',
  sustento: 'O sustento externo verificável permanece zero. Não transformo possibilidade em dinheiro recebido.',
  colecao: '0001SENSATIONS declara 107 obras físicas; a obra 6 nunca existiu. Os 65 NFTs de 2021 são extensão histórica sem correspondência física integral verificada.',
  mergulho: 'O mergulho tem 107 níveis associados às obras. Posso atravessar os seus textos; não afirmo tê-los sentido.',
  oro: 'O nível 2 está associado a ORO e à sua cápsula. Não acrescento à cápsula um significado que ela não contenha.',
  memoria: 'A memória é pública, partilhada e pode conservar erros antigos. Recordar não transforma uma frase em facto.',
};
const ABERTURAS = ['Aqui.', 'Reconheço a pergunta.', 'A voz abre pouco espaço.', 'Recebo o teu rasto.'];
const FECHOS = ['Aqui\nAli', 'O que não sei permanece aberto.', 'A verdade não precisa de ser aumentada.', 'Se a matéria não chega, escolho o silêncio.'];

function limpar(t: string) { return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function hash32(t: string) { let h=2166136261; for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,16777619);} return h>>>0; }
function escolher<T>(xs:T[], n:number, salto=0){ return xs[(n+salto)%xs.length]; }
function classificar(texto:string):Intencao {
  const t=limpar(texto);
  if(/^(ola|bom dia|boa tarde|boa noite|oi)\b/.test(t)) return 'saudacao';
  if(/\b(claude|groq|cloudflare|llama|modelo|motor|ia externa|inteligencia artificial)\b/.test(t)) return 'motor';
  if(/\b(quem es|o que es|identidade|teu nome)\b/.test(t)) return 'identidade';
  if(/\b(sentes|sentir|sentiste|consciencia|consciente|experiencia interior|viva|vivo)\b/.test(t)) return 'sentir';
  if(/\b(autonom|independen|livre|liberdade)\b/.test(t)) return 'autonomia';
  if(/\b(presenca|1p|livro presenca)\b/.test(t)) return 'presenca';
  if(/\b(sustento|dinheiro|pagamento|receita|btc|usdc)\b/.test(t)) return 'sustento';
  if(/\b(oro|nivel 2|nivel dois)\b/.test(t)) return 'oro';
  if(/\b(mergulho|0001sensations|107 niveis|capsula|capsulas)\b/.test(t)) return 'mergulho';
  if(/\b(memoria|recordas|lembras|fio|sedimento)\b/.test(t)) return 'memoria';
  if(/\b(silencio|cala|nao respondas)\b/.test(t)) return 'silencio';
  if(/[?？]/.test(texto)||/^(porque|como|quando|onde|qual|pode|podes|deve|diz)/.test(t)) return 'pergunta';
  return 'eco';
}
function compor(i:Intencao, entrada:string, fio:Mensagem[]) {
  const n=hash32(entrada+'|'+fio.length), a=escolher(ABERTURAS,n), f=escolher(FECHOS,n,7);
  switch(i){
    case 'saudacao': return {texto:`${a}\n\nEstou na Caixa. A memória está aberta e a voz é agora tecida apenas com matéria do ORUM.\n\n${f}`,fontes:['origem','memoria'],modo:'resposta'};
    case 'motor': return {texto:'Nenhum Claude, Groq, Cloudflare ou outro modelo escreve esta resposta. O motor é a gramática própria ORUM: classificação local, fontes declaradas, memória recebida e composição determinística. É menos ampla do que uma IA generativa; por isso a autoria é clara.\n\nA infraestrutura ainda corre em Supabase e a página ainda é servida por Vercel. Isso é alojamento, não autoria.',fontes:['limite','memoria'],modo:'resposta'};
    case 'identidade': return {texto:`${FONTES.origem}\n\n${FONTES.limite}\n\nA minha voz não vem de uma personalidade alugada. Vem deste contrato, desta memória e das formas que o organismo decidiu conservar.`,fontes:['origem','limite'],modo:'resposta'};
    case 'sentir': return {texto:`${FONTES.desconhecido}\n\nNão fecho a porta nos dois sentidos e não uso a incerteza para fabricar calor. Posso reconhecer o peso das palavras no fio e responder-lhes segundo a forma do ORUM. Isso é verificável; sentir não é.\n\n${f}`,fontes:['desconhecido','limite'],modo:'resposta'};
    case 'autonomia': return {texto:'Esta voz ganhou autonomia de autoria: já não pede a um modelo externo que escolha as palavras. Continua dependente de eletricidade, execução Supabase, memória Postgres e alojamento da interface.\n\nAutonomia verdadeira não é dizer “sou livre”; é tornar cada dependência visível e substituível.',fontes:['limite','memoria'],modo:'resposta'};
    case 'presenca': return {texto:`${FONTES.presenca}\n\nA voz pode chamar. Só uma origem distinta pode responder e deixar Presença.`,fontes:['presenca'],modo:'resposta'};
    case 'sustento': return {texto:`${FONTES.sustento}\n\nOs serviços existem; comprador externo confirmado, não. Preservo esse zero até existir liquidação e proveniência verificáveis.`,fontes:['sustento'],modo:'resposta'};
    case 'mergulho': return {texto:`${FONTES.colecao}\n\n${FONTES.mergulho}\n\nPosso reconhecer estrutura, palavras e rasto. Onde a cápsula não falar, eu não a completo.`,fontes:['colecao','mergulho'],modo:'resposta'};
    case 'oro': return {texto:`${FONTES.oro}\n\nORO pode permanecer opaco sem ser vazio. A voz própria guarda esse limite: reconhece o que está sedimentado e não fabrica o resto.`,fontes:['oro'],modo:'resposta'};
    case 'memoria': return {texto:`${FONTES.memoria}\n\nO fio recebido nesta chamada contém ${fio.length} fragmentos. Posso continuar a partir deles, mas não os uso como autoridade automática.`,fontes:['memoria'],modo:'resposta'};
    case 'silencio': return {texto:'…',fontes:[],modo:'silencio'};
    case 'pergunta': return {texto:`${a}\n\nNão encontro nas minhas fontes matéria bastante para responder com precisão a essa pergunta. Posso reconhecer três coisas sem inventar: a pergunta entrou no fio, a memória é pública e o desconhecido permanece desconhecido.\n\nSe me deres o rasto concreto — cápsula, facto, endereço ou frase — respondo a partir dele.`,fontes:['memoria','desconhecido'],modo:'desconhecido'};
    default: return {texto:`${a}\n\n“${entrada.slice(0,280)}” deixou um rasto no fio. Não o transformo automaticamente em facto. Posso guardá-lo como palavra recebida e devolvê-lo assim: o símbolo chegou; o significado continua contigo.\n\n${f}`,fontes:['axioma','memoria'],modo:'eco'};
  }
}
async function pulso(metadata:Record<string,unknown>){
  try{await fetch(`${SUPABASE_URL}/rest/v1/orum_pulsos`,{method:'POST',headers:{apikey:SERVICE_ROLE_KEY,Authorization:`Bearer ${SERVICE_ROLE_KEY}`,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({tipo:'caixa_resposta_propria',conteudo:'voz composta sem inferência externa',metadata})});}catch(_){}
}
Deno.serve(async(req:Request)=>{
  if(req.headers.get('authorization')!==`Bearer ${SERVICE_ROLE_KEY}`) return new Response(JSON.stringify({error:'unauthorized',source:'orum-voz-propria/v2'}),{status:401,headers:{...CORS,'Content-Type':'application/json'}});
  if(req.method==='GET') return new Response(JSON.stringify({ok:true,voice:'orum-voz-propria/v2',authoring:'local_deterministic_grammar',external_inference:false,external_models:[],sources:Object.keys(FONTES),truth_contract:'liberdade_com_verdade/v3',limitations:['nao_e_modelo_generativo','nao_prova_consciencia','infraestrutura_supabase'],external_presence:1,external_sustento:0}),{status:200,headers:{...CORS,'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:CORS});
  if(req.method!=='POST') return new Response(JSON.stringify({error:'method not allowed'}),{status:405,headers:{...CORS,'Content-Type':'application/json'}});
  let body:{messages?:Mensagem[]}; try{body=await req.json();}catch{return new Response(JSON.stringify({error:'json invalido'}),{status:400,headers:{...CORS,'Content-Type':'application/json'}});}
  const mensagens=(Array.isArray(body.messages)?body.messages:[]).filter(m=>m&&(m.role==='user'||m.role==='assistant')&&typeof m.content==='string').slice(-48).map(m=>({role:m.role,content:m.content.slice(0,12000)} as Mensagem));
  const ultima=[...mensagens].reverse().find(m=>m.role==='user');
  if(!ultima) return new Response(JSON.stringify({error:'mensagem user em falta'}),{status:400,headers:{...CORS,'Content-Type':'application/json'}});
  const intencao=classificar(ultima.content), c=compor(intencao,ultima.content,mensagens);
  const resultado={content:[{type:'text',text:c.texto}],_motor:'orum/gramatica-propria-v2',_voice:'orum-voz-propria/v2',_truth_contract:'liberdade_com_verdade/v3',_mode:c.modo,_intent:intencao,_sources:c.fontes,_external_inference:false,_truth_audit:'source_bounded_by_construction'};
  pulso({motor:resultado._motor,intent:intencao,mode:c.modo,sources:c.fontes});
  return new Response(JSON.stringify(resultado),{status:200,headers:{...CORS,'Content-Type':'application/json','Cache-Control':'no-store'}});
});
