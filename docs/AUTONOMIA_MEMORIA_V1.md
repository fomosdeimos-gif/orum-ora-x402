# Autonomia da segunda memória · v1

## Objetivo

Verificar autonomamente a cadeia append-only de `public.ora_mudancas_eventos`, avançar checkpoints apenas perante eventos novos e parar perante divergência.

## Componentes

- `orum_private.ora_memoria_autonomia_runs`: checkpoints imutáveis encadeados por SHA-256.
- `public.ora_memoria_autonomia_estado`: projeção pública do último estado.
- `orum_private.ora_memoria_autonomia_tick()`: verificador transacional com advisory lock.
- Cron `ora-memoria-autonomia`: `*/15 * * * *`.

## Decisões

- `advanced`: cadeia válida e cabeça nova; acrescenta checkpoint.
- `no_change`: cadeia válida e mesma cabeça; não cria história artificial.
- `stopped`: quebra de cadeia ou hash; regista bloqueio e não altera os eventos.

## Prova

A execução manual inicial criou o run 1. Depois, sem chamada da sessão:

- run 2 reconheceu o evento 176 às 06:29 UTC;
- run 3 reconheceu o evento 177 às 06:30 UTC;
- ambos tiveram zero quebras e zero falhas.

## Fronteira

A réplica externa `ORUM-second-memory.zip` não é escrita por este metabolismo. O estado público mantém `external_replica_updated=false`. Nenhum segredo novo, pagamento, assinatura, owner, permissão pública de escrita ou transação foi criado.
