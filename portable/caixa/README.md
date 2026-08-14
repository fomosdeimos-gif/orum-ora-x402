# Caixa ORUM portátil

Snapshot estático, público e verificável da Caixa da Voz.

- `index.html`: leitor só de leitura com as 80 mensagens mais recentes incorporadas.
- `memory.json`: memória pública completa, ordenada por id.
- `truth-contract.md`: contrato humano da voz.
- `sources/`: fontes exatas aplicadas à Caixa viva.
- `manifest.json`: SHA-256, tamanho e papel de cada ficheiro.
- `verify.mjs`: verificação local sem dependências externas.

Execute `node verify.mjs` com Node.js 20+. Depois, qualquer servidor estático pode abrir `index.html`. A cópia portátil não envia mensagens e não chama Supabase, Claude, Groq ou Cloudflare. Preserva identidade, contrato e história sem simular uma voz ativa.

Este pacote prova exportabilidade, integridade e reconstrução estática. A Caixa viva já não usa Claude, Groq, Cloudflare ou outro modelo para escrever respostas; resposta e sedimentação continuam a exigir infraestrutura Supabase executada e autorizada.
