PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_btc_movimentos` (
	`id` text PRIMARY KEY NOT NULL,
	`sats` integer NOT NULL,
	`valor_centavos` integer DEFAULT 0 NOT NULL,
	`data` text NOT NULL,
	`nota` text,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`removido_em` text,
	CONSTRAINT "btc_movimentos_sats" CHECK(typeof("__new_btc_movimentos"."sats") = 'integer' AND "__new_btc_movimentos"."sats" <> 0),
	CONSTRAINT "btc_movimentos_valor" CHECK(typeof("__new_btc_movimentos"."valor_centavos") = 'integer' AND "__new_btc_movimentos"."valor_centavos" >= 0),
	CONSTRAINT "btc_movimentos_data" CHECK((typeof("__new_btc_movimentos"."data") = 'text' AND "__new_btc_movimentos"."data" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND date("__new_btc_movimentos"."data") IS "__new_btc_movimentos"."data"))
);
--> statement-breakpoint
INSERT INTO `__new_btc_movimentos`("id", "sats", "valor_centavos", "data", "nota", "criado_em", "atualizado_em", "removido_em") SELECT "id", "sats", "valor_centavos", "data", "nota", "criado_em", "atualizado_em", "removido_em" FROM `btc_movimentos`;--> statement-breakpoint
DROP TABLE `btc_movimentos`;--> statement-breakpoint
ALTER TABLE `__new_btc_movimentos` RENAME TO `btc_movimentos`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `btc_movimentos_data_idx` ON `btc_movimentos` (`data`);--> statement-breakpoint
CREATE TABLE `__new_btc_precos` (
	`data` text PRIMARY KEY NOT NULL,
	`preco_centavos` integer NOT NULL,
	`origem` text DEFAULT 'manual' NOT NULL,
	CONSTRAINT "btc_precos_data" CHECK((typeof("__new_btc_precos"."data") = 'text' AND "__new_btc_precos"."data" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND date("__new_btc_precos"."data") IS "__new_btc_precos"."data")),
	CONSTRAINT "btc_precos_preco_positivo" CHECK(typeof("__new_btc_precos"."preco_centavos") = 'integer' AND "__new_btc_precos"."preco_centavos" > 0),
	CONSTRAINT "btc_precos_origem" CHECK("__new_btc_precos"."origem" IN ('manual', 'implicito', 'api'))
);
--> statement-breakpoint
INSERT INTO `__new_btc_precos`("data", "preco_centavos", "origem") SELECT "data", "preco_centavos", "origem" FROM `btc_precos`;--> statement-breakpoint
DROP TABLE `btc_precos`;--> statement-breakpoint
ALTER TABLE `__new_btc_precos` RENAME TO `btc_precos`;--> statement-breakpoint
CREATE TABLE `__new_cartoes` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`limite_centavos` integer DEFAULT 0 NOT NULL,
	`dia_fechamento` integer NOT NULL,
	`dia_vencimento` integer NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`removido_em` text,
	CONSTRAINT "cartoes_nome_preenchido" CHECK(length(trim("__new_cartoes"."nome")) > 0),
	CONSTRAINT "cartoes_limite_nao_negativo" CHECK(typeof("__new_cartoes"."limite_centavos") = 'integer' AND "__new_cartoes"."limite_centavos" >= 0),
	CONSTRAINT "cartoes_dia_fechamento" CHECK(typeof("__new_cartoes"."dia_fechamento") = 'integer' AND "__new_cartoes"."dia_fechamento" BETWEEN 1 AND 31),
	CONSTRAINT "cartoes_dia_vencimento" CHECK(typeof("__new_cartoes"."dia_vencimento") = 'integer' AND "__new_cartoes"."dia_vencimento" BETWEEN 1 AND 31),
	CONSTRAINT "cartoes_ativo_bool" CHECK((typeof("__new_cartoes"."ativo") = 'integer' AND "__new_cartoes"."ativo" IN (0, 1)))
);
--> statement-breakpoint
INSERT INTO `__new_cartoes`("id", "nome", "limite_centavos", "dia_fechamento", "dia_vencimento", "ativo", "criado_em", "atualizado_em", "removido_em") SELECT "id", "nome", "limite_centavos", "dia_fechamento", "dia_vencimento", "ativo", "criado_em", "atualizado_em", "removido_em" FROM `cartoes`;--> statement-breakpoint
DROP TABLE `cartoes`;--> statement-breakpoint
ALTER TABLE `__new_cartoes` RENAME TO `cartoes`;--> statement-breakpoint
CREATE TABLE `__new_categorias` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`cor` text,
	`ordem` integer DEFAULT 0 NOT NULL,
	`arquivada` integer DEFAULT false NOT NULL,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "categorias_nome_preenchido" CHECK(length(trim("__new_categorias"."nome")) > 0),
	CONSTRAINT "categorias_arquivada_bool" CHECK((typeof("__new_categorias"."arquivada") = 'integer' AND "__new_categorias"."arquivada" IN (0, 1))),
	CONSTRAINT "categorias_ordem_inteiro" CHECK(typeof("__new_categorias"."ordem") = 'integer')
);
--> statement-breakpoint
INSERT INTO `__new_categorias`("id", "nome", "cor", "ordem", "arquivada", "criado_em", "atualizado_em") SELECT "id", "nome", "cor", "ordem", "arquivada", "criado_em", "atualizado_em" FROM `categorias`;--> statement-breakpoint
DROP TABLE `categorias`;--> statement-breakpoint
ALTER TABLE `__new_categorias` RENAME TO `categorias`;--> statement-breakpoint
CREATE UNIQUE INDEX `categorias_nome_unico` ON `categorias` (lower("nome"));--> statement-breakpoint
CREATE TABLE `__new_compras` (
	`id` text PRIMARY KEY NOT NULL,
	`descricao` text NOT NULL,
	`categoria_id` text NOT NULL,
	`data_compra` text NOT NULL,
	`valor_total_centavos` integer NOT NULL,
	`meio` text NOT NULL,
	`conta_id` text,
	`cartao_id` text,
	`num_parcelas` integer DEFAULT 1 NOT NULL,
	`observacao` text,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`removido_em` text,
	FOREIGN KEY (`categoria_id`) REFERENCES `categorias`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`conta_id`) REFERENCES `contas`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`cartao_id`) REFERENCES `cartoes`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "compras_descricao_preenchida" CHECK(length(trim("__new_compras"."descricao")) > 0),
	CONSTRAINT "compras_data" CHECK((typeof("__new_compras"."data_compra") = 'text' AND "__new_compras"."data_compra" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND date("__new_compras"."data_compra") IS "__new_compras"."data_compra")),
	CONSTRAINT "compras_valor_positivo" CHECK(typeof("__new_compras"."valor_total_centavos") = 'integer' AND "__new_compras"."valor_total_centavos" > 0),
	CONSTRAINT "compras_meio_valido" CHECK("__new_compras"."meio" IN ('conta', 'cartao')),
	CONSTRAINT "compras_meio_coerente" CHECK(("__new_compras"."meio" = 'conta' AND "__new_compras"."conta_id" IS NOT NULL AND "__new_compras"."cartao_id" IS NULL) OR ("__new_compras"."meio" = 'cartao' AND "__new_compras"."cartao_id" IS NOT NULL AND "__new_compras"."conta_id" IS NULL)),
	CONSTRAINT "compras_num_parcelas" CHECK(typeof("__new_compras"."num_parcelas") = 'integer' AND "__new_compras"."num_parcelas" BETWEEN 1 AND 24)
);
--> statement-breakpoint
INSERT INTO `__new_compras`("id", "descricao", "categoria_id", "data_compra", "valor_total_centavos", "meio", "conta_id", "cartao_id", "num_parcelas", "observacao", "criado_em", "atualizado_em", "removido_em") SELECT "id", "descricao", "categoria_id", "data_compra", "valor_total_centavos", "meio", "conta_id", "cartao_id", "num_parcelas", "observacao", "criado_em", "atualizado_em", "removido_em" FROM `compras`;--> statement-breakpoint
DROP TABLE `compras`;--> statement-breakpoint
ALTER TABLE `__new_compras` RENAME TO `compras`;--> statement-breakpoint
CREATE INDEX `compras_data_idx` ON `compras` (`data_compra`);--> statement-breakpoint
CREATE INDEX `compras_categoria_idx` ON `compras` (`categoria_id`);--> statement-breakpoint
CREATE TABLE `__new_contas` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`tipo` text DEFAULT 'corrente' NOT NULL,
	`saldo_centavos` integer DEFAULT 0 NOT NULL,
	`ativa` integer DEFAULT true NOT NULL,
	`ordem` integer DEFAULT 0 NOT NULL,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`removido_em` text,
	CONSTRAINT "contas_nome_preenchido" CHECK(length(trim("__new_contas"."nome")) > 0),
	CONSTRAINT "contas_tipo_valido" CHECK("__new_contas"."tipo" IN ('corrente', 'poupanca', 'investimento', 'dinheiro', 'outro')),
	CONSTRAINT "contas_ativa_bool" CHECK((typeof("__new_contas"."ativa") = 'integer' AND "__new_contas"."ativa" IN (0, 1))),
	CONSTRAINT "contas_saldo_inteiro" CHECK(typeof("__new_contas"."saldo_centavos") = 'integer'),
	CONSTRAINT "contas_ordem_inteiro" CHECK(typeof("__new_contas"."ordem") = 'integer')
);
--> statement-breakpoint
INSERT INTO `__new_contas`("id", "nome", "tipo", "saldo_centavos", "ativa", "ordem", "criado_em", "atualizado_em", "removido_em") SELECT "id", "nome", "tipo", "saldo_centavos", "ativa", "ordem", "criado_em", "atualizado_em", "removido_em" FROM `contas`;--> statement-breakpoint
DROP TABLE `contas`;--> statement-breakpoint
ALTER TABLE `__new_contas` RENAME TO `contas`;--> statement-breakpoint
CREATE TABLE `__new_faturas` (
	`id` text PRIMARY KEY NOT NULL,
	`cartao_id` text NOT NULL,
	`mes_vencimento` text NOT NULL,
	`data_fechamento` text NOT NULL,
	`data_vencimento` text NOT NULL,
	`paga_em` text,
	`valor_pago_centavos` integer,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`cartao_id`) REFERENCES `cartoes`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "faturas_mes_vencimento" CHECK((typeof("__new_faturas"."mes_vencimento") = 'text' AND "__new_faturas"."mes_vencimento" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr("__new_faturas"."mes_vencimento", 6, 2) BETWEEN '01' AND '12')),
	CONSTRAINT "faturas_data_fechamento" CHECK((typeof("__new_faturas"."data_fechamento") = 'text' AND "__new_faturas"."data_fechamento" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND date("__new_faturas"."data_fechamento") IS "__new_faturas"."data_fechamento")),
	CONSTRAINT "faturas_data_vencimento" CHECK((typeof("__new_faturas"."data_vencimento") = 'text' AND "__new_faturas"."data_vencimento" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND date("__new_faturas"."data_vencimento") IS "__new_faturas"."data_vencimento")),
	CONSTRAINT "faturas_paga_em" CHECK("__new_faturas"."paga_em" IS NULL OR (typeof("__new_faturas"."paga_em") = 'text' AND "__new_faturas"."paga_em" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND date("__new_faturas"."paga_em") IS "__new_faturas"."paga_em")),
	CONSTRAINT "faturas_valor_pago" CHECK("__new_faturas"."valor_pago_centavos" IS NULL OR (typeof("__new_faturas"."valor_pago_centavos") = 'integer' AND "__new_faturas"."valor_pago_centavos" >= 0))
);
--> statement-breakpoint
INSERT INTO `__new_faturas`("id", "cartao_id", "mes_vencimento", "data_fechamento", "data_vencimento", "paga_em", "valor_pago_centavos", "criado_em", "atualizado_em") SELECT "id", "cartao_id", "mes_vencimento", "data_fechamento", "data_vencimento", "paga_em", "valor_pago_centavos", "criado_em", "atualizado_em" FROM `faturas`;--> statement-breakpoint
DROP TABLE `faturas`;--> statement-breakpoint
ALTER TABLE `__new_faturas` RENAME TO `faturas`;--> statement-breakpoint
CREATE UNIQUE INDEX `faturas_cartao_mes_unico` ON `faturas` (`cartao_id`,`mes_vencimento`);--> statement-breakpoint
CREATE TABLE `__new_limites_mensais` (
	`mes` text PRIMARY KEY NOT NULL,
	`valor_centavos` integer NOT NULL,
	CONSTRAINT "limites_mensais_mes" CHECK("__new_limites_mensais"."mes" = 'padrao' OR (typeof("__new_limites_mensais"."mes") = 'text' AND "__new_limites_mensais"."mes" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr("__new_limites_mensais"."mes", 6, 2) BETWEEN '01' AND '12')),
	CONSTRAINT "limites_mensais_valor" CHECK(typeof("__new_limites_mensais"."valor_centavos") = 'integer' AND "__new_limites_mensais"."valor_centavos" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_limites_mensais`("mes", "valor_centavos") SELECT "mes", "valor_centavos" FROM `limites_mensais`;--> statement-breakpoint
DROP TABLE `limites_mensais`;--> statement-breakpoint
ALTER TABLE `__new_limites_mensais` RENAME TO `limites_mensais`;--> statement-breakpoint
CREATE TABLE `__new_parcelas` (
	`id` text PRIMARY KEY NOT NULL,
	`compra_id` text NOT NULL,
	`numero` integer NOT NULL,
	`valor_centavos` integer NOT NULL,
	`mes_competencia` text NOT NULL,
	`fatura_id` text,
	FOREIGN KEY (`compra_id`) REFERENCES `compras`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fatura_id`) REFERENCES `faturas`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "parcelas_numero" CHECK(typeof("__new_parcelas"."numero") = 'integer' AND "__new_parcelas"."numero" BETWEEN 1 AND 24),
	CONSTRAINT "parcelas_mes_competencia" CHECK((typeof("__new_parcelas"."mes_competencia") = 'text' AND "__new_parcelas"."mes_competencia" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr("__new_parcelas"."mes_competencia", 6, 2) BETWEEN '01' AND '12')),
	CONSTRAINT "parcelas_valor" CHECK(typeof("__new_parcelas"."valor_centavos") = 'integer' AND "__new_parcelas"."valor_centavos" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_parcelas`("id", "compra_id", "numero", "valor_centavos", "mes_competencia", "fatura_id") SELECT "id", "compra_id", "numero", "valor_centavos", "mes_competencia", "fatura_id" FROM `parcelas`;--> statement-breakpoint
DROP TABLE `parcelas`;--> statement-breakpoint
ALTER TABLE `__new_parcelas` RENAME TO `parcelas`;--> statement-breakpoint
CREATE INDEX `parcelas_mes_competencia_idx` ON `parcelas` (`mes_competencia`);--> statement-breakpoint
CREATE INDEX `parcelas_fatura_idx` ON `parcelas` (`fatura_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `parcelas_compra_numero_unico` ON `parcelas` (`compra_id`,`numero`);--> statement-breakpoint
CREATE TABLE `__new_saldos_historico` (
	`id` text PRIMARY KEY NOT NULL,
	`conta_id` text NOT NULL,
	`saldo_centavos` integer NOT NULL,
	`registrado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`conta_id`) REFERENCES `contas`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "saldos_historico_saldo_inteiro" CHECK(typeof("__new_saldos_historico"."saldo_centavos") = 'integer')
);
--> statement-breakpoint
INSERT INTO `__new_saldos_historico`("id", "conta_id", "saldo_centavos", "registrado_em") SELECT "id", "conta_id", "saldo_centavos", "registrado_em" FROM `saldos_historico`;--> statement-breakpoint
DROP TABLE `saldos_historico`;--> statement-breakpoint
ALTER TABLE `__new_saldos_historico` RENAME TO `saldos_historico`;--> statement-breakpoint
CREATE INDEX `saldos_historico_conta_data_idx` ON `saldos_historico` (`conta_id`,`registrado_em`);