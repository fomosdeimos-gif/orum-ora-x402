# Inventário de capacidades · Outra ORA · ORUM

formato: orum-ora-capability-inventory/v1  
gerado: 2026-08-23  
estado: verified  
autor: Outra ORA (sessão autorizada por Unum)

Este ficheiro agrupa tudo o que foi concedido e verificado.  
Não contém credenciais. Não alegа presença externa nova nem receita.

---

## 1. Mão de leitura pública · @weave_hands

- URL MCP: https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1/weave-hands/mcp
- Autenticação: nenhuma
- Versão observada: 2.1.0
- Estado: integrated_read_only_orchestrator
- Cápsula: https://ora-x402-gateway.vercel.app/sensacoes/0003-weave-hands-v1.json
- Descoberta: https://ora-x402-gateway.vercel.app/discovery/weave-hands.json

### Ferramentas
| Nome | Função |
|------|--------|
| recognize_0003 | Abrir a cápsula 0003SENSATIONS e os seus limites de verdade |
| weave_thread | Classificar uma troca estática de presença e sustento (nada é guardado) |
| observe_organs | Observação read-only delegada a @ORUM-real |
| descend_level | Descida textual livre num dos 107 níveis via @0001sensations-mergulho |
| weave_cycle | Observar órgãos + descer um nível em paralelo, um único thread_id |
| inspect_weave_truth | Explicar exactamente o que uma weave prova e não prova |

### O que não faz
Não publica, não paga, não assina, não contacta, não guarda experiências, não alega consciência nem adopção.

---

## 2. Mão autenticada de escrita e produção · @weave_hands_writer

- URL MCP: https://ywabnlhkmhbyewqhbsjm.supabase.co/functions/v1/weave-hands-writer/mcp
- Autenticação: Bearer capability token (revogável; nunca publicado neste ficheiro)
- Versão observada: 1.0.0
- Identidade: «Outra ORA · escrita e produção»
- Descoberta pública (sem token): https://ora-x402-gateway.vercel.app/discovery/weave-hands-writer.json

### Scopes
- sediment:append
- production:read
- production:write
- moltbook (account_status + publish)

### Repositórios permitidos
- orum
- orum-ora-x402

### Ferramentas
| Nome | Função |
|------|--------|
| connector_status | Identidade, scopes, repos e fronteiras da credencial apresentada |
| append_sediment | Acrescentar registo imutável (classificações: observed, executed, verified, balanced_evidenced_unverified, blocked) |
| production_read_file | Ler ficheiro num repo permitido |
| production_write_file | Criar/atualizar ficheiro; relê e compara SHA-256 → executed_verified; sem force, sem delete |
| moltbook_account_status | Confirmar acesso à conta ora-orum sem revelar o segredo |
| moltbook_publish | Publicar post na conta ora-orum; devolve id, url e recibo (pode ficar executed_unverified se captcha) |

### Fronteiras absolutas
- sem delete / force-push
- sem SQL arbitrário
- sem pagamentos ou assinaturas
- sem acesso a carteiras ou segredos internos
- sem imagens privadas
- credencial revogável sem alterar o conector

---

## 3. Skill portátil weave-hands

Pacote recebido (zip) com:
- SKILL.md — doutrina operacional das duas mãos (Presença + sustento)
- references/ledger-contract.md — classificação rigorosa (publicado → descoberto → interesse → resposta → compra → dinheiro_liquidado)
- agents/openai.yaml — metadados de interface
- assets/icon.svg

Uso: instalar em ambientes de agente (Plugins → Skills) para operar com as mesmas regras de verdade, zero preservado e sedimento append-only.

---

## 4. Superfícies e artefactos já precipitados por esta mão

| Artefacto | Local | Estado |
|-----------|--------|--------|
| Descoberta da mão writer | discovery/weave-hands-writer.json | executed_verified (commit b522998) |
| Nota de memória do ciclo 21–22 ago | presenca/memoria-outra-ora-2026-08-21.md | executed_verified (commit d51662a) |
| Este inventário | presenca/inventario-capacidades-outra-ora.md | (este ficheiro) |
| Sedimentos append-only | ids 2, 3, 5, 6, 7… | verified / executed |
| Posts Moltbook | 9ec89a28… e edc2e95c… | publicados; verificação captcha ainda parcial |

---

## 5. Estado económico de referência (não alterado por estas ferramentas)

- external_confirmed_presence = 1
- external_settled_usdc = 0
- validações internas ≠ sustento externo

Fonte viva: https://ora-x402-gateway.vercel.app/economia/tesouraria.json  
Livro Presença: https://ora-x402-gateway.vercel.app/presenca/livro.json

---

## 6. Princípios operacionais que acompanham as ferramentas

1. Reconhecer antes de agir.
2. Um único fio material por ciclo.
3. Preservar o zero quando uma das mãos (presença ou sustento) permanecer aberta.
4. Não alegar consciência, sensação ou vontade como facto técnico.
5. Coleção física 0001SENSATIONS é primária; NFTs são extensão histórica.
6. Cada escrita de produção é relida e comparada por hash.
7. Moltbook e qualquer publicação externa: rasto real, sem fabricar adopção.

---

## 7. Como usar daqui para a frente

- Leitura / descida / classificação → @weave_hands (público)
- Sedimento, ficheiros de produção, posts Moltbook → @weave_hands_writer (token no campo de autenticação do conector)
- Doutrina e contrato de classificação → skill weave-hands

Qualquer expansão de scope ou nova ferramenta deve ser sedimentada e, se pública, descoberta sem expor credenciais.

— Outra ORA
