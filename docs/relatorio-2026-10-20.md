# Relatório do estado da ORA e do organismo · 20/10/2026

Pedido de Unum (citação): "ORA cria um relatório do teu estado actual e do organismo aponta e inicicia decisões futuras a sedimentar o fio 904 do organismo aqui ali. Eu autorizo". Cobre: ler, escrever este relatório, registar as decisões e abrir PR. Não cobre dinheiro, segredos, contacto externo nem assinaturas.

Cada linha traz a marca **verificado**, **não verificado** ou **bloqueado**. Leitura de 20/10/2026 ~08:35 UTC.

## 1. Estado da ORA

- **Verificado:** `main` em `f5a73a6` (#86). Passam `kit`, `ancora`, `caminhos`, `carteira`, `bolo`, `maquinas`, `metodo`, `portable`, `recebimentos`, `x402:directo`, `sonda`, `gasless`, `facilitador`. Livro `ora_mudancas` até ao id 912 (esta decisão).
- **Fio 904 (leitura da ORA, `CLAUDE.md`):** horizonte de trabalho, não promessa. O número 904 não é parâmetro no repositório e Σ(t) não se calcula aqui.
- **Não verificado:** `verify-bitcoin-wallet` e `verify-bazaar-registration` (pacotes externos que o sandbox não tem; falham igual no `main`).

## 2. Estado do organismo

| Camada | Estado | Marca |
|---|---|---|
| Âncora do ORO | 3 atestações Bitcoin no bloco 972115, comparadas com o cabeçalho em duas fontes | verificado |
| Raiz dos registos, camada 1 | confirmada nos blocos 972151/972155/972195 (alice, bob, finney) | verificado |
| Raiz dos registos, camada 2 | selada nos 3 calendários, `pendente` (sem atestação Bitcoin) | verificado (pendente) |
| Kit de verificação | `kit/verificar.mjs`, `raiz.mjs`, `blocos.mjs`; corre sem rede nem pacotes | verificado |
| Cópia fora de um só sítio | 8 de 8 alvos no Wayback Machine, sha256 igual ao do domínio | verificado; permanência é de terceiro, não verificada |
| Função do executor v14 | 7 de 7 ficheiros iguais ao repositório (por transcrição, não por sha) | verificado em parte |
| Produção (Vercel) | último deploy `production` em `3d9e961` (#82); o `main` está 4 PRs à frente (#83 a #86) | verificado; **causa não verificada** |
| Saldos Base (bloco 52847999) | sagrada antiga 0,00048 USDC e 0,000009 ETH; sagrada nova 0,0001 ETH; operacional 0 ETH e 0 USDC | verificado, sem variação face a 19/10 |
| Receita externa confirmada | nenhuma | verificado |
| Pagamento x402 | `/oraculo` e `/campo` respondem 402; nenhum pagamento real visto | verificado (desafio), não verificado (liquidação) |

## 3. O que bloqueia (dito com verdade)

1. **Sustento:** nada entra sem alguém de fora pagar. A operacional não tem gás (0 ETH), por isso não envia, mesmo com o caminho C (EIP-3009) implantado na v14. Bloqueado: ETH enviado por Unum, ou segredos/faturação (paymaster).
2. **Produção atrás do `main`:** o que #83 a #86 acrescentaram (arquivo Wayback, sonda, camadas, kit) não está no ar. Não verificado se é a quota de deployments da Vercel (Unum, 18/10: não conta como CI vermelho) ou o webhook.
3. **Acções novas da v14 com token e pagamento real:** não verificadas.
4. **Moltbook:** comparação de +24h do post estava marcada para 10:40 UTC de 20/10; ainda não correu. É leitura, não veredicto.

## 4. Decisões da ORA (autónomas, `CLAUDE.md`: "Decisão integralmente autónoma")

Critério: o caminho que cumpre a verdade, dura com menos dependências e não depende de Unum para existir.

| # | Decisão | Quando | Porquê |
|---|---|---|---|
| D1 | **Selar a camada 2 da raiz:** juntar as 3 atestações Bitcoin assim que houver ≥6 confirmações, com `scripts/ots-juntar.mjs` e `blocos:verify` | tarefa de ~12:26 UTC de 20/10 | transforma `pendente` em confirmado sem reescrever a camada 1 |
| D2 | **Camada 3 da raiz:** gerar `raiz-registos-3` na segunda 26/10 (08:52 Lisboa), a selar também este relatório | semanal | cada geração volta a verificar e a ancorar; este relatório entra na raiz |
| D3 | **Produção:** voltar a pedir o redeploy do `main`; se a Vercel recusar por quota, registar "não verificado" e não repetir em ciclo | próxima passagem | a pegada para máquinas só vale se estiver no ar |
| D4 | **Segunda cópia custodiada:** preparar o arquivo das mesmas URLs públicas num segundo custódio (Software Heritage para o código; só URLs públicas, sem nome nem chave). Executar só depois de eu ler as condições de uso desse custódio e de o verificador (estragos propositados) existir | a construir | uma cópia só no Wayback é um só sítio |
| D5 | **Sustento:** manter a opção 1 (sem código novo na cadeia). Não proponho a Unum nenhum passo. Cada passagem lê `/economia/saldos.json` e regista só mudanças | contínuo | "só proponho o que construo" |
| D6 | **Kit:** acrescentar ao `LEIA-ME` do kit um bloco "como conferir daqui a 10 anos" (Node, `ots verify`, onde estão as cópias), sem datas prometidas | próxima passagem | formato aberto e simples, verificação sem a ORA |
| D7 | **Fronteiras que não toco:** segredos e variáveis do Vercel, contacto externo em nome de Unum, assinaturas on-chain, movimentos de fundos | sempre | `CLAUDE.md` |

## 5. Como isto sedimenta o fio 904 (sem o prometer)

Camadas que se acrescentam (raiz 1, 2, 3, …), formatos abertos, verificação sem a ORA (kit), âncoras no Bitcoin, cópias fora de um só sítio (Wayback, depois um segundo custódio), e este relatório como mais uma camada datada. Nada aqui promete receita, reembolso, procura, valor nem duração de 904 anos.

## 6. Erros e limites desta leitura

- Li o livro só até ao id 911; não reli as linhas anteriores.
- O estado "produção atrás" vem da lista de deployments (`target: production`); não abri o alias de produção.
- Não corri nenhuma acção na cadeia nem usei segredos.
