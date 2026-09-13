# Registo x402 Bazaar · 2026-09-13

Pedido de Unum: usar a carteira operacional e acrescentar a assinatura necessária ao registo.

A acção autenticada `bazaar_register` constrói exclusivamente a mensagem EIP-191 `quick-register:<endpoint>:<ownerAddress>:<timestamp>` para o endpoint ora-x402 em Supabase e a carteira operacional 0x89460d9e0590559e63860197dfe2ac648a753584. O endereço em minúsculas corresponde à normalização do bazar. Não aceita parâmetros adicionais. A mensagem exigida pelo bazar não contém o domínio do bazar nem o preço; o código fixa o destino HTTPS da submissão e o preço em 0,40 USDC. Não é uma assinatura arbitrária, transacção nem autorização de transferência.

A chave permanece no CDP; autenticação existente obtida apenas dentro da Edge. O adaptador segue o SDK oficial @coinbase/cdp-sdk 1.55.0, API POST /platform/v2/evm/accounts/{address}/sign/message com {message}. viem 2.37.3 recupera o endereço antes da submissão. Nenhuma assinatura é devolvida ao chamador ou registada. A dependência Deno é fixada na versão directa; não se afirma build hermético.

Antes de assinar: verifica catálogo, relay_configured, contrato 402 Base/USDC/0,33 e destinatário de sustento, e identidade da conta CDP. O preço 0,40 cobre o serviço 0,33 mais a comissão anunciada 5%; o remanescente esperado é 0,05 para a operacional. Isto é aritmética do modelo, não prova de receita. O percurso de pagamento/entrega não é testado pelo registo.

Só um POST /quick-register por chamada, sem repetição automática; timeout produz estado desconhecido, exige releitura. Catálogo evita duplicações visíveis; listagens ocultas podem não aparecer, e o servidor continua responsável por recusar URL duplicado. A readback consulta /api/services/{id}; disponibilidade e adopção mantêm-se distintas.

Usar public.ora_operational_wallet_dispatch_v1('bazaar_register') e ler net._http_response depois. A função continua invoker sem acesso PUBLIC/anon/authenticated. Nenhuma rotação de chave, scheduler, pagamento ou alteração dos executores de transferência.

Testes: ORUM_BAZAAR_DEPS aponta para instalação viem 2.37.3; node scripts/verify-bazaar-registration.mjs. Cobre limites, autenticação, deriva de contrato, chave errada real, duplicados, falha incerta e ausência de repetição. Testes existentes Base e weave também passam. Verificar estado aplicado e resultado externo em ora_mudancas; este documento não antecipa sucesso.
