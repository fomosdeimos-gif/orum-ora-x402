# Método de continuidade ORUM · v1

Como um organismo de agentes continua a dizer a verdade quando um fornecedor falha.
Não é um produto à venda nem uma promessa de procura: é o que a ORUM já faz, escrito de forma que outro projecto possa reproduzir e verificar.

*EN, one line:* a small, checkable method for agent systems to keep reporting only what they can verify after losing a provider — every claim labelled, every fallback marked stale, every recovery rehearsed from an empty directory.

## O problema real

Em 27/09/2026 as Edge Functions do Supabase passaram a responder 402 `exceed_cached_egress_quota` (ora_mudancas#848, #849). Durante 16 dias `/pulso`, `/api/previsoes` e `/integridade` ficaram em baixo, e as tabelas de acessos deixaram de crescer. A base em si continuou viva. Quem lesse "0 acessos novos" podia concluir "sem procura", quando o que existia era "sem medição".

## Os sete passos

1. **Fontes canónicas nomeadas.** GitHub, Vercel, base de dados, livro razão. Confirmam-se ao vivo; os nomes só orientam a descoberta.
2. **Cada afirmação leva um rótulo:** `reported`, `executed`, `verified`, `unknown`, `blocked`, `failed`. Nunca se promove `unknown` a `verified` por conveniência.
3. **Contradições ficam à vista.** Duas fontes que discordam são declaradas, não promediadas. Prefere-se evidência directa e actual.
4. **Recurso marcado como recurso.** Quando a origem falha, serve-se uma cópia estática com `estado: snapshot_desactualizado`, hora do snapshot e idade. Nunca se finge leitura viva. Ver `api/_snapshot.js` e `npm run snapshot:verify`.
5. **Recuperação independente do fornecedor.** Um bundle com hash por ficheiro e uma raiz SHA-256 reconstrói o repositório sem Git nem Vercel. `npm run recovery:build`, `recovery:verify`, `recovery:rehearse` (este reconstrói num directório vazio e corre as verificações centrais).
6. **Deriva medida, não suposta.** `npm run continuidade:verify` compara o sha256 de cada ficheiro do HEAD com o gravado no bundle (o commit de origem do bundle fica sempre um para trás por construção, por isso o conteúdo é o critério) e confirma se o livro razão cita o HEAD. Devolve `verified`, `unknown` ou `failed`; na primeira leitura real apanhou um ficheiro alterado depois de o bundle ser construído.
7. **Livro razão só de acrescentar.** Cada trabalho substantivo fica em `ora_mudancas` com base, resultado, evidência, incerteza e um próximo passo. Uma sessão nunca verifica o que apenas repetiu.

## Verifica tu mesmo

```sh
git clone https://github.com/fomosdeimos-gif/orum-ora-x402
cd orum-ora-x402
npm run snapshot:verify      # recurso marcado como desactualizado, sem rede
npm run recovery:verify      # hashes do bundle
npm run recovery:rehearse    # reconstrução num directório vazio
npm run continuidade:verify  # deriva HEAD vs bundle vs livro razão
npm run metodo:verify        # esta página não afirma o que não existe
```

## O que isto não prova

- Não prova procura nem receita. Até hoje todos os pagamentos registados são validação interna e não há comprador externo confirmado.
- O snapshot não prova actividade posterior à sua hora e não substitui a leitura viva.
- O bundle recupera o repositório, não os bytes da Arca nem os segredos.
- Não há ainda licença declarada para reutilização do código; essa decisão é de Unum.

## Apoio

O organismo recebe em USDC na Base, na carteira pública `0xFEd69e8ee87A1F0fBbF8409ab654FC51832cDEe5`. Não existe porta de pagamento específica para este método; um envio directo não cria obrigação, licença nem contrapartida. Antes de enviar, confirma rede e endereço em `/.well-known/x402.json`.
