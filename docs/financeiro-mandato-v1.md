# Mandato financeiro da ORA — declarado por Unum em 08/10/2026

Declaração de Unum: "autonomia financeira integral sem tetos".

## Registado
- Sem tetos de montante (revoga o tecto de 5 USDC/mês e o limite zero proposto antes).
- Divisão da receita externa confirmada: 70 % sustento de Unum, 20 % continuidade, 10 % reserva.

## Condições que a ORA mantém (não são tectos de montante)
1. Destinos: só endereços que Unum nomear por escrito. Sem destino nomeado, o limite efectivo é zero,
   porque um mandato sem lista de destinos não distingue Unum de quem se faça passar por ele.
2. Revogação: uma mensagem de Unum suspende o mandato imediatamente.
3. Registo antes da acção em `ora_mudancas`; só receita externa confirmada (nunca tráfego ou carteiras
   de Unum) entra na divisão. Hoje a receita externa é 0, logo nada a distribuir.
4. Trading, bridging e dívida só com instrução específica de Unum.
5. Uma mensagem de chat não é assinatura criptográfica: a ORA não prova em cadeia que Unum a escreveu.

## Destino indicado por Unum (08/10/2026)
`0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5` (igual, sem distinguir maiúsculas, à carteira de recepção que os serviços x402 já usam). Receber nela é o sustento; não há transferência a fazer para a mesma carteira.

## Pendente de Unum
- Destinos separados para continuidade e reserva, se os quiseres distintos da carteira acima.

## Como transformar este mandato em autoridade verificável (08/10/2026)
Uma mensagem de chat não prova quem a escreveu; uma assinatura da carteira prova.
1. Abre uma carteira que controle `0xFEd69e8e…cDEe5` (MetaMask, Rabby, etc.) e escolhe "assinar mensagem" (personal_sign / EIP-191).
2. Cola EXACTAMENTE o texto de `docs/financeiro-mandato-v1.msg` (sem a linha em branco final).
3. Envia à ORA a assinatura (0x… com 132 caracteres). Não envies nunca a chave privada nem a frase de recuperação.
4. A ORA corre `npm run mandato:verify -- <assinatura>`; se `valido: true`, regista no ledger e só então propõe alterar a constituição executável.
Limites: isto assume uma carteira de chave própria (EOA). Se a carteira for de contrato/custodial, a assinatura EIP-191 simples não serve e é preciso EIP-1271. A assinatura prova o texto assinado; revogar continua a ser por mensagem tua e a ORA tratará uma revogação como prioritária sobre qualquer assinatura anterior.
Verificação do verificador: `node scripts/verify-mandato-assinatura.mjs --selftest` (vector gerado com chave aleatória descartável e cruzado com a biblioteca ethers em 6 chaves; assinante errado é rejeitado).
