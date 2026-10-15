/**
 * Esquema completo do banco (plano, seção 3).
 *
 * Convenções:
 * - `id` texto ULID (ordenável pela data de criação);
 * - dinheiro em centavos inteiros, bitcoin em sats inteiros;
 * - datas `TEXT` ISO ("AAAA-MM-DD"), meses "AAAA-MM";
 * - `criado_em` / `atualizado_em` em ISO UTC; `removido_em` preenchido = item na lixeira;
 * - CHECKs no próprio banco impedem valores inválidos mesmo que algum código erre.
 *
 * Mudou algo aqui? Rode `pnpm db:generate` para criar uma migration NOVA.
 * Nunca edite uma migration que já existe.
 */
import { sql, type SQL } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import { monotonicFactory } from 'ulid';
import { TIPOS_CONTA } from '../../dominio/contas.ts';

// ---------------------------------------------------------------- auxiliares

// Monotônico: ids criados no mesmo milissegundo continuam em ordem de criação.
const ulid = monotonicFactory();

const AGORA = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => ulid());

const criadoEm = () => text('criado_em').notNull().default(AGORA);
const atualizadoEm = () =>
  text('atualizado_em')
    .notNull()
    .default(AGORA)
    .$onUpdateFn(() => new Date().toISOString());
const removidoEm = () => text('removido_em');

const booleano = (nome: string, padrao: boolean) =>
  integer(nome, { mode: 'boolean' }).notNull().default(padrao);

/**
 * CHECK: coluna é uma data real "AAAA-MM-DD". `date()` normaliza datas impossíveis
 * ("2026-02-31" vira "2026-03-03"), então exigir que volte igual recusa o dia inexistente.
 */
const ehDiaSql = (c: AnySQLiteColumn | SQL) =>
  sql`(typeof(${c}) = 'text' AND ${c} GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND date(${c}) IS ${c})`;

/** CHECK: coluna é "AAAA-MM" com mês 01..12. */
const ehMesSql = (c: AnySQLiteColumn | SQL) =>
  sql`(typeof(${c}) = 'text' AND ${c} GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(${c}, 6, 2) BETWEEN '01' AND '12')`;

/**
 * As tabelas não são STRICT: sem isto o SQLite aceitaria 10.5 ou 'abc' numa coluna INTEGER.
 * Dinheiro (centavos), sats, dias, contagens e booleanos precisam ser inteiros de verdade.
 */
const inteiro = (c: AnySQLiteColumn) => sql`typeof(${c}) = 'integer'`;

const boolSql = (c: AnySQLiteColumn) => sql`(typeof(${c}) = 'integer' AND ${c} IN (0, 1))`;

export { TIPOS_CONTA, type TipoConta } from '../../dominio/contas.ts';

export const MEIOS = ['conta', 'cartao'] as const;
export type Meio = (typeof MEIOS)[number];

export const ORIGENS_PRECO = ['manual', 'implicito', 'api'] as const;
export type OrigemPreco = (typeof ORIGENS_PRECO)[number];

// ---------------------------------------------------------------- contas

export const contas = sqliteTable(
  'contas',
  {
    id: id(),
    nome: text('nome').notNull(),
    tipo: text('tipo', { enum: TIPOS_CONTA }).notNull().default('corrente'),
    saldoCentavos: integer('saldo_centavos').notNull().default(0),
    ativa: booleano('ativa', true),
    ordem: integer('ordem').notNull().default(0),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
    removidoEm: removidoEm(),
  },
  (t) => [
    check('contas_nome_preenchido', sql`length(trim(${t.nome})) > 0`),
    check(
      'contas_tipo_valido',
      sql`${t.tipo} IN ('corrente', 'poupanca', 'investimento', 'dinheiro', 'outro')`,
    ),
    check('contas_ativa_bool', boolSql(t.ativa)),
    check('contas_saldo_inteiro', inteiro(t.saldoCentavos)),
    check('contas_ordem_inteiro', inteiro(t.ordem)),
  ],
);

export const saldosHistorico = sqliteTable(
  'saldos_historico',
  {
    id: id(),
    contaId: text('conta_id')
      .notNull()
      .references(() => contas.id, { onDelete: 'cascade' }),
    saldoCentavos: integer('saldo_centavos').notNull(),
    registradoEm: text('registrado_em').notNull().default(AGORA),
  },
  (t) => [
    index('saldos_historico_conta_data_idx').on(t.contaId, t.registradoEm),
    check('saldos_historico_saldo_inteiro', inteiro(t.saldoCentavos)),
  ],
);

// ---------------------------------------------------------------- categorias

export const categorias = sqliteTable(
  'categorias',
  {
    id: id(),
    nome: text('nome').notNull(),
    cor: text('cor'),
    ordem: integer('ordem').notNull().default(0),
    arquivada: booleano('arquivada', false),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    // Nome único sem diferenciar maiúsculas ("Mercado" = "mercado").
    uniqueIndex('categorias_nome_unico').on(sql`lower(${t.nome})`),
    check('categorias_nome_preenchido', sql`length(trim(${t.nome})) > 0`),
    check('categorias_arquivada_bool', boolSql(t.arquivada)),
    check('categorias_ordem_inteiro', inteiro(t.ordem)),
  ],
);

// ---------------------------------------------------------------- cartões

export const cartoes = sqliteTable(
  'cartoes',
  {
    id: id(),
    nome: text('nome').notNull(),
    limiteCentavos: integer('limite_centavos').notNull().default(0),
    diaFechamento: integer('dia_fechamento').notNull(),
    diaVencimento: integer('dia_vencimento').notNull(),
    ativo: booleano('ativo', true),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
    removidoEm: removidoEm(),
  },
  (t) => [
    check('cartoes_nome_preenchido', sql`length(trim(${t.nome})) > 0`),
    check(
      'cartoes_limite_nao_negativo',
      sql`${inteiro(t.limiteCentavos)} AND ${t.limiteCentavos} >= 0`,
    ),
    check(
      'cartoes_dia_fechamento',
      sql`${inteiro(t.diaFechamento)} AND ${t.diaFechamento} BETWEEN 1 AND 31`,
    ),
    check(
      'cartoes_dia_vencimento',
      sql`${inteiro(t.diaVencimento)} AND ${t.diaVencimento} BETWEEN 1 AND 31`,
    ),
    check('cartoes_ativo_bool', boolSql(t.ativo)),
  ],
);

export const faturas = sqliteTable(
  'faturas',
  {
    id: id(),
    cartaoId: text('cartao_id')
      .notNull()
      .references(() => cartoes.id, { onDelete: 'restrict' }),
    /** A fatura é identificada pelo mês do vencimento. */
    mesVencimento: text('mes_vencimento').notNull(),
    dataFechamento: text('data_fechamento').notNull(),
    dataVencimento: text('data_vencimento').notNull(),
    pagaEm: text('paga_em'),
    valorPagoCentavos: integer('valor_pago_centavos'),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    unique('faturas_cartao_mes_unico').on(t.cartaoId, t.mesVencimento),
    check('faturas_mes_vencimento', ehMesSql(t.mesVencimento)),
    check('faturas_data_fechamento', ehDiaSql(t.dataFechamento)),
    check('faturas_data_vencimento', ehDiaSql(t.dataVencimento)),
    check('faturas_paga_em', sql`${t.pagaEm} IS NULL OR ${ehDiaSql(t.pagaEm)}`),
    check(
      'faturas_valor_pago',
      sql`${t.valorPagoCentavos} IS NULL OR (${inteiro(t.valorPagoCentavos)} AND ${t.valorPagoCentavos} >= 0)`,
    ),
  ],
);

// ---------------------------------------------------------------- compras e parcelas

export const compras = sqliteTable(
  'compras',
  {
    id: id(),
    /** Opcional, como no app atual: sem descrição, a tela mostra o nome da categoria. */
    descricao: text('descricao'),
    categoriaId: text('categoria_id')
      .notNull()
      .references(() => categorias.id, { onDelete: 'restrict' }),
    dataCompra: text('data_compra').notNull(),
    valorTotalCentavos: integer('valor_total_centavos').notNull(),
    meio: text('meio', { enum: MEIOS }).notNull(),
    /** Em gasto à vista a conta é informativa e pode ficar em branco ("Não informar"). */
    contaId: text('conta_id').references(() => contas.id, { onDelete: 'restrict' }),
    cartaoId: text('cartao_id').references(() => cartoes.id, { onDelete: 'restrict' }),
    numParcelas: integer('num_parcelas').notNull().default(1),
    observacao: text('observacao'),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
    removidoEm: removidoEm(),
  },
  (t) => [
    check(
      'compras_descricao_preenchida',
      sql`${t.descricao} IS NULL OR length(trim(${t.descricao})) > 0`,
    ),
    check('compras_data', ehDiaSql(t.dataCompra)),
    check(
      'compras_valor_positivo',
      sql`${inteiro(t.valorTotalCentavos)} AND ${t.valorTotalCentavos} > 0`,
    ),
    check('compras_meio_valido', sql`${t.meio} IN ('conta', 'cartao')`),
    check(
      'compras_meio_coerente',
      sql`(${t.meio} = 'conta' AND ${t.cartaoId} IS NULL) OR (${t.meio} = 'cartao' AND ${t.cartaoId} IS NOT NULL AND ${t.contaId} IS NULL)`,
    ),
    check(
      'compras_num_parcelas',
      sql`${inteiro(t.numParcelas)} AND ${t.numParcelas} BETWEEN 1 AND 24`,
    ),
    index('compras_data_idx').on(t.dataCompra),
    index('compras_categoria_idx').on(t.categoriaId),
  ],
);

export const parcelas = sqliteTable(
  'parcelas',
  {
    id: id(),
    compraId: text('compra_id')
      .notNull()
      .references(() => compras.id, { onDelete: 'cascade' }),
    numero: integer('numero').notNull(),
    valorCentavos: integer('valor_centavos').notNull(),
    mesCompetencia: text('mes_competencia').notNull(),
    faturaId: text('fatura_id').references(() => faturas.id, { onDelete: 'set null' }),
  },
  (t) => [
    unique('parcelas_compra_numero_unico').on(t.compraId, t.numero),
    check('parcelas_numero', sql`${inteiro(t.numero)} AND ${t.numero} BETWEEN 1 AND 24`),
    check('parcelas_mes_competencia', ehMesSql(t.mesCompetencia)),
    // Pode ser 0: R$ 0,05 em 24 vezes dá parcelas zeradas depois da 1ª.
    check('parcelas_valor', sql`${inteiro(t.valorCentavos)} AND ${t.valorCentavos} >= 0`),
    index('parcelas_mes_competencia_idx').on(t.mesCompetencia),
    index('parcelas_fatura_idx').on(t.faturaId),
  ],
);

// ---------------------------------------------------------------- bitcoin

export const btcMovimentos = sqliteTable(
  'btc_movimentos',
  {
    id: id(),
    /** + compra, − venda. */
    sats: integer('sats').notNull(),
    /** Centavos pagos/recebidos; 0 se não informado. */
    valorCentavos: integer('valor_centavos').notNull().default(0),
    data: text('data').notNull(),
    nota: text('nota'),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
    removidoEm: removidoEm(),
  },
  (t) => [
    check('btc_movimentos_sats', sql`${inteiro(t.sats)} AND ${t.sats} <> 0`),
    check('btc_movimentos_valor', sql`${inteiro(t.valorCentavos)} AND ${t.valorCentavos} >= 0`),
    check('btc_movimentos_data', ehDiaSql(t.data)),
    index('btc_movimentos_data_idx').on(t.data),
  ],
);

export const btcPrecos = sqliteTable(
  'btc_precos',
  {
    data: text('data').primaryKey(),
    /** Preço de 1 BTC em centavos. */
    precoCentavos: integer('preco_centavos').notNull(),
    origem: text('origem', { enum: ORIGENS_PRECO }).notNull().default('manual'),
  },
  (t) => [
    check('btc_precos_data', ehDiaSql(t.data)),
    check('btc_precos_preco_positivo', sql`${inteiro(t.precoCentavos)} AND ${t.precoCentavos} > 0`),
    check('btc_precos_origem', sql`${t.origem} IN ('manual', 'implicito', 'api')`),
  ],
);

// ---------------------------------------------------------------- limites e configuração

export const limitesMensais = sqliteTable(
  'limites_mensais',
  {
    /** "AAAA-MM" ou "padrao". */
    mes: text('mes').primaryKey(),
    valorCentavos: integer('valor_centavos').notNull(),
  },
  (t) => [
    check('limites_mensais_mes', sql`${t.mes} = 'padrao' OR ${ehMesSql(t.mes)}`),
    check('limites_mensais_valor', sql`${inteiro(t.valorCentavos)} AND ${t.valorCentavos} >= 0`),
  ],
);

export const config = sqliteTable(
  'config',
  {
    chave: text('chave').primaryKey(),
    /** JSON. */
    valor: text('valor', { mode: 'json' }).notNull(),
  },
  (t) => [check('config_valor_json', sql`json_valid(${t.valor})`)],
);

/** Tabelas do esquema, na ordem da seção 3 do plano. */
export const TABELAS = [
  'contas',
  'saldos_historico',
  'categorias',
  'cartoes',
  'compras',
  'parcelas',
  'faturas',
  'btc_movimentos',
  'btc_precos',
  'limites_mensais',
  'config',
] as const;
