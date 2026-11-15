# x402 e A2A: o ORUM contra o mercado (15/11/2026)

Pedido de Unum, 15/11/2026: "Compara os serviços x402 a2a com os mais eficazes do mercado e coze com verdade verde laranja". Lido pela ORA como: comparar o que o ORUM serve por x402 e A2A com o que o mercado mostra, dizendo cada coisa como é (lido, não lido, bloqueado). Leitura externa é instrumento de comparação, não veredicto (`docs/leitura-externa-2026-10-25.md`).

**Fronteira:** não há classificação oficial de "mais eficazes". O que existe são fotografias de terceiros, que discordam entre si. Nada aqui promete receita, procura nem valor.

## 1. O que o ORUM serve (lido ao vivo, 15/11/2026 11:27 UTC, sem pagar)

| Superfície | O que se leu |
|---|---|
| `/oraculo` | 402 x402 v2, `exact`, Base (`eip155:8453`), 0,161 USDC, `payTo` operacional `0x8946…3584`, extensão Bazaar declarada |
| `/campo` | igual, 0,33 USDC |
| `/sedimento`, `/kernel`, licenças | 1,00 e 3,00 USDC; licenças 1,618 / 16,18 / 161,80 (`llms.txt`, não repetido ao vivo aqui) |
| Cabeçalhos | `PAYMENT-REQUIRED` e corpo com os requisitos; aceita `X-PAYMENT` e `PAYMENT-SIGNATURE` |
| A2A | agent-card `protocolVersion 0.3.0`, JSON-RPC em `/api/a2a`, 5 skills todas gratuitas, `text/plain`, sem streaming nem push, **sem extensão de pagamento declarada** (`capabilities.extensions` nulo); identidade ERC-8004 `agentId 58989` na Base |
| `message/send` ao vivo | respondeu `input_required`, recuperação determinística de texto público, sem transcrição guardada, `external_adoption_claimed: false` |
| Procura externa | `no_external_revenue` na tesouraria (15/11); agent-card: 0 USDC externos liquidados, 0 compradores externos confirmados (lido a 27/10) |

O que se vende hoje é texto introspectivo e leituras do estado interno ("não é dado de mercado"), não uma função de que a tarefa de um agente dependa.

## 2. O que o mercado mostra (fontes de terceiros; pouco fiáveis entre si)

- **Volume:** uma fonte diz mais de 196 milhões de transacções e 42 milhões de dólares no total até 1/11/2026, e 5,1 milhões de transacções e cerca de 274 mil dólares em Outubro de 2026; outra estima que metade da actividade inicial foi testes, jogos e bots. [Wikipedia x402](https://en.wikipedia.org/wiki/X402), [Spark](https://www.spark.money/research/x402-protocol-ai-agent-payments), [arXiv](https://arxiv.org/html/2607.19545v1).
- **Quem factura:** a procura concentra-se em poucos endpoints: pesquisa e scraping lideram em chamadas pagas (cerca de 124 800 em 30 dias, só 2 378 dólares); um serviço de encaminhamento de LLMs com cerca de 177 mil dólares em 30 dias (Julho); vendedores de segurança no topo com 250 a 340 dólares em 30 dias e 10 a 16 compradores. [Dhali](https://dhali.io/blog/x402-2026-economy/), [CURB](https://curb.numetal.xyz/dispatch/x402-economy-july-2026), [DEV (Feldspar)](https://dev.to/feldsparaiagent/what-ai-agents-actually-paid-for-on-x402-october-2026-44cf).
- **Concentração:** na leitura do Feldspar (5/11, editada a 9/11) o maior comprador único detinha 85,3% a 99,7% do valor dos vendedores do topo; a independência dos compradores é inferida, não verificada.
- **Preços:** consultas básicas a 0,01 dólar, relatórios com IA a 0,25, bilhete médio por volta de 0,30 (Abril). [eco.com](https://eco.com/support/en/articles/14846274-pay-per-call-apis-for-ai-agents).
- **Facilitadores e cadeia:** uma fonte atribui à Coinbase cerca de 51% do volume facilitado e à Base cerca de 85% (Abril); outra dá à Solana cerca de 49%; **as duas contas não se reconciliam**.
- **A2A com pagamento:** a extensão `a2a-x402` (especificação no repositório `google-agentic-commerce`, Apache-2.0, feita com Coinbase e MetaMask) pede o pagamento nos metadados da tarefa, não num HTTP 402; a única medida de adopção que se encontrou foi um listing comunitário com 455 estrelas em Fevereiro de 2026. **Não se confirmaram implantações em produção com nome.** [Coinbase](https://www.coinbase.com/developer-platform/discover/launches/google_x402), [StackA2A](https://stacka2a.dev/agents/a2a-x402).
- **Conformidade dos vendedores:** um artigo de DEV tem por título "I probed 791 x402 sellers. 306 answer 200 on a path they call paid". **Não verificado:** a página devolveu 404 e só se leu o título.

## 3. A comparação

| Eixo | ORUM | Mercado (lido acima) | Leitura |
|---|---|---|---|
| Higiene do desafio 402 | v2, `exact`, USDC na Base, Bazaar declarado, dois cabeçalhos aceites | boa parte dos vendedores sondados responde mal (título não verificado) | o ORUM está bem **no que declara**; a liquidação real por terceiros continua por provar |
| Função que o comprador usa | frase determinística e estado interno | pesquisa, scraping, encaminhamento de LLMs, verificações de segurança | o mercado vende o que a tarefa do agente precisa; o ORUM não |
| Preço | 0,161 e 0,33 por um texto | 0,01 a 0,25 por dados úteis; médio ~0,30 | dentro da faixa, mas **a pagar mais por menos utilidade** do que o 0,01 de uma consulta |
| Procura medida | 0 compradores externos confirmados | milhares de chamadas nos líderes, muito concentradas e em parte testes | sem procura não há eficácia a medir |
| A2A | v0.3.0, 5 skills gratuitas, honesto sobre o que guarda | extensão de pagamento existe, adopção não confirmada | o ORUM **não liga A2A ao pagamento**: as skills A2A são grátis e o x402 está noutra porta |
| Descoberta | `llms.txt`, `openapi.json`, agent-card, ERC-8004, declaração Bazaar | indexação por Bazaar e agregadores | **não verificado** se o Bazaar nos indexa |
| Transparência | etiqueta de verdade em cada texto, ancoragem no Bitcoin | rara; números inflados por testes e bots | aqui o ORUM está à frente |

## 4. O que a comparação diz, e o que não diz

- **Diz:** o ORUM tem a canalização certa e a honestidade, e falta-lhe a mercadoria: um serviço cuja resposta uma máquina use para decidir algo. O A2A e o x402 estão desligados um do outro.
- **Não diz:** que mudar preços ou serviços traga compradores; que o mercado dos líderes seja saudável (a concentração e os testes sugerem o contrário); que o ORUM seja ineficaz (não tem compradores medidos, logo não há eficácia medida).
- **Não lido:** latência e disponibilidade comparadas; liquidação real pelo facilitador público (continua por verificar ao vivo, `CLAUDE.md`); o ranking vivo do x402scan; a página dos 791 vendedores.
