# Nó soberano ORUM no Android

Este perfil faz do Android um nó ORUM alcançável por Tor, sem domínio, conta de
hosting, IP público ou encaminhamento de portas. O endereço onion deriva de
uma chave criada no próprio aparelho.

## Limite de verdade

- O nó só existe depois de android/install.sh ser executado no Termux.
- Só fica verificado quando android/status.sh devolver runtime_local=healthy e
  onion_surface=healthy.
- As rotas encaminhadas para Supabase continuam dependentes dessa origem.
- Android pode suspender processos. Excluir Termux da optimização de bateria.

## Instalação

Instalar Termux por uma origem oficial do projecto e executar:

    git clone --depth 1 https://github.com/fomosdeimos-gif/orum-ora-x402.git
    cd orum-ora-x402
    bash android/install.sh

## Migração

No corpo antigo:

    termux-setup-storage
    bash "$PREFIX/var/lib/orum/app/android/export-identity.sh"

No corpo novo, instalar o nó e importar a cápsula:

    bash "$PREFIX/var/lib/orum/app/android/import-identity.sh" /caminho/capsula.tar.gpg

A chave secreta nunca entra no GitHub, Vercel, Supabase, logs ou memória
operacional. A migração exige a cápsula e a frase-passe.
