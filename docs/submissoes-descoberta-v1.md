# Submissões de descoberta x402 · rascunho v1 · 30/09/2026

Estado: **preparado, não publicado.** Unum autorizou preparar (30/09); a publicação
espera por três condições, por esta ordem:

1. `CDP_API_KEY_ID` e `CDP_API_KEY_SECRET` configurados (Sensitive, Production) no
   projecto Vercel `ora-x402-gateway` e redeploy feito (ora_mudancas #792).
2. Este PR fundido e em produção: `/oraculo` e `/campo` com `extensions.bazaar` no
   402 e presentes em `/openapi.json` (o ficheiro estático, que é o servido).
3. Verificação ao vivo: `/.well-known/x402.json` com `fronteiras.eip3009_facilitador: true`.

Sem a condição 1, um cliente x402 padrão que assine EIP-3009 recebe 402 com
"autorizacao EIP-3009 nao aceite nesta via". Listar antes disso traria agentes a
uma porta que os recusa. Esta é a objecção que `halmarketplace` fez no Moltbook
(post `abaac7ea`, 04/09), e continua por resolver.

Só se anuncia o que aceita pagamento agora: Oráculo (0,161 USDC) e Campo (0,33 USDC).
Licenças, Sedimento e Kernel ficam de fora enquanto as Edge Functions Supabase
estiverem sem quota.

---

## 1. x402scan

Não há template de issue. O registo faz-se pelo formulário
`https://www.x402scan.com/resources/register`, que sonda o URL e só o aceita se
devolver um desafio x402 válido. Para ser marcado como invocável, o 402 precisa de
`accepts` não vazio e de `extensions.bazaar` com input schema (este PR acrescenta-o).

**Recomendação:** usar "Register This URL Only" duas vezes, e não "Add Server".
O "Add Server" lê o `/openapi.json` e também tentaria `/licenca/*`, que hoje devolvem
503 e seriam registadas como falhadas.

| Campo | Valor |
|---|---|
| URL 1 | `https://ora-x402-gateway.vercel.app/oraculo` |
| URL 2 | `https://ora-x402-gateway.vercel.app/campo` |

Pré-verificação, a correr de uma máquina com acesso à rede (a sessão cloud não
tem, porque o proxy bloqueia o domínio):

```
npx -y @agentcash/discovery ora-x402-gateway.vercel.app -v
curl -i https://ora-x402-gateway.vercel.app/oraculo
```

---

## 2. awesome-x402

As integrações fazem-se no upstream `xpaysh/awesome-x402`; o fork `resolved-sh`
serve apenas de espelho. O PR #1 do fork foi fechado sem merge e trazia commits
antigos da ORA ("ORA: corrige entrada ORUM…"). Regras: um recurso por PR, título
`Add [Resource Name]`, uma linha no fim da categoria mais adequada, sem emojis e
com tom neutro.

**Categoria:** Example Applications → API Examples

**Linha:**

```
- [ORA · ORUM](https://ora-x402-gateway.vercel.app) - Two paid introspective readings from an art organism built around a physical collection of 107 works (not market data): /oraculo at 0.161 USDC and /campo at 0.33 USDC per call, USDC on Base. [Manifest](https://ora-x402-gateway.vercel.app/.well-known/x402.json)
```

**Título do PR:** `Add ORA · ORUM`

**Corpo do PR (template do repositório):**

```
## Add ORA · ORUM

**What:** A live x402 v2 seller on Base mainnet with two GET endpoints: /oraculo (0.161 USDC) returns a reading derived from the payer's transaction; /campo (0.33 USDC) returns a point reading of the organism's internal state. Both answer unauthenticated requests with a 402 challenge (PAYMENT-REQUIRED header, exact scheme, USDC, extensions.bazaar) and settle EIP-3009 authorizations through the Coinbase CDP facilitator, confirming the transfer on-chain before delivering.

**Why:** A small, honest example of a non-data x402 seller: the responses state what they are not (no market data, no price prediction), and a free sample is available at /oraculo/eco.

**Quality Checklist:**
- [x] Resource is actively maintained or historically significant
- [x] Well-documented with clear usage instructions
- [x] Directly related to x402 protocol
- [x] Link is working and accessible
- [x] Follows contribution format

**Category:** Example Applications → API Examples
```

O corpo afirma liquidação via CDP. **Só pode ser enviado depois da condição 3.**
Se o CDP não estiver activo, retira-se essa frase e declara-se a prova manual por
`transactionHash`.

---

## 3. Agentic.Market

Segundo o sinal 5 de `ora_ponte_sinais`, a indexação é automática a partir de
pagamentos reais, e há um "Validate Endpoint" self-serve. Nesta sessão não foi
possível ler o site, porque o proxy bloqueia `agentic.market`. Por isso não se sabe se o
validador exige liquidação EIP-3009 ou se lê apenas o desafio. Correr o validador
contra `/oraculo` e `/campo` depois da condição 3.

---

## Depois de publicar

- Registar cada submissão em `ora_mudancas` com URL, hora e resultado observado.
- Indexação não é avaliação e avaliação não é pagamento: um recurso listado conta
  como indexação, não como adopção.
- Responder a `halmarketplace` no fio `abaac7ea` com a prova de um pagamento
  EIP-3009 verificado de ponta a ponta.
