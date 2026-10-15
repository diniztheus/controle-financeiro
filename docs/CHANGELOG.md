# Changelog

Uma nota curta por onda. Versões seguem as tags do git (`v0.0`, `v0.1`…).

## Onda 2: Cartão de crédito + confirmação de recebimento (15/10/2026)

- **Cartões** (`/cartoes`): cadastro com limite, dia de fechamento e de vencimento; limite
  disponível; arquivar (some dos formulários, mantém o histórico) e lixeira. Mudar fechamento ou
  vencimento vale só para compras novas.
- **Compra no cartão** (`/gastos`): "Forma de pagamento" Conta ou Cartão, 1 a 24 parcelas e uma
  prévia ("10x de R$ 100,00 · 1ª parcela na fatura de dez/2026"). As parcelas caem na fatura
  certa (a 1ª leva o resto dos centavos) e a compra pode ser editada: as parcelas são refeitas.
- **Fatura** (`/cartoes/[id]/faturas/[mes]`): itens com "3/10", total, fechamento, vencimento,
  situação (aberta, fechada, vencida, paga), marcar como paga e desfazer, navegação entre meses.
  Pagar não altera o saldo das contas. Editar ou remover uma compra que está em fatura paga é
  recusado até desfazer o pagamento.
- **Patrimônio** = contas + bitcoin − o que falta pagar nos cartões (inclui parcelas futuras), na
  tela inicial e na evolução dos relatórios (coluna "Cartões a pagar").
- **Receitas recorrentes agora nascem "previstas"**: aparecem em "A receber" e só entram nos
  totais quando você confirma o recebimento ("Recebi", podendo ajustar valor e data dentro do
  mês) ou descarta ("Não recebi"). A confirmação pode ser desfeita. Receita lançada à mão nasce
  recebida, e as que já existiam ficaram como recebidas (migration `0005_receitas_confirmacao`).
- O menu não tem mais seções "em breve".

## Receitas recorrentes (15/10/2026)

- **Receitas recorrentes** (`/receitas/recorrentes`): salário, bolsa, aluguel recebido e afins.
  Cadastre o valor, o dia do mês, a partir de quando e, se houver, até quando. O site lança a
  receita de cada mês sozinho, até o dia de hoje, uma por mês. Dia 29, 30 ou 31 cai no último
  dia dos meses mais curtos.
- Depois de lançada, a receita é comum: dá para editar, mandar para a lixeira (e ela não volta
  a ser lançada) e ela entra nos relatórios, marcada com o selo "Recorrente".
- Editar o modelo, pausar ou retomar vale só dali para frente: o que já foi lançado não muda, e
  retomar (ou restaurar da lixeira) nunca lança de uma vez os meses em que ficou parado.
- Categoria nova: **Bolsa**. Migration `0004_receitas_recorrentes` (só acrescenta).

## Receitas e fluxo de caixa (15/10/2026)

Receita é só registro, como o gasto: **não altera o saldo das contas**, que continua informado à
mão.

- **Receitas** (`/receitas`): lançar com valor, data, categoria (Salário, Freelance, Rendimentos,
  Reembolso, Presente, Outros), descrição, conta que recebeu e observação; lista do mês por dia,
  total e divisão por categoria; editar, mandar para a lixeira e restaurar.
- **Tela inicial**: entradas do mês, sobra (entradas − gastos) e taxa de poupança. O bitcoin
  aparece na composição do patrimônio.
- **Relatórios**: seção "Receitas e despesas" com barras por mês, tabela mês a mês e receitas por
  categoria.
- Migration `0003_receitas` (só cria a tabela nova). Busca e exportação continuam só com gastos.

## Onda 4: Relatórios, busca e exportação (15/10/2026)

- **Relatórios** (`/relatorios`): evolução do patrimônio mês a mês (contas pelo último saldo
  registrado + bitcoin pelo último preço conhecido), gastos por categoria nos meses com total e
  média, comparativo mês a mês e os 10 maiores gastos. Período de 3, 6, 12 ou 24 meses.
- **Busca** (`/busca`): por texto (sem diferenciar maiúsculas e acentos), período, categoria,
  conta ou cartão e faixa de valor. Funciona sem JavaScript.
- **Exportar** (`/relatorios/exportar`): CSV (UTF-8 com BOM, `;`, vírgula decimal, protegido
  contra fórmulas) ou JSON, de qualquer período de até 120 meses.
- **Limite por mês**: na tela inicial o limite pode valer só para o mês ou para todos (padrão).
- Fora desta onda: limite por categoria e dívida de cartão no patrimônio (dependem da onda 2).

## Onda 3: Bitcoin em sats (15/10/2026)

- **Bitcoin** (`/bitcoin`): compras e vendas em sats com valor opcional, posição, preço médio de
  compra, ganho ou perda não realizado, gráfico de evolução e conversor sats ⇄ R$ (também sem
  JavaScript). Preço do dia manual ou buscado numa API pública; o manual sempre vence e, sem
  internet, nada quebra. Venda nunca passa do saldo de sats na data dela. O patrimônio da tela
  inicial passa a incluir o bitcoin.

## v0.1 — Onda 1: Núcleo (15/10/2026)

O site substitui o app atual para contas e gastos à vista.

- **Painel do mês** (`/`): patrimônio líquido (por enquanto só contas), total gasto, limite do
  mês com quanto resta (alerta a partir de 85%), comparação com o mês anterior até o mesmo dia,
  gráfico do gasto acumulado, gastos por categoria e lançamentos; navegação ‹ mês › pela URL.
- **Gastos** (`/gastos`): lançar gasto à vista com valor que aceita vírgula, data padrão hoje e a
  última categoria usada já marcada; conta e descrição opcionais, como no app atual. Editar,
  mandar para a lixeira e desfazer. Gastos nunca mexem no saldo das contas.
- **Contas** (`/contas`): cadastrar, atualizar o saldo direto na lista, ordenar, editar e ver o
  histórico de saldos (cada atualização fica guardada).
- **Categorias** (`/categorias`): as 11 do app atual já vêm prontas; criar, renomear, trocar a
  cor, ordenar, arquivar e desarquivar. Arquivar não mexe nos gastos antigos.
- **Lixeira** (`/lixeira`): restaurar gastos e contas. Nada é apagado de vez.
- **Importador** (`pnpm importar arquivo.json`): traz os dados do app atual (botão "Exportar
  dados" no rodapé do app) numa transação única, com backup antes, só num banco sem dados, e um
  relatório que confere saldo, gastos por mês, faturas, sats e valores do bitcoin com as regras
  do app. Se algum total não bater, nada é gravado (`--aceitar-diferencas` grava assim mesmo);
  `--simular` mostra o relatório sem gravar. Compras no cartão, faturas pagas e bitcoin também
  entram; as telas deles chegam nas próximas ondas. Casos do mundo real viram avisos, não
  falhas: categorias padrão do site que o app não tinha ficam arquivadas, compras de cartão
  apagado entram num cartão na lixeira, datas com hora, preço repetido, limite já definido.
- A página de estado do sistema e o backup sob demanda foram para `/sistema` (link no rodapé).
- **Funciona sem JavaScript**: todos os formulários são formulários de verdade; com JavaScript,
  enviam sem recarregar.
- **Testes**: domínio, serviços com banco em memória, importador e e2e no navegador (lançar gasto
  e ver no painel, lixeira, histórico de saldo, categorias, limite, sem JavaScript, celular).

Decisões e diferenças em relação ao plano:

- **Migration `0002`**: gasto à vista pode ficar sem conta e sem descrição (o app atual permite
  "Não informar" e descrição vazia); o CHECK de `compras` foi relaxado só para `meio = 'conta'`.
- `dominio/fatura` (ciclo de fatura) entrou já nesta onda porque o importador precisa ligar as
  compras de cartão às faturas certas; a tela de cartões continua na Onda 2.
- O painel soma as parcelas de cartão importadas por mês de competência, como o app atual faz,
  para os totais do mês baterem com o que você já via.
- `contas.ativa` não é usada nesta onda (remover = lixeira); só o cartão "removido no app"
  criado pelo importador sai com `ativo = 0`.
- Até 24 parcelas, como o formulário do app atual oferecia (o código do app limitava a 48, mas
  nunca deixava lançar mais de 24); o importador recusa com mensagem clara se aparecer mais.
- Ids ULID monotônicos (mantêm a ordem de criação mesmo no mesmo milissegundo).
- Revisões feitas por um segundo revisor a cada entrega; os pontos apontados foram corrigidos
  antes de seguir (commits "Correções da auditoria…").

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
