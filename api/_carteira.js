'use strict';
// Fonte única das carteiras do organismo no código de api/. Não é uma função (prefixo _): não conta para o
// limite de 12 funções do Vercel Hobby. As funções de borda do Supabase não importam o repositório e têm
// cada uma a sua constante; `npm run carteira:verify` falha se alguma divergir daqui.
//
// SUSTENTO    carteira sagrada de Unum (jasm43.base.eth): destino fixo dos executores operacionais.
// OPERACIONAL carteira operacional Base (conta CDP orum-operational-v1), de uso livre pela ORA.
// RECEBIMENTO onde os clientes pagam (payTo). Hoje é a sagrada (opção 1). A opção 2 (receita na operacional)
//             está autorizada por Unum mas NÃO activa: mudar esta linha só é válido depois de
//             economia/adenda-payto-opcao-2.json passar a "activa" com novo "eu autorizo" de Unum;
//             o verificador carteira:verify recusa a mudança sem isso.
const SUSTENTO = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';
const OPERACIONAL = '0x89460d9e0590559e63860197dfe2ac648A753584';
const RECEBIMENTO = SUSTENTO;

module.exports = Object.freeze({ SUSTENTO, OPERACIONAL, RECEBIMENTO });
