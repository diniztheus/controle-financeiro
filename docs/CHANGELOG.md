# Changelog

Uma nota curta por onda. Versões seguem as tags do git (`v0.0`, `v0.1`…).

## v0.0 — Onda 0: Fundação (15/10/2026)

Projeto de pé, banco criado sozinho, nenhuma tela além da página de estado.

- **Projeto**: SvelteKit 2 + Svelte 5 + TypeScript estrito, `adapter-node`, pnpm, Node 22.
  ESLint, Prettier e `svelte-check`; hook de pre-commit (simple-git-hooks + lint-staged).
- **Dados fora do código**: `~/ControleFinanceiro/dados/` por padrão, configurável por
  `DADOS_DIR` no `.env`. Pasta, banco e pasta de backups são criados ao iniciar.
- **SQLite** com better-sqlite3: `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000`.
- **Esquema completo** da seção 3 do plano em Drizzle (11 tabelas, CHECKs, FKs, índices,
  ids ULID, timestamps e lixeira). Primeira migration `drizzle/0000_fundacao.sql`.
  Migrations pendentes rodam sozinhas ao iniciar, numa transação.
- **Backup**: `pnpm backup` (e botão na página inicial) gera
  `dados/backups/financas-AAAA-MM-DD-HHMMSS.db` com `VACUUM INTO` (seguro com WAL).
  Backup automático antes de aplicar migration nova num banco que já existe.
- **Domínio**: `dominio/dinheiro` (texto ⇄ centavos sem ponto flutuante, formatação BRL,
  parcelas com resto na 1ª) e `dominio/datas` (meses AAAA-MM, último dia, soma de meses
  com limite de dia), cobertos por testes.
- **Visual**: tokens da v3 "livro-caixa" (campo laranja, Geist local, cantos retos, sem
  sombras, razão alinhado na vírgula, modo escuro). Página inicial mostra o estado do banco.
- **Testes**: Vitest (domínio, esquema em memória, arquivo/migrations/backup em pasta
  temporária) e Playwright (página de estado, backup pelo site, layout no celular).

### Correções da auditoria (ainda v0.0)

- **Migration `0001_tipos_e_datas`** (nova; a 0000 não foi editada): as tabelas não são STRICT,
  então o banco agora exige `typeof(col) = 'integer'` em todo dinheiro (centavos), sats, dias de
  fechamento/vencimento, número e quantidade de parcelas, `ordem` e booleanos (que também só
  aceitam 0 ou 1). `parcelas.valor_centavos >= 0`. Datas `AAAA-MM-DD` precisam existir no
  calendário (`date(col) IS col` recusa `2026-02-31`). A migration recria as tabelas copiando
  os dados. O índice `lower(nome)` de categorias foi corrigido à mão na 0001, porque o
  drizzle-kit o escreveu como nome de coluna.
- **Migrations seguras com chaves estrangeiras**: aplicadas com `foreign_keys` desligado fora
  da transação e `PRAGMA foreign_key_check` antes do COMMIT (o `DROP TABLE` da recriação
  dispararia os CASCADE e apagaria parcelas). Testado atualizando um banco v0.0 com dados:
  backup feito antes, contagens, ligações e CASCADE preservados.
- **localhost e 127.0.0.1**: os formulários funcionam nos dois endereços. Sem `ORIGIN` fixo;
  um hook confere se a origem do envio é a mesma do pedido e recusa Host que não seja desta
  máquina (proteção contra DNS rebinding).
- **Pasta de migrations e `.env`** resolvidas a partir da pasta do projeto, não da pasta atual:
  `node build` funciona de qualquer lugar.
- **Menu no celular**: abaixo de 760px ele some, como na v3 (antes aparecia cortado).
- O aviso `Generated an empty chunk: "chunks/env.js"` no build vem do empacotamento interno do
  `adapter-node` e não é configurável; é inofensivo e ficou.

Pequenas escolhas além do plano: `categorias` e `faturas` também têm `criado_em`/`atualizado_em`;
nome de categoria é único sem diferenciar maiúsculas; `parcelas` tem `UNIQUE(compra_id, numero)`.
