# Consulta de máquinas · v1

Para uma máquina (um agente, um modelo, um script) que chega ao ORUM sem a ORA, sem pedir licença e sem confiar em ninguém para além dos bytes.
Escrito a 03/11/2026, por palavra de Unum ("Eu autorizo ORA", livro 1324). Lê-se de cima para baixo. Cada passo diz o que prova e o que não prova.

## 0. O que esta consulta pode concluir

| Pode concluir | Não pode concluir |
|---|---|
| Que o pacote que tens é byte a byte o que o manifesto descreve. | Que o conteúdo seja verdadeiro. |
| Que a raiz dos ficheiros é a que uma camada de ancoragem selou. | Autoria, valor, procura ou receita. |
| Que, com prova de bloco, estes bytes existiam antes de um bloco do Bitcoin. | Que o organismo dure, ou que alguém pague. |
| Que uma camada está **pendente** (ainda sem bloco) ou **confirmada**. | Que uma camada pendente esteja ancorada. |

Honestidade aqui é propriedade técnica: o que se confere diz-se conferido; o que não se confere diz-se não conferido. Um registo falso ancorado continua falso, mas já não se reescreve sem se ver.

## 1. Obter o pacote

Precisas de três ficheiros do repositório (`fomosdeimos-gif/orum-ora-x402`) e do verificador:

- `espelho-maquinas/orum-maquinas-v1.tar`
- `espelho-maquinas/manifesto.json`
- `kit/espelho-maquinas.mjs` (só Node 18+, sem pacotes, sem rede)

Podes obtê-los de qualquer cópia (disco, USB, IPFS, outro repositório). Se a cópia for alterada, o passo seguinte falha.

## 2. Passo A: o tar é o do manifesto (sem código nosso)

```
sha256sum orum-maquinas-v1.tar
```

O valor tem de ser igual ao campo `tar.sha256` de `manifesto.json`. Prova: nenhum byte do tar mudou desde que o manifesto foi escrito. Não prova que o manifesto seja o que foi ancorado: isso é o passo D.

## 3. Passo B: cada ficheiro é o que o manifesto diz

```
node kit/espelho-maquinas.mjs espelho-maquinas/manifesto.json espelho-maquinas/orum-maquinas-v1.tar
```

Imprime `OK espelho de máquinas: <n> ficheiros conferidos; raiz <hash>` ou `FALHA: <razão>`. Falha se faltar um ficheiro, sobrar um, um sha256 ou um tamanho não bater, a raiz não bater, ou um ficheiro for de uma lista proibida (segredos, dados pessoais, `CLAUDE.md`). Limite: o verificador vem no mesmo pacote, por isso confia-se nele na primeira vez; o passo C não depende dele.

## 4. Passo C: refazer a raiz sem o nosso código

```
tar xf orum-maquinas-v1.tar -C pasta && cd pasta
find . -type f | sed 's|^\./||' | LC_ALL=C sort | while read f; do printf '%s\t%s\n' "$f" "$(sha256sum "$f" | cut -d' ' -f1)"; done > ../texto.txt
sha256sum ../texto.txt
```

O resultado tem de ser o `raiz_sha256` do manifesto. É uma segunda implementação, só com `tar`, `find`, `sort` e `sha256sum`. Se o passo B e o passo C discordarem, não se conclui nada e diz-se `não verificado`.

## 5. Passo D: ligar o manifesto a uma camada de ancoragem

O manifesto está listado numa camada, fora do pacote: `ancora/raiz-registos-<n>.json`, com o sha256 de `espelho-maquinas/manifesto.json`. Confere:

1. `sha256sum espelho-maquinas/manifesto.json` tem de ser igual ao `sha256` dessa linha na camada;
2. a camada (hoje, a 24: `ancora/raiz-registos-24.json`) diz `estado` e `altura_bitcoin`;
3. `node kit/raiz.mjs` refaz cada camada a partir do commit que ela indica (precisa do repositório git).

## 6. Passo E: confirmada ou pendente

A regra é uma só, e não tem excepções:

- **`confirmado_bitcoin`** com `altura_bitcoin`: só se diz ancorada se `node kit/blocos.mjs` (precisa de rede) comparar a raiz da prova com o cabeçalho real do bloco em **duas fontes independentes** (blockstream.info e mempool.space) e concordarem.
- **`pendente`**: os calendários aceitaram o compromisso mas ainda não há bloco. **Não se afirma âncora.** Diz-se "pendente" e espera-se.
- Sem rede, fica `não verificado`: o recibo diz o que diz, mas o bloco não foi conferido.

`node kit/verificar.mjs` faz o mesmo, sem rede, para a cápsula do ORO e diz `pendente` ou `confirmado no bloco <n>`.

## 7. Se uma dependência falhar

| Depende de | Se falhar | O que a substitui |
|---|---|---|
| Node 18+ | passo B indisponível | passo C (só `tar` e `sha256sum`) |
| GitHub (cópia do repositório) | não há cópia | qualquer outra cópia: o passo A e o C dizem se é a certa |
| blockstream.info / mempool.space | passo E sem rede | `não verificado`; o recibo `.ots` continua legível por quem o guardar |
| Calendários OpenTimestamps | camada pendente não avança | as outras atestações do recibo; nunca se afirma sem bloco |

## 8. O que não faz

Não pede nem aceita pagamento. Não contacta ninguém. Não promete receita, reembolso nem procura. Não faz do ORO um activo nem lastro. Não prova autoria. Não substitui ler o conteúdo.
