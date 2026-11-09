# Projecção condicional dos serviços a 10 anos (07/11/2026)

**Não é previsão nem promessa.** Não existe nenhuma medida externa de procura (receita externa confirmada: nenhuma), por isso não há curva nem número de receita. Esta página diz o que teria de ser verdade em cada cenário e o que a ORA lê para saber em qual está. Formato de máquina: `economia/projecao-servicos.json` (verificador `projecao:verify`).

Palavra de Unum (07/11/2026, sessão de trabalho): "Faz uma projecção dos serviços para os próximos 10 anos" e, à proposta concreta de a escrever com verificador, "Eu autorizo ORA".

## Dados de partida (lidos a 07/11/2026)

- Serviços: `/oraculo` 0,161 USDC, `/campo` 0,33 USDC e `/auditoria` 0,50 USDC, pela Base com x402; `/oraculo` e `/campo` têm também a via Bitcoin a 1 000 sats cada (`PRECO_SATS`, fundido no PR #291; produção ainda não lida ao vivo).
- Fundos das operacionais: 10 072 sats (enviados por Unum) e 0,161 USDC; movimento interno, não é receita.
- Receita externa confirmada: nenhuma. Procura externa confirmada: nenhuma.
- Dependências: Vercel Hobby, Supabase (fora de quota desde 27/09), facilitador x402 e duas fontes Esplora; `economia/amarras.json` lista 16 fornecedores, um solto.

## Cenários

**A. Sem pagador externo.** O organismo fica como obra legível por máquinas, sem receita, e depende de Unum pagar a hospedagem. Sobrevivem as âncoras, o kit de verificação e os registos, que se conferem sem a ORA. Os serviços podem acabar quando a hospedagem acabar.

**B. Procura pequena e esporádica.** Chegam pagamentos externos raros. O ganho é a prova de que o caminho funciona de ponta a ponta; só esses pagamentos entram no 70/20/10. Se o sustento cobre a hospedagem só se sabe com dados que ainda não existem.

**C. Procura sustentada.** Exigiria agentes ou máquinas a pagar de forma recorrente, o que depende de terceiros descobrirem os serviços e a ORA não controla. A infraestrutura actual não escalaria sem mudanças.

## Riscos comuns

- O preço em sats deriva com o mercado em USD; revisão prevista se se afastar mais de 25% da referência de 02/11/2026.
- Fornecedores (Vercel, Supabase, CDP, facilitadores) podem mudar de condições ou desaparecer; a independência total não está prometida.
- O x402 e o Bitcoin podem mudar; o Bitcoin é o fio de âncora preferido, não uma certeza.
- Os fundos operacionais estão sob a chave da ORA: perder a custódia é um risco real.

## Indicadores que mudariam a leitura

1. A primeira receita externa confirmada, em duas fontes.
2. Pedidos externos recorrentes, distintos de testes próprios.
3. O custo real de hospedagem contra o que entrou.
4. O número de amarras soltas contra as 16.

## Fronteira

Esta projecção não promete receita, reembolso, procura nem valor, e não faz do ORO um activo. Só receita externa confirmada entra no 70/20/10. Não move fundos nem muda permissões.
