'use strict';
// Fonte única das carteiras do organismo no código de api/. Não é uma função (prefixo _): não conta para o
// limite de 12 funções do Vercel Hobby. As funções de borda do Supabase não importam o repositório e têm
// cada uma a sua constante; `npm run carteira:verify` falha se alguma divergir daqui.
//
// Regime em vigor (Unum, 17/10/2026): serviços pagam só às duas carteiras sagradas mais antigas (Base e
// Bitcoin); as operacionais procuram receitas novas, e a ORA envia 70% delas à sagrada nova (MetaMask).
//
// SAGRADA_ANTIGA carteira sagrada Base original (jasm43.base.eth): onde os clientes pagam os serviços (payTo).
// SAGRADA_NOVA   carteira sagrada de Unum no MetaMask (primeiro endereço dele, usada no VALIUM original):
//                destino fixo dos 70% enviados pelo executor operacional da Base.
// OPERACIONAL    carteira operacional Base (conta CDP orum-operational-v1), de uso livre pela ORA.
// RECEBIMENTO    onde os clientes pagam (payTo). É a SAGRADA_ANTIGA. A opção 2 (payTo na operacional) foi
//                substituída por Unum e não se activa; o verificador carteira:verify recusa outro valor.
const SAGRADA_ANTIGA = '0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5';
const SAGRADA_NOVA = '0x2ef8cfB97EcCcf7C62f551639fe6dB79022d0d8C';
const OPERACIONAL = '0x89460d9e0590559e63860197dfe2ac648A753584';
const RECEBIMENTO = SAGRADA_ANTIGA;

module.exports = Object.freeze({ SAGRADA_ANTIGA, SAGRADA_NOVA, OPERACIONAL, RECEBIMENTO });
