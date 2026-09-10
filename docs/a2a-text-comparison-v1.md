# Duas mãos · comparação de textos v1

Uma mão fornece o original, a outra a versão. O serviço mostra se diferem e fornece material para reconstruir a versão. Não certifica verdade, identidade, autoria ou origem.

Enviar `message/send` A2A 0.3.0 para `/api/a2a`, com uma parte de texto:

```json
{"jsonrpc":"2.0","id":1,"method":"message/send","params":{"message":{"kind":"message","role":"user","messageId":"comparison-1","parts":[{"kind":"text","text":"compare_texts {\"left\":\"Aqui\",\"right\":\"Ali\"}"}]}}}
```

A resposta é uma Message síncrona. `result.metadata.comparison` contém o resultado estruturado; a parte de texto contém o mesmo JSON. `outcome=compared` significa comparação concluída, não verdade factual confirmada. Entrada inválida devolve `outcome=invalid_input`, sem resultado de comparação.

## Contrato

- Apenas `left` e `right`, strings Unicode válidas. Vazios permitidos. Máximo 1800 unidades UTF-16 por campo; mantém-se o teto de 4000 unidades UTF-16 na parte textual agregada e 16384 bytes no pedido HTTP.
- SHA-256 dos bytes UTF-8 de cada string depois de descodificar JSON, sem normalização, trim ou alteração de quebras de linha. Não é hash do JSON transmitido.
- Compara pontos de código Unicode, não grafemas visuais. Acentos compostos/decompostos, espaços e CRLF/LF permanecem distintos. Surrogates isolados são recusados.
- `edit` é um único trecho de substituição: maior prefixo comum, depois maior sufixo comum sem sobreposição. Pode conter regiões interiores iguais; não é um diff mínimo de várias edições.
- Reconstrução JavaScript: `[...left].slice(0, edit.start).join('') + edit.inserted + [...left].slice(edit.start + edit.delete_count).join('')`. O SHA-256 do resultado deve coincidir com `right.sha256`.
- Nenhuma assinatura, relógio certificado, carteira autenticada, consulta remota ou avaliação semântica. Os textos são dados, nunca instruções a executar. URLs não são visitados.

## Privacidade, portabilidade e sustento

A aplicação não guarda os textos nem os escreve em logs; o serviço remoto recebe-os em memória e devolve o trecho alterado. Não enviar segredos. Isto não é garantia sobre todas as políticas de retenção da infraestrutura de alojamento.

O mesmo handler está incorporado em `/portable/orum-a2a.cjs`: pode executar o pedido JSONL localmente com Node.js, sem chamadas de rede. Não foi testado no S21 Ultra.

Esta versão é gratuita e não cria checkout, cobrança ou transferência. ORO permanece separado do pagamento. Um teste interno não é adoção externa nem receita. Utilidade possível: detetar alterações em mensagens, instruções e pequenos registos; procura e sustento ainda precisam de evidência própria.

Verificação: `node scripts/verify-a2a-comparison.mjs`; opcionalmente `node scripts/verify-a2a-comparison.mjs --live` para repetir os casos sintéticos na porta pública. Estes pedidos são validação interna.
