# Controle Financeiro local: plano de construção

Data: 15/10/2026 · Status: planejamento (nada codado ainda)

O objetivo é transformar o app atual (Artifact de página única) em um site que roda no seu computador, com banco de dados local, código organizado, testado e fácil de manter. O escopo funcional parte do que já existe hoje (contas, gastos, categorias, limite do mês, cartões com parcelas e faturas, bitcoin em sats) e cresce em ondas, cada uma entregando algo usável.

---

## 1. Decisões de base (padrões que escolhi)

Você não especificou stack nem banco, então escolhi o seguinte. Qualquer item pode ser trocado antes da Onda 0 começar.

| Tema | Escolha | Por quê |
|---|---|---|
| Linguagem | **TypeScript** (modo estrito) em tudo | Um só idioma no front e no back; o compilador pega erro de centavos vs reais, datas, etc. |
| Framework | **SvelteKit 2 + Svelte 5**, com `adapter-node` | Front e back no mesmo projeto e no mesmo processo: um comando sobe tudo. Formulários funcionam com *form actions* (sem API separada para manter), páginas rápidas, pouco código repetitivo. |
| Banco | **SQLite** (um arquivo `.db`) via `better-sqlite3` | Banco local de verdade, sem servidor para instalar, transações ACID, backup é copiar um arquivo. Para uso pessoal é o melhor custo-benefício que existe. |
| Acesso ao banco | **Drizzle ORM** + **Drizzle Kit** (migrations) | Esquema tipado em TypeScript, migrations versionadas em SQL legível, sem "mágica". |
| Validação | **Zod** | Mesma regra valida o formulário no navegador e no servidor. |
| Visual | CSS próprio com variáveis (tokens), mantendo a identidade "livro-caixa" da v3 (campo laranja, Geist, cantos retos) | Já foi desenhado e aprovado; não precisa de framework de CSS. |
| Gráficos | **uPlot** (ou SVG próprio, como hoje) | Leve, rápido, bom para séries temporais (patrimônio, BTC). |
| Testes | **Vitest** (regras e banco) + **Playwright** (fluxos no navegador) | As regras de fatura/parcela são o coração do app e precisam de teste automatizado. |
| Qualidade | ESLint + Prettier + `svelte-check`, rodando num *pre-commit* | Mantém o código limpo sem esforço. |
| Versionamento | Git local (repositório no GitHub privado é opcional) | Histórico e possibilidade de voltar atrás. |
| Gerenciador | **pnpm** + Node 22 LTS | Rápido e determinístico. |

**Rodar localmente:** `pnpm start` sobe o site em `http://127.0.0.1:5173` (só a sua máquina enxerga; nada exposto na rede). O banco fica fora da pasta do código, em `~/ControleFinanceiro/dados/financas.db`, para que apagar ou atualizar o código nunca toque nos dados.

**Sem login** na primeira versão, porque o servidor só escuta em `127.0.0.1`. Um PIN opcional entra na Onda 5.

---

## 2. Regras de negócio herdadas (e o que muda)

Mantidas exatamente como hoje:

- Valores em **centavos inteiros**; bitcoin em **sats inteiros**. Nunca ponto flutuante para dinheiro.
- **Saldos das contas são manuais**: lançar gasto ou pagar fatura não altera saldo.
- Compra parcelada: cada parcela conta no mês da compra + i e na fatura correspondente; a 1ª parcela leva o resto dos centavos.
- Fatura: compra no dia do fechamento ou depois cai na fatura seguinte; se vencimento ≤ fechamento, o vencimento é no mês seguinte ao fechamento. A fatura é identificada pelo mês do vencimento.
- Patrimônio líquido = soma das contas + sats × último preço − tudo que falta pagar nos cartões (inclui parcelas futuras).

Melhorias que o banco local permite (sem mudar a regra acima):

- **Histórico de saldos**: cada vez que você atualiza o saldo de uma conta, o valor anterior fica guardado. Isso dá o gráfico de evolução do patrimônio, que hoje não é possível.
- **Parcelas como linhas próprias** no banco, em vez de calculadas na hora. Consultas de fatura e do mês ficam simples, rápidas e auditáveis.
- **Preço do BTC automático opcional**: rodando local, o site pode buscar a cotação em BRL numa API pública (ex.: CoinGecko ou mempool.space). O preço manual continua existindo e tem prioridade quando você digita um.
- **Exclusão segura**: itens removidos vão para uma lixeira (*soft delete*) e podem ser restaurados.

---

## 3. Modelo de dados (SQLite)

Convenções: `id` texto (ULID, ordenável por data de criação); datas `TEXT` em ISO (`AAAA-MM-DD`); timestamps `criado_em`/`atualizado_em`; `removido_em` para lixeira; chaves estrangeiras ligadas (`PRAGMA foreign_keys = ON`); `CHECK` para impedir valores inválidos no próprio banco.

```
contas            id, nome, tipo (corrente|poupanca|investimento|dinheiro|outro),
                  saldo_centavos, ativa, ordem, criado_em, atualizado_em, removido_em

saldos_historico  id, conta_id → contas, saldo_centavos, registrado_em
                  (uma linha por atualização de saldo)

categorias        id, nome (único), cor, ordem, arquivada

cartoes           id, nome, limite_centavos, dia_fechamento (1..31), dia_vencimento (1..31),
                  ativo, criado_em, atualizado_em, removido_em

compras           id, descricao, categoria_id → categorias, data_compra,
                  valor_total_centavos, meio (conta|cartao), conta_id?, cartao_id?,
                  num_parcelas (1..24), observacao, criado_em, atualizado_em, removido_em
                  CHECK: meio='conta' ⇒ conta_id; meio='cartao' ⇒ cartao_id

parcelas          id, compra_id → compras (cascade), numero (1..n), valor_centavos,
                  mes_competencia (AAAA-MM), fatura_id? → faturas
                  (gerada automaticamente ao salvar a compra; à vista = 1 parcela)

faturas           id, cartao_id → cartoes, mes_vencimento (AAAA-MM),
                  data_fechamento, data_vencimento, paga_em?, valor_pago_centavos?
                  UNIQUE(cartao_id, mes_vencimento)

btc_movimentos    id, sats (+ compra / − venda), valor_centavos (0 se não informado),
                  data, nota, criado_em, atualizado_em, removido_em

btc_precos        data (PK, AAAA-MM-DD), preco_centavos, origem (manual|implicito|api)

limites_mensais   mes (AAAA-MM, PK) ou 'padrao', valor_centavos
config            chave (PK), valor (JSON)  — preferências gerais
```

Índices: `parcelas(mes_competencia)`, `parcelas(fatura_id)`, `compras(data_compra)`, `compras(categoria_id)`, `btc_movimentos(data)`, `saldos_historico(conta_id, registrado_em)`.

Toda escrita que mexe em mais de uma tabela (salvar compra + gerar parcelas + ligar faturas) roda numa **transação única**: ou grava tudo, ou nada.

---

## 4. Arquitetura do código

```
controle-financeiro/
├─ src/
│  ├─ lib/
│  │  ├─ dominio/        regras puras, sem banco: dinheiro, datas, parcelas,
│  │  │                  ciclo de fatura, patrimônio, conversão sats/BRL
│  │  ├─ server/
│  │  │  ├─ db/          conexão, esquema Drizzle, migrations, seed
│  │  │  ├─ repos/       consultas por entidade (contas, compras, faturas…)
│  │  │  └─ servicos/    casos de uso (lançarCompra, pagarFatura, atualizarSaldo…)
│  │  ├─ validacao/      esquemas Zod compartilhados
│  │  └─ ui/             componentes (campo de valor, modal, tabela razão, gráfico)
│  └─ routes/            páginas: / (painel), /gastos, /contas, /cartoes,
│                        /cartoes/[id]/faturas/[mes], /bitcoin, /relatorios, /config
├─ drizzle/              migrations SQL versionadas
├─ scripts/              backup, restaurar, importar-artifact, seed
├─ tests/                unit (Vitest) e e2e (Playwright)
└─ docs/                 este plano, decisões (ADRs), como rodar
```

Princípio: **`dominio/` não conhece banco nem tela**. Todas as contas de dinheiro, parcela e fatura vivem ali e são testadas isoladamente. Os serviços usam o domínio e gravam no banco; as páginas só chamam serviços.

---

## 5. Ondas de entrega

**Estado (17/10/2026):** Ondas 0 a 5 concluídas, mais receitas, receitas recorrentes (com
confirmação de recebimento) e o refinamento final (desempenho com 10 anos de dados, acessibilidade,
páginas de erro e documentação). As ondas 2 a 5 têm nota em `docs/CHANGELOG.md`; o guia do dia a
dia está em `docs/OPERACAO.md`.

Cada onda termina com o site funcionando, testes passando e um commit marcado (`v0.1`, `v0.2`…). Você pode usar o app a partir do fim da Onda 1.

### Onda 0: Fundação
Objetivo: projeto de pé, banco criado, nada de tela ainda além de uma página "ok".

1. Criar o projeto SvelteKit com TypeScript estrito, pnpm, ESLint, Prettier, `svelte-check`, hook de pre-commit.
2. Configurar pasta de dados fora do código (`~/ControleFinanceiro/dados/`), lida de `.env` com padrão sensato.
3. Conexão SQLite com `WAL`, `foreign_keys = ON`, `busy_timeout`.
4. Esquema Drizzle completo da seção 3 e primeira migration; migrations rodam sozinhas ao iniciar.
5. Módulo `dominio/dinheiro` (parse "1.234,56" → centavos, formatação BRL, divisão em parcelas com resto na 1ª) e `dominio/datas` (mês, último dia, soma de meses), com testes.
6. Script de backup: copia o `.db` com data no nome antes de cada migration e sob demanda (`pnpm backup`).
7. Layout base com os tokens visuais da v3 (cores, Geist, espaçamentos, modo escuro).

Pronto quando: `pnpm start` abre a página, o banco é criado sozinho, `pnpm test` passa.

### Onda 1: Núcleo (contas, categorias, gastos do mês)
Objetivo: substituir o uso diário do app atual para gastos à vista.

1. CRUD de **contas** com atualização de saldo gravando `saldos_historico`.
2. CRUD de **categorias** (renomear, cor, ordenar, arquivar sem perder histórico).
3. Lançamento de **gasto à vista** (meio = conta), com campo de valor que aceita vírgula, data padrão hoje, última categoria usada sugerida.
4. **Painel do mês**: total gasto, limite do mês e quanto resta, gastos por categoria, lista de lançamentos, navegação ‹ mês anterior / próximo ›.
5. Patrimônio líquido parcial (contas; cartões e BTC entram nas próximas ondas).
6. **Lixeira** com restaurar.
7. **Importador do app atual**: exportar os dados do Artifact (contas, gastos, cartões, faturas, bitcoin, preços, categorias, limite) para um JSON e um script `pnpm importar arquivo.json` que converte para o novo banco numa transação, com relatório do que entrou. Rodar uma vez para migrar seu histórico.
8. Testes: domínio (unit), serviços com banco em memória, e2e de "lançar gasto e ver no painel".

Pronto quando: você consegue usar o site local no lugar do Artifact para contas e gastos à vista, com seus dados já importados.

### Onda 2: Cartão de crédito
Objetivo: cartões, compras parceladas e faturas, com as mesmas regras de hoje.

1. CRUD de **cartões** (limite, dia de fechamento, dia de vencimento).
2. `dominio/fatura`: dada a data da compra e o cartão, qual fatura (mês de vencimento) recebe a 1ª parcela; tratar meses curtos (dia 31 em fevereiro) e vencimento ≤ fechamento. Bateria grande de testes com casos de borda.
3. Lançamento de **compra no cartão** com 1 a 24 parcelas: gera `parcelas`, cria/associa `faturas` automaticamente, tudo numa transação. Editar a compra regera as parcelas.
4. Tela de **fatura**: itens (com "3/10"), total, fechamento, vencimento, marcar como paga/desfazer, navegação entre faturas.
5. **Limite disponível** do cartão (limite − parcelas em faturas não pagas).
6. Painel do mês passa a incluir parcelas de cartão por competência; o patrimônio NÃO desconta o cartão (decisão de 19/10/2026: patrimônio = contas + bitcoin).
7. Testes e2e: compra parcelada aparece nas faturas certas; pagar fatura atualiza o patrimônio.

Pronto quando: os números de faturas e patrimônio batem com o app atual para os mesmos dados importados.

### Onda 3: Bitcoin em sats
Objetivo: acompanhar a posição em sats e a evolução em reais.

1. Movimentos de **compra/venda** em sats, com valor pago/recebido opcional; preço implícito do dia gravado quando houver valor.
2. **Preço do BTC**: manual (como hoje) e, opcionalmente, busca automática diária numa API pública, com preço manual tendo prioridade. Se estiver sem internet, nada quebra.
3. Indicadores: total de sats, valor atual em R$, **preço médio de compra**, custo total, ganho/perda não realizado.
4. **Gráfico de evolução**: sats acumulados e valor em R$ ao longo do tempo.
5. Conversor rápido sats ⇄ R$.
6. Patrimônio passa a incluir BTC.

Pronto quando: a seção de bitcoin faz tudo que a v3 faz, mais preço médio e preço automático.

### Onda 4: Visão completa e relatórios
Objetivo: aproveitar o histórico que o banco local guarda.

1. **Evolução do patrimônio** mês a mês (contas pelo histórico de saldos + BTC pelo preço da época; cartão não entra).
2. **Relatórios**: gastos por categoria ao longo dos meses, comparativo mês a mês, maiores gastos, média por categoria.
3. **Busca e filtros** de lançamentos (texto, período, categoria, conta/cartão, faixa de valor).
4. **Limite por mês** (além do padrão) e, opcionalmente, limite por categoria com alerta visual.
5. **Exportar CSV/JSON** de qualquer período.

Pronto quando: você responde "quanto gastei com X nos últimos 6 meses" e "como meu patrimônio evoluiu" sem sair do site.

### Onda 5: Acabamento e operação
Objetivo: deixar o app robusto para anos de uso.

1. **Backups automáticos** rotativos (diário, mantém os últimos 30) e tela de restaurar backup.
2. Verificação de integridade do banco ao iniciar (`PRAGMA integrity_check`) com aviso.
3. Iniciar junto com o computador (script para Windows/macOS/Linux, conforme sua máquina) e atalho na área de trabalho; opção de instalar como **PWA** para abrir em janela própria.
4. **PIN opcional** na abertura.
5. Atalhos de teclado (ex.: `N` novo gasto), acessibilidade, layout bom no celular (caso queira acessar na rede de casa, desligado por padrão).
6. Revisão de desempenho com 10 anos de dados fictícios.
7. Documentação final: como rodar, atualizar, fazer backup e restaurar.

### Backlog (fora do escopo inicial, para decidir depois)
- ~~Receitas/entradas e fluxo de caixa~~ e ~~receitas recorrentes (com confirmação de recebimento)~~: feitos depois da Onda 4.
- Despesas recorrentes (assinaturas) lançadas automaticamente.
- Opção de gastos debitarem o saldo da conta (hoje a regra é saldo manual; ficaria como chave de configuração).
- Importar extrato OFX/CSV do banco (contradiz o "100% manual", por isso fica em espera).
- Anexar foto de comprovante.

---

## 6. Como cada onda é feita

1. Branch por onda, commits pequenos com mensagem clara.
2. Regra de domínio nova entra **primeiro com teste**, depois a tela.
3. Mudança de esquema sempre por migration nova (nunca editar migration antiga); backup automático antes de aplicar.
4. Ao fim da onda: `pnpm check && pnpm test && pnpm test:e2e` verdes, tag de versão, nota curta do que mudou em `docs/CHANGELOG.md`.

## 7. Riscos e cuidados

- **Perda de dados**: mitigado por backup antes de migration, backups diários e banco fora da pasta do código.
- **Divergência com o app atual na migração**: a Onda 1 inclui um relatório comparando totais (saldo, gastos por mês, faturas) entre o JSON importado e o banco novo.
- **Casos de borda de data** (dia 29 a 31, virada de ano): cobertos por testes dedicados na Onda 2.
- **API de preço do BTC** fora do ar ou mudando formato: preço manual sempre disponível; falha da API só gera aviso.

## 8. O que preciso de você antes da Onda 0

Nada obrigatório: dá para começar com os padrões acima. Ajuda saber, quando for codar:
- Seu sistema operacional (para o script de iniciar junto com o computador na Onda 5).
- Se quer o código num repositório privado no GitHub ou só local.
