# Controle Financeiro (site local)

Seu controle financeiro rodando no seu computador, com banco de dados local (SQLite).
Nada vai para a internet: o site só escuta em `127.0.0.1`, ou seja, só a sua máquina enxerga.

Estado atual: **Onda 1 do plano (Núcleo)**. Painel do mês, gastos à vista, contas com
histórico de saldo, categorias, lixeira e o importador dos dados do app atual. Cartões e bitcoin
chegam nas próximas ondas (veja `docs/PLANO-SITE-LOCAL.md` e `docs/CHANGELOG.md`).

## Requisitos

- **Node.js 22** (22.18 ou mais novo). Baixe em <https://nodejs.org> (versão LTS 22).
- **pnpm**, que já vem com o Node via Corepack. Ative uma vez:

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

Compila o site e abre o servidor em **<http://127.0.0.1:5173>**. Abra esse endereço no navegador.
Para parar, `Ctrl+C` no terminal. `http://localhost:5173` também funciona. Pedidos que não
sejam desta máquina são recusados, mesmo vindos de um site que tente se passar por ela.

Na primeira vez, a pasta de dados e o banco são criados sozinhos. Sempre que uma versão nova
trouxer mudança no banco, a mudança é aplicada sozinha ao iniciar, com um backup antes.

| Comando            | O que faz                                                               |
| ------------------ | ----------------------------------------------------------------------- |
| `pnpm start`       | Compila e sobe o site em http://127.0.0.1:5173 (uso normal).            |
| `pnpm preview`     | Sobe o site já compilado, sem compilar de novo.                         |
| `pnpm dev`         | Modo desenvolvimento (recarrega ao salvar), também em 127.0.0.1:5173.   |
| `pnpm build`       | Só compila (gera a pasta `build/`).                                     |
| `pnpm backup`      | Faz um backup do banco agora.                                           |
| `pnpm importar`    | Traz os dados do app atual (veja "Trazer os dados do app atual").       |
| `pnpm test`        | Testes de regras e de banco (Vitest).                                   |
| `pnpm test:e2e`    | Testes no navegador (Playwright).                                       |
| `pnpm check`       | Checagem de tipos (svelte-check).                                       |
| `pnpm lint`        | Formatação (Prettier) e regras de código (ESLint).                      |
| `pnpm format`      | Formata todos os arquivos.                                              |
| `pnpm db:generate` | Gera uma migration nova depois de mudar `src/lib/server/db/esquema.ts`. |
| `pnpm verificar`   | check + lint + test + test:e2e, tudo de uma vez.                        |

Para usar outra porta: `PORT=5180` no arquivo `.env`.

O build sai com um aviso `Generated an empty chunk: "chunks/env.js"`; é do `adapter-node` e
pode ser ignorado. O site compilado também pode ser iniciado com `node build` de qualquer pasta
(as migrations são achadas a partir da pasta do projeto); nesse caso defina `HOST=127.0.0.1` e
`PORT=5173` você mesmo, que é o que o `pnpm start` faz.

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
entrou e confere saldo, gastos por mês, faturas e sats com as regras do app atual; se algo não
bater, nada é gravado e aparece a lista de diferenças (`--aceitar-diferencas` grava mesmo
assim). Situações comuns (cartão apagado no app, datas com hora, limite já definido no site)
entram com um aviso no relatório. **O arquivo exportado tem os seus dados: não o coloque na
pasta do projeto nem no git.**

## Onde ficam os dados

Fora da pasta do código, para que apagar ou atualizar o código nunca toque nos seus dados:

| Sistema | Pasta padrão                                |
| ------- | ------------------------------------------- |
| Windows | `C:\Users\<você>\ControleFinanceiro\dados\` |
| macOS   | `/Users/<você>/ControleFinanceiro/dados/`   |
| Linux   | `/home/<você>/ControleFinanceiro/dados/`    |

Lá dentro:

- `financas.db` é o banco (com os arquivos auxiliares `financas.db-wal` e `financas.db-shm`
  enquanto o site está aberto; não apague esses dois com o site rodando);
- `backups/` guarda as cópias.

Para mudar o lugar, copie `.env.example` para `.env` e defina `DADOS_DIR`, por exemplo
`DADOS_DIR=~/Documentos/financas`. A página `/sistema` mostra o caminho em uso.

## Backup

- **Sob demanda**: `pnpm backup` ou o botão "Fazer backup agora" em `/sistema` (link "Estado
  do sistema e backup" no rodapé). Pode ser
  feito com o site aberto.
- **Automático**: antes de aplicar qualquer migration nova num banco que já existe.

Cada backup é um arquivo `financas-AAAA-MM-DD-HHMMSS.db` em `dados/backups/`, um banco SQLite
completo e consistente (gerado com `VACUUM INTO`, seguro mesmo com o banco em uso).
**Para restaurar**: pare o site, apague `financas.db`, `financas.db-wal` e `financas.db-shm`,
copie o backup desejado para `dados/financas.db` e inicie de novo. (Uma tela de restaurar
chega na Onda 5.) Vale guardar de vez em quando uma cópia da pasta `backups/` fora do computador.

## Testes

```sh
pnpm test        # regras (dinheiro, datas, parcelas, fatura, resumo do mês), serviços com banco
                 # em memória, importador, esquema, migrations e backup
pnpm test:e2e    # abre o site num navegador de verdade: lançar gasto e ver no painel, contas,
                 # categorias, lixeira, limite, sem JavaScript e no celular
```

Os testes **nunca** usam a sua pasta de dados real: os de banco usam memória ou pastas
temporárias, e o e2e sobe o site numa porta separada (4173) com uma pasta temporária.

O `test:e2e` precisa do Chromium do Playwright. Na primeira vez:

```sh
pnpm exec playwright install chromium
```

Se você já tem um Chromium/Chrome e prefere usá-lo, aponte `PW_CHROMIUM_PATH` para o executável.

## Organização do código

```
src/lib/dominio/      regras puras (dinheiro, datas…), sem banco nem tela
src/lib/server/db/    conexão, esquema Drizzle, migrations, backup
src/lib/server/repos/ consultas por entidade
src/lib/server/servicos/ casos de uso (contas, categorias, gastos, limite, painel)
src/lib/server/importacao/ importador do app atual
src/lib/validacao/    esquemas Zod compartilhados
src/lib/ui/           estilos (tokens da v3) e componentes
src/routes/           páginas
drizzle/              migrations SQL versionadas (nunca edite uma que já existe)
scripts/              iniciar, backup, importar
tests/unit, tests/e2e testes
docs/                 plano e changelog
```

Regras da casa: dinheiro sempre em centavos inteiros (bitcoin em sats inteiros), nunca ponto
flutuante; mudança de esquema sempre por migration nova; o pre-commit roda Prettier, ESLint e
svelte-check.
