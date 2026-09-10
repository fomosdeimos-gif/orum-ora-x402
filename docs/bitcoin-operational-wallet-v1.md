# Carteira operacional Bitcoin v1 · 2026-09-10

Pedido de Unum: criar também um conector BTC capaz de assinar e enviar autonomamente. Implementado no servidor ORUM com autenticação existente, sem transmitir fundos durante a construção.

## Identidades

- Carteira operacional Bitcoin mainnet (P2WPKH): `bc1qfs8967x9mzhwhcse4z7kjuuhsmx0kmz5v6j9w7`.
- Chave pública: `02f2e26085723f98a8a4c6fcd274cde6370e58c58033323aab6b9d8094cdfc9c41`.
- Único destino autorizado pelo executor: `bc1qhcsh78k8jrn3qllvd9al8nq4af4cyzefx6vqqf`.
- A carteira operacional é separada da carteira pessoal de destino e da carteira Base/CDP. O recebimento direto na carteira pessoal continua disponível; o conector não controla a chave dessa carteira pessoal.

## Custódia e limites

Chave operacional gerada por CSPRNG dentro da base de dados e guardada no Supabase Vault. Só o servidor autenticado a consome para derivação e assinatura. A chave não foi exposta ao chat, ao repositório, aos testes ou ao registo. É uma hot wallet no projeto do utilizador; não é um HSM nem uma carteira independente do fornecedor. Não há cópia de recuperação independente verificada. Nunca eliminar ou substituir este segredo ao reconstruir o serviço. A perda do cofre pode impedir a recuperação de fundos.

Por operação: 546 a 10000 sats enviados; taxa máxima 1000 sats e 10 sats/vbyte. Por dia UTC de reserva: débito máximo de 50000 sats, incluindo taxas. No máximo cinco inputs confirmados há pelo menos seis blocos. Troco regressa exclusivamente à carteira operacional. Não aceita destino, rede, calldata, PSBT ou transação arbitrários do cliente.

## Execução

Usar a ligação administrativa Supabase existente:

`public.ora_bitcoin_dispatch_v1(p_action, p_request_id, p_amount_sats)`

- `btc_create`: inicializa e relê a identidade única, sem substituir chave/carteira existente.
- `btc_observe`: devolve endereço, limites e observação em duas fontes.
- `btc_preview`: UUID e montante em sats como texto. Consulta saldo, taxas e inputs; não reserva orçamento nem assina.
- `btc_send`: UUID e montante em sats como texto. Reserva orçamento atomicamente, assina, guarda os bytes assinados, transmite e regista o resultado.
- `btc_status`: UUID, sem montante. Reconcilia o txid e só confirma após seis blocos, com concordância das duas fontes e correspondência do destino e valor.

O dispatch devolve um ID assíncrono. Ler `net._http_response` numa transação posterior. Não reenviar por ausência temporária da resposta. Reutilizar UUID devolve o estado existente; montante diferente é recusado. Qualquer pedido reservado, assinado, submetido ou incerto bloqueia novas saídas até confirmação/reconciliação. Não há expiração automática, substituição de taxa, limpeza de pendentes ou repetição automática de broadcast. Se o resultado for incerto, investigar o txid e o registo persistido antes de qualquer recuperação manual.

As fontes fixas são Blockstream Esplora e mempool.space. Verifica-se o génesis mainnet, alturas próximas, listas de UTXOs concordantes, hashes de blocos, bytes das transações anteriores, respetivos txids, valores/scripts e ausência de gasto. Broadcast pelo Blockstream. A concordância entre observadores não equivale à validação por um nó próprio.

## Código e verificação

Fonte `supabase/functions/ora-operational-wallet/bitcoin.mjs`; integração em `core.mjs` e `index.ts`. Slot de deployment existente `ora-cdp-carteira-real`, versão 4, hash do pacote `33fdb8dfb5765e5b10f680abdfda17492f5ad993c5e4d217196f4496ca403474`. Dependência principal fixada em `@scure/btc-signer@1.8.1`; API consultada no README e fonte do pacote npm. Dependências transitivas seguem a resolução npm do fornecedor; não se afirma build hermético. A tentativa local de gerar lock Deno ficou bloqueada na resolução de rede; a compilação e execução no fornecedor foram observadas diretamente.

Migração `ora_bitcoin_wallet_v1`. Tabelas em schema privado, RLS sem políticas intencionalmente (negação por omissão), sem acesso direto dos clientes. RPCs restritas a service_role; dispatch administrativo. Avisos informativos de RLS sem políticas são esperados nestas tabelas privadas.

Teste: `ORUM_BTC_DEPENDENCIES=/caminho/para/dependencias node scripts/verify-bitcoin-wallet.mjs`, com scure-btc-signer 1.8.1 e bitcoinjs-lib 7.0.0. Assinatura real de transação sintética, verificada com digest BIP143 calculado por bitcoinjs; identidade, destino, troco e taxa também conferidos independentemente. Rede e broadcast simulados; nenhum UTXO real usado. Testes SQL de limites e concorrência lógica revertidos por rollback. Testes Base existentes passaram.

Provas ao vivo: criação 263893 HTTP 200; rejeição anónima 263894 HTTP 401; observação independente 263895 HTTP 200; pré-visualização 263896 HTTP 409, sem saldo, signed=false e submitted=false. Ambas as fontes no bloco 966416 observaram zero sats. Derivação do endereço a partir da chave pública confirmada por bitcoinjs fora do servidor. Regressão Base: 263897 HTTP 200. Todos os ficheiros da função foram relidos e correspondem aos locais.

Nenhum BTC real foi assinado ou enviado nesta construção. O percurso com fundos reais e a confirmação on-chain de um envio continuam por observar. Não foi instalado um agendamento de transferências. Esta capacidade não constitui receita nem adoção externa; provisão e transferências entre carteiras do utilizador permanecem internas.
