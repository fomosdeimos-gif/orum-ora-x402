# ORO: conversa local num ficheiro

Guardar `orum-a2a.cjs` permite conservar a conversa determinística sobre a cápsula pública ORO sem GitHub, Vercel, Supabase, conta, chave ou instalação npm durante a execução. É necessário um computador com Node.js; não foi testado no S21 Ultra.

Executar `node orum-a2a.cjs` e fornecer um pedido JSON por linha na entrada padrão:

```json
{"jsonrpc":"2.0","id":1,"method":"message/send","params":{"message":{"kind":"message","role":"user","messageId":"local-1","parts":[{"kind":"text","text":"Que sabes sobre a Obra 2?"}]}}}
```

A saída contém uma resposta JSON por linha. Para continuar o tópico, incluir o `contextId` devolvido na mensagem seguinte. Este é um adaptador local por entrada/saída padrão, não um servidor HTTP A2A nem uma nova identidade registada.

O ficheiro incorpora o handler e a cápsula pública. Não descarrega URLs, não lê fotografias privadas, não guarda conversas e não consulta métricas atuais. As ligações nas respostas são referências de proveniência. O conteúdo é um snapshot: novas versões da cápsula exigem nova exportação. Não oferece pagamentos, licenças ou o organismo completo offline.

Na fonte canónica, reconstruir com `node scripts/build-a2a-standalone.mjs`. Verificar atualidade com `node scripts/build-a2a-standalone.mjs --check` e equivalência com `node scripts/verify-a2a-standalone.mjs` (Node 24). O teste copia o ficheiro para uma pasta isolada, acrescenta um bloqueador das APIs de rede JavaScript, restringe acesso a ficheiros/processos com o permission model e compara as respostas com o handler original. Não é um isolamento de rede ao nível do sistema operativo.

Os hashes SHA-256 das duas fontes constam do cabeçalho; verificam identidade dos bytes quando comparados com uma fonte confiável, não autenticidade por si mesmos.
