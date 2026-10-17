# Guia de operação

Como usar o dia a dia: backups, PIN, acesso pela rede, iniciar com o computador e problemas
comuns. Os comandos são os do `package.json` e funcionam na pasta do projeto. "Pasta de dados"
é `~/ControleFinanceiro/dados` por padrão, ou o que estiver em `DADOS_DIR` no `.env`.

## Backups

**Automático.** Liga por padrão. Uma vez por dia o site cria um backup da pasta
`backups/` (quando sobe e, enquanto estiver aberto, a cada hora confere se o de hoje já existe).
Para desligar, ou mudar quantos guardar, vá em **Backups** (`/backups`), seção "Backup
automático". Guarda os **últimos 30** por padrão (de 1 a 365). Ao passar disso, apaga só os
automáticos mais antigos.

**Manual.** Botão "Fazer backup agora" em `/backups` ou em `/sistema`, ou `pnpm backup` no
terminal. Pode ser feito com o site aberto.

**Tipos de arquivo** (em `backups/`, com o nome que aparece na lista):

| Nome                                     | Tipo                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| `financas-auto-AAAA-MM-DD-HHMMSS.db`     | Automático. É o único tipo que a rotação apaga.                                   |
| `financas-AAAA-MM-DD-HHMMSS.db`          | Manual. Inclui os feitos antes de uma migration. Nunca são apagados sozinhos.     |
| `financas-antes-de-restaurar-AAAA-...db` | Cópia do banco que estava em uso antes de uma restauração. Nunca apagada sozinha. |

Os backups são bancos SQLite completos. Vale **copiar a pasta `backups/` de vez em quando para
outro disco ou nuvem**: se o computador for perdido, a pasta do computador vai junto.

### Restaurar pelo site

1. Em **Backups**, clique em **Restaurar** no backup desejado. A página confere o arquivo antes;
   um backup que não passa na conferência não é restaurado.
2. Marque a caixa de confirmação e digite `restaurar`.
3. O site troca o banco e guarda o anterior como "Antes de restaurar" (ele aparece na lista).

Funciona com o site aberto.

### Restaurar pelo terminal

Use se o site não abre ou se o banco está com defeito.

1. Pare o site (`Ctrl+C` no terminal onde ele roda).
2. `pnpm restaurar` lista os backups com data, tamanho e tipo.
3. `pnpm restaurar financas-auto-AAAA-MM-DD-HHMMSS.db` (use o nome exato), e digite `restaurar`
   quando pedir.
4. `pnpm start`. Migrations pendentes, se houver, são aplicadas sozinhas.

### Se o banco estiver com defeito

- O site verifica a integridade ao iniciar. Se achar problema, aparece um aviso no topo de todas
  as telas. Também dá para rodar a verificação em **Backups**, botão "Verificar" (seção
  "Integridade").
- Não espere para agir. O backup automático copia o que está no banco no dia, e os antigos são
  apagados conforme a rotação.
- Pare o site, faça uma cópia da pasta de dados inteira (para não perder nada) e restaure o
  backup mais recente que passa na verificação, como acima (`pnpm restaurar <nome>`).
- Se o banco atual não abrir, o restaurar guarda os arquivos dele com o nome
  `...-corrompido` na pasta `backups/` antes de trocar.

## PIN

O PIN é opcional. Sem ele, quem abrir o endereço do site neste computador entra direto.

- **Definir**: **Configurações** (`/configuracoes`), seção Segurança, "Definir PIN". De 4 a 12
  números, digitados duas vezes.
- **Alterar**: informe o PIN atual e o novo. Trocar o PIN encerra as sessões de outros navegadores
  e aparelhos; esta aba continua conectada.
- **Remover**: informe o PIN atual. O site volta a abrir sem pedir senha.
- **Entrar**: a tela `/pin` pede o PIN. "Manter conectado por 30 dias" deixa a sessão aberta por
  30 dias; sem marcar, ela dura 12 horas. O link **Sair** (rodapé) encerra a sessão.
- **Tentativas erradas**: 5 erros seguidos bloqueiam por 30 segundos. Cada novo bloqueio dobra o
  tempo, até 15 minutos. Um acerto zera a contagem. A contagem fica na memória do site, então
  reiniciar o site também zera.

### Esqueci o PIN

Não há recuperação pela tela: sem o PIN atual, o site não deixa trocar nem remover. O único jeito
é tirar o PIN do banco. Isso **não apaga nenhum dado**. Procedimento:

1. Pare o site (`Ctrl+C`).
2. Faça um backup por precaução: `pnpm backup`.
3. Remova o registro do PIN da tabela `config`. Use a pasta de dados que você está usando (por
   padrão `~/ControleFinanceiro/dados`). Em qualquer sistema, a partir da pasta do projeto:

   ```sh
   node --input-type=module -e "import Database from 'better-sqlite3'; const d = new Database(process.argv[1]); d.prepare(\"DELETE FROM config WHERE chave = 'pin'\").run(); d.close();" "/caminho/da/pasta/dados/financas.db"
   ```

   No macOS ou Linux, com o `sqlite3` instalado, também funciona:
   `sqlite3 "/caminho/da/pasta/dados/financas.db" "DELETE FROM config WHERE chave = 'pin';"`

4. Inicie de novo com `pnpm start`. O site abre sem PIN. Defina um novo em Configurações.

Não apague o arquivo `financas.db` para isso: ele tem todos os seus dados. Se preferir, pode
restaurar um backup feito **antes** de o PIN ser definido, mas o que foi lançado depois dele se
perde.

## Acesso pela rede (desligado por padrão)

Permite abrir o site de outro aparelho da mesma rede (celular, tablet). Só ligue se souber o
que isto significa:

- **Defina um PIN antes.** Com o acesso ligado e sem PIN, o site recusa pedidos de outros
  aparelhos (403) até você definir o PIN, em `http://127.0.0.1:5173/configuracoes`.
- **Ligar**: no arquivo `.env` da pasta do projeto, escreva `ACESSO_REDE=1` e reinicie o site.
  Ao iniciar, o terminal mostra "Na rede local: http://<IP>:5173".
- **Desligar**: apague a linha `ACESSO_REDE=1` do `.env` (ou troque para `ACESSO_REDE=0`) e
  reinicie. A tela **Configurações** mostra se está ligado.
- **O que o site aceita** com o acesso ligado: endereços da rede privada (10.x, 172.16 a 172.31,
  192.168.x, 169.254.x), nomes terminados em `.local` (ex.: `meu-mac.local`) e nomes de uma
  palavra só. Nomes de sites da internet continuam recusados.
- **Riscos**: o site fala HTTP puro, sem criptografia. O PIN e os dados passam pela rede sem
  cifra. Use só em Wi-Fi de casa de que você confia, nunca em rede pública. Se o sistema pedir
  permissão de firewall ao iniciar, permita só em redes privadas.

## Iniciar com o computador

Faz o site subir sozinho quando você entra no computador. Antes, rode `pnpm start` ou
`pnpm build` pelo menos uma vez, porque o serviço usa a pasta `build/`.

```sh
pnpm iniciar-com-o-computador --simular   # mostra o que seria criado, sem criar nada
pnpm iniciar-com-o-computador             # cria e pergunta se ativa agora (s/N)
pnpm iniciar-com-o-computador --atalho    # o mesmo, mais um atalho na área de trabalho
```

Por sistema:

- **macOS**: um LaunchAgent em `~/Library/LaunchAgents/com.controlefinanceiro.site.plist`. Logs
  em `~/Library/Logs/ControleFinanceiro/` (`saida.log` e `erro.log`).
- **Windows**: um script `controle-financeiro.vbs` na pasta Startup do usuário. Ele sobe o site
  sem janela.
- **Linux**: um serviço de usuário do systemd (`~/.config/systemd/user/controle-financeiro.service`).
  Se o systemd do usuário não estiver disponível, usa uma entrada em `~/.config/autostart`, e o
  site sobe no próximo login gráfico.

Para desfazer: `pnpm parar-de-iniciar` (use `--simular` antes, se quiser ver o que será removido).
Não mexe no banco nem no código.

Ressalvas:

- O caminho do Node e o da pasta do projeto ficam gravados no serviço. Se você trocar a versão do
  Node (ex.: com nvm) ou mover a pasta, rode `pnpm parar-de-iniciar` e depois
  `pnpm iniciar-com-o-computador` de novo.
- No Windows, `pnpm parar-de-iniciar` não encerra o site que já está rodando: feche o processo do
  Node pelo Gerenciador de Tarefas ou reinicie o computador.
- Se a porta estiver ocupada, o serviço não sobe. No macOS o launchd reinicia o processo que
  falhou, então ele tenta de novo sem parar e o erro cresce em `erro.log`. Veja "Porta em uso"
  abaixo.

## Instalar como app (PWA)

No Chrome ou no Edge, abra `http://127.0.0.1:5173` e use o ícone **Instalar** da barra de
endereço (ou o menu do navegador, "Instalar Controle Financeiro"). Ele abre em janela própria.
O site precisa estar rodando para abrir. Não há modo offline: os dados são sempre lidos do
banco local.

## Atalhos de teclado

| Tecla | Ação                           |
| ----- | ------------------------------ |
| `N`   | Novo gasto                     |
| `R`   | Nova receita                   |
| `B`   | Buscar lançamentos             |
| `P`   | Ir para o painel               |
| `?`   | Mostrar a ajuda com os atalhos |
| `Esc` | Fechar a ajuda                 |

Os atalhos não funcionam enquanto você digita num campo de formulário.

## Tema

**Configurações**, seção Aparência: Automático (segue o computador), Claro ou Escuro. A escolha
fica salva só neste navegador.

## Solução de problemas

- **Porta em uso** (`listen EADDRINUSE ... 5173`): outro programa, ou outra janela do
  `pnpm start`, usa a porta. Feche o outro, ou defina `PORT=<outra>` no `.env`. Se o serviço
  automático estiver nesse estado (macOS), pare-o com `pnpm parar-de-iniciar`, resolva a porta e
  rode `pnpm iniciar-com-o-computador` de novo.
- **"Não achei o site compilado (pasta build/)"**: rode `pnpm start` (ou `pnpm build`).
- **Indicador "Banco indisponível" no topo, ou "banco bloqueado"**: feche outras janelas ou
  processos que estejam usando o banco (outra cópia do site, outro programa de SQLite). O site
  espera até 5 segundos antes de desistir. Não apague `financas.db-wal` nem `financas.db-shm`
  com o site rodando.
- **Migration pendente em `/sistema`**: reinicie o site (`pnpm start`). As migrations são
  aplicadas ao iniciar.
- **Aviso de integridade no topo**: veja "Se o banco estiver com defeito".
- **"Este site só atende em 127.0.0.1 ou localhost" (403)**: o endereço usado não é desta máquina.
  Para outros aparelhos, veja "Acesso pela rede".
- **"Precisa de Node 22.18 ou mais novo"** ou `pnpm install` recusando a versão: atualize o Node
  (LTS 22 ou mais novo).
- **Pedidos de formulário recusados** ("Envio de formulário de outra origem recusado"): o
  formulário foi enviado de outra página ou aba. Recarregue a página do próprio site.
