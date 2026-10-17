# Controle Financeiro (site local)

Seu controle financeiro rodando no seu computador, com banco de dados local (SQLite).
Contas, receitas e gastos (à vista e no cartão, com faturas), categorias, bitcoin em sats,
relatórios, busca e exportação. Nada vai para a internet: o site só escuta em `127.0.0.1`,
ou seja, só a sua máquina enxerga (exceto se você ligar o acesso pela rede, veja
[docs/OPERACAO.md](docs/OPERACAO.md)).

O guia do dia a dia (backups, PIN, iniciar com o computador, problemas comuns) está em
[docs/OPERACAO.md](docs/OPERACAO.md). O histórico das ondas está em
[docs/CHANGELOG.md](docs/CHANGELOG.md) e o plano em [docs/PLANO-SITE-LOCAL.md](docs/PLANO-SITE-LOCAL.md).

## Requisitos

- **Node.js 22.18 ou mais novo** (o projeto usa `engines` e `.npmrc` com `engine-strict=true`,
  então `pnpm install` recusa versões antigas). Baixe em <https://nodejs.org> (LTS 22).
- **pnpm 10** (versão fixada no `package.json`). Ative uma vez com o Corepack, que vem com o Node:

  ```sh
  corepack enable
  ```

  (No Windows, rode o terminal como administrador só para esse comando.)
  Se preferir, `npm install -g pnpm` também funciona.

## Instalar

Abra um terminal na pasta do projeto (a pasta que tem este README) e rode:

```sh
pnpm install
```

Isso baixa as dependências e liga o hook de pre-commit do git.
O `better-sqlite3` usa um binário pronto para Windows, macOS e Linux; se a instalação reclamar
de compilação, instale as ferramentas de build do sistema (Windows: "Desktop development with
C++" do Visual Studio Build Tools; macOS: `xcode-select --install`; Linux: `build-essential` e
`python3`) e rode `pnpm install` de novo.

## Usar

```sh
pnpm start
```

`pnpm start` compila o site e o sobe em **<http://127.0.0.1:5173>**. Abra esse endereço no
navegador (`http://localhost:5173` também funciona). Para parar, `Ctrl+C` no terminal.

Na primeira vez, a pasta de dados, o banco e as categorias padrão são criados sozinhos.
Quando uma versão nova muda o banco, a mudança é aplicada ao iniciar, com um backup antes.

Para usar outra porta, defina `PORT` no arquivo `.env` (copie de `.env.example`).

### Seções do site

- **Painel** (`/`): patrimônio, total gasto e entradas do mês, sobra e taxa de poupança, limite
  do mês (com alerta a partir de 85%), gráfico do gasto acumulado, gastos por categoria. Navegue
  pelos meses com ‹ e ›.
- **Gastos** (`/gastos`): lançar gasto à vista ou no cartão (1 a 24 parcelas, com prévia da
  fatura de cada parcela). Editar, mandar para a lixeira.
- **Receitas** (`/receitas`) e **Receitas recorrentes** (`/receitas/recorrentes`): salário,
  bolsa e afins. A recorrente lança a receita de cada mês sozinha, como **prevista**; ela só
  entra nos totais quando você confirma com **Recebi** (pode ajustar valor e data) ou descarta
  com **Não recebi**. A confirmação pode ser desfeita.
- **Contas** (`/contas`): saldos informados por você (o saldo não muda sozinho com gastos ou
  receitas), com histórico de cada atualização.
- **Categorias** (`/categorias`): criar, renomear, trocar a cor, ordenar e arquivar. Arquivar não
  mexe nos lançamentos antigos.
- **Cartões** (`/cartoes`) e **faturas** (`/cartoes/<cartão>/faturas/<mês>`): limite, dia de
  fechamento e de vencimento, limite disponível, fatura com itens (ex.: "3/10"), marcar como paga
  e desfazer. Pagar uma fatura não altera o saldo das contas.
- **Bitcoin** (`/bitcoin`): compras e vendas em sats, posição, preço médio, ganho ou perda não
  realizado, gráfico e conversor sats ⇄ R$. O preço do dia pode ser digitado ou buscado numa API
  pública (CoinGecko); sem internet, nada quebra.
- **Relatórios** (`/relatorios`): evolução do patrimônio, gastos e receitas por mês, comparativos
  e os maiores gastos, em períodos de 3, 6, 12 ou 24 meses.
- **Busca** (`/busca`): lançamentos por texto, período, categoria, conta ou cartão e faixa de
  valor, com gastos e receitas.
- **Exportar**: CSV ou JSON, pelos links em Relatórios e Busca (até 120 meses).
- **Lixeira** (`/lixeira`): gastos, receitas, contas e cartões removidos. Nada é apagado de vez
  aqui; restaure quando quiser.
- **Backups** (`/backups`): backup automático diário, backup agora, lista, excluir e restaurar.
- **Configurações** (`/configuracoes`): PIN, tema (automático, claro ou escuro), atalhos de
  teclado e a situação do acesso pela rede.
- **Estado do sistema** (`/sistema`, link no rodapé): banco, pastas, migrations, integridade e
  "Fazer backup agora".

## Comandos

Todos rodam na pasta do projeto. Os nomes são os do `package.json`.

| Comando                         | O que faz                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm start`                    | Compila (`vite build`) e sobe o site em http://127.0.0.1:5173. Uso normal.                       |
| `pnpm preview`                  | Sobe o site já compilado, sem compilar de novo.                                                  |
| `pnpm dev`                      | Modo desenvolvimento (recarrega ao salvar), em 127.0.0.1:5173.                                   |
| `pnpm build`                    | Só compila (gera a pasta `build/`).                                                              |
| `pnpm backup`                   | Faz um backup do banco agora (pode ser com o site aberto).                                       |
| `pnpm restaurar`                | Lista os backups. `pnpm restaurar <nome.db>` restaura um (com o site parado; pede confirmação).  |
| `pnpm importar <arquivo.json>`  | Traz os dados do app atual. Use `--simular` para só ver o relatório. Veja abaixo.                |
| `pnpm iniciar-com-o-computador` | Faz o site subir sozinho ao entrar no computador. Opções: `--simular`, `--atalho`, `--porta N`.  |
| `pnpm parar-de-iniciar`         | Desfaz o item anterior (remove o serviço e o atalho). Aceita `--simular`.                        |
| `pnpm icones`                   | Regenera os ícones do app instalado (PWA). Só quando mudar `static/favicon.svg`; usa o Chromium. |
| `pnpm test`                     | Testes de regras e de banco (Vitest). `pnpm test:watch` roda em modo contínuo.                   |
| `pnpm test:e2e`                 | Testes no navegador (Playwright), com site e banco temporários.                                  |
| `pnpm check`                    | Checagem de tipos (svelte-check). `pnpm check:watch` roda em modo contínuo.                      |
| `pnpm lint`                     | Formatação (Prettier) e regras de código (ESLint).                                               |
| `pnpm format`                   | Formata todos os arquivos.                                                                       |
| `pnpm db:generate`              | Gera uma migration nova depois de mudar `src/lib/server/db/esquema.ts`.                          |
| `pnpm dados-teste`              | Gera 10 anos de dados fictícios numa pasta de teste: `pnpm dados-teste --saida <pasta>`.         |
| `pnpm desempenho`               | Mede o tempo das telas com esses dados: `pnpm desempenho --saida <pasta>` (nunca no banco real). |
| `pnpm verificar`                | `check`, `lint`, `test` e `test:e2e`, tudo de uma vez.                                           |

Detalhes que importam:

- O build sai com um aviso `Generated an empty chunk: "chunks/env.js"`; é do `adapter-node`
  e pode ser ignorado.
- `pnpm start` é o que você usa no dia a dia. Depois de atualizar o código, ele já compila de novo.
- O site compilado também pode ser iniciado com `node scripts/iniciar.ts` (usa o `build/` que já
  existe, sem compilar). Ele escuta em `127.0.0.1` por padrão.
- Os testes de banco nunca usam a sua pasta de dados: usam memória ou pastas temporárias, e o
  e2e sobe o site numa porta separada (4173, e 4174 para o servidor isolado).
- O `test:e2e` precisa do Chromium do Playwright. Na primeira vez:

  ```sh
  pnpm exec playwright install chromium
  ```

  Se você já tem Chromium/Chrome e prefere usá-lo, aponte `PW_CHROMIUM_PATH` para o executável.

## Onde ficam os dados

Fora da pasta do código, para que apagar ou atualizar o código nunca toque nos seus dados:

| Sistema | Pasta padrão                                |
| ------- | ------------------------------------------- |
| Windows | `C:\Users\<você>\ControleFinanceiro\dados\` |
| macOS   | `/Users/<você>/ControleFinanceiro/dados/`   |
| Linux   | `/home/<você>/ControleFinanceiro/dados/`    |

Lá dentro:

- `financas.db` é o banco. Enquanto o site está aberto existem também `financas.db-wal` e
  `financas.db-shm`; não apague esses dois com o site rodando.
- `backups/` guarda as cópias (ver [docs/OPERACAO.md](docs/OPERACAO.md)).

Para mudar o lugar, copie `.env.example` para `.env` e defina `DADOS_DIR`, por exemplo
`DADOS_DIR=~/Documentos/financas`. A página `/sistema` mostra o caminho em uso. O `.env` e os
arquivos `*.db` já estão no `.gitignore`.

## Atualizar o código

```sh
git pull
pnpm install
pnpm start
```

Não é preciso mexer no banco: se a versão nova trouxer migration, ela é aplicada ao iniciar,
numa transação, depois de um backup automático. Se o site estiver configurado para iniciar com o
computador, rode `pnpm iniciar-com-o-computador` de novo só se você mudou a versão do Node ou a
pasta do projeto (o caminho do Node e da pasta ficam gravados no serviço).

## Trazer os dados do app atual

1. No app atual (o Artifact), role até o rodapé e clique em **Exportar dados**. Baixe o arquivo
   (ou use **Copiar** e salve o texto num arquivo `.json`).
2. Com o arquivo em mãos, na pasta do projeto:

   ```sh
   pnpm importar ~/Downloads/controle-financeiro-AAAA-MM-DD.json --simular   # só mostra o relatório
   pnpm importar ~/Downloads/controle-financeiro-AAAA-MM-DD.json             # grava
   ```

O importador faz um backup antes, grava tudo numa transação (ou entra tudo, ou nada) e só roda
num banco sem contas, gastos, cartões e bitcoin, para nunca duplicar. No fim ele mostra o que
entrou e confere saldo, gastos por mês, faturas e sats com as regras do app atual. Se algo não
bater, nada é gravado e aparece a lista de diferenças (`--aceitar-diferencas` grava mesmo
assim; o código de saída é 3 quando há diferenças). Situações comuns (cartão apagado no app,
datas com hora, limite já definido no site) entram com um aviso no relatório.
**O arquivo exportado tem os seus dados: não o coloque na pasta do projeto nem no git** (o
`.gitignore` já ignora `controle-financeiro-*.json`, mas não confie só nele).

## Testes

```sh
pnpm test        # regras, serviços com banco em memória, importador, esquema, migrations e backup
pnpm test:e2e   # navegador de verdade: lançar, painel, lixeira, PIN, backups, celular, etc.
```

## Organização do código

```
src/lib/dominio/          regras puras (dinheiro, datas, parcelas, fatura, relatórios), sem banco nem tela
src/lib/server/db/        conexão, esquema Drizzle, migrations, backup
src/lib/server/servicos/  casos de uso (gastos, receitas, cartões, backups, PIN, integridade…)
src/lib/server/inicio/    iniciar com o computador (macOS, Windows, Linux)
src/lib/server/importacao/ importador do app atual
src/lib/server/seguranca.ts e sessaoPin.ts  acesso local, PIN e cookies
src/lib/validacao/        esquemas Zod compartilhados
src/lib/ui/               estilos (tokens) e componentes
src/routes/               páginas
drizzle/                  migrations SQL versionadas (nunca edite uma que já existe)
scripts/                  iniciar, backup, restaurar, importar, iniciar/parar com o computador, ícones
tests/unit, tests/e2e, tests/e2e-isolado   testes
docs/                     guia de operação, changelog e plano
```

Regras da casa: dinheiro sempre em centavos inteiros (bitcoin em sats inteiros), nunca ponto
flutuante; mudança de esquema sempre por migration nova; o pre-commit roda Prettier, ESLint e
svelte-check.
