'use strict';
// Fonte única das carteiras do organismo no código de api/. Não é uma função (prefixo _): não conta para o
// limite de 12 funções do Vercel Hobby. As funções de borda do Supabase não importam o repositório e têm
// cada uma a sua constante; `npm run carteira:verify` falha se alguma divergir daqui.
//
// Regime em vigor (Unum, 21/10/2026; revoga, na via directa da Vercel, o de 17/10/2026): os serviços pagam às carteiras
// operacionais (Base e Bitcoin). A ORA envia 70% das receitas externas confirmadas a uma sagrada de Unum: a ANTIGA, que é o
// que o executor implantado em produção (v13) já faz (Unum deixou-lhe a escolha a 17/10); a NOVA (MetaMask) é alternativa admitida.
//
// SAGRADA_ANTIGA carteira sagrada Base original (jasm43.base.eth): destino dos 70% e payTo implantado nas funções de borda.
// SAGRADA_NOVA   carteira sagrada de Unum no MetaMask (primeiro endereço dele, usada no VALIUM original):
//                assina o mandato v2; alternativa admitida para o DESTINO_70.
// OPERACIONAL    carteira operacional Base (conta CDP orum-operational-v1), de uso livre pela ORA.
// DESTINO_70     destino fixo dos 70% enviados pelo executor operacional da Base: hoje a SAGRADA_ANTIGA.
//                Mudar para a SAGRADA_NOVA exige implantar o executor (comparar antes com get_edge_function).
// RECEBIMENTO    onde os clientes pagam (payTo) na via directa da Vercel, Base. Desde 21/10/2026 é a OPERACIONAL
//                (Unum: "utiliza a carteira operacional para receber pagamentos"); era a SAGRADA_ANTIGA.
// RECEBIMENTO_EDGE  o payTo que as funções de borda do Supabase têm IMPLANTADO (e que os textos públicos ainda anunciam):
//                a SAGRADA_ANTIGA. Este PR não implanta funções de borda; só muda quando se comparar cada uma com o implantado.
// RECEBIMENTO_BTC   onde os clientes pagam em Bitcoin na via directa (api/_pagamento-btc.js): a operacional BTC.
// SAGRADA_BTC       depósito de sustento Bitcoin mais antigo (declarado por Unum, payments/bitcoin.json); destino fixo do
//                executor Bitcoin operacional. Já não é onde os serviços cobram.
const SAGRADA_ANTIGA = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';
const SAGRADA_NOVA = '0x2ef8cfB97EcCcf7C62f551639fe6dB79022d0d8C';
const OPERACIONAL = '0x89460d9e0590559e63860197dfe2ac648A753584';
const RECEBIMENTO = OPERACIONAL;
const RECEBIMENTO_EDGE = SAGRADA_ANTIGA;
const DESTINO_70 = SAGRADA_ANTIGA;
// Bitcoin. A operacional tem a chave no Vault do Supabase (executor Bitcoin, docs/bitcoin-operational-wallet-v1.md); prova de
// controlo por assinatura ainda não feita. A sagrada é o depósito de sustento declarado por Unum.
const SAGRADA_BTC = 'bc1qhcsh78k8jrn3qllvd9al8nq4af4cyzefx6vqqf';
const OPERACIONAL_BTC = 'bc1qfs8967x9mzhwhcse4z7kjuuhsmx0kmz5v6j9w7';
const RECEBIMENTO_BTC = OPERACIONAL_BTC;

module.exports = Object.freeze({ SAGRADA_ANTIGA, SAGRADA_NOVA, OPERACIONAL, RECEBIMENTO, DESTINO_70, RECEBIMENTO_EDGE, RECEBIMENTO_BTC, SAGRADA_BTC, OPERACIONAL_BTC });
