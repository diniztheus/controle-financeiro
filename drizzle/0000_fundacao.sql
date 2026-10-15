CREATE TABLE `btc_movimentos` (
	`id` text PRIMARY KEY NOT NULL,
	`sats` integer NOT NULL,
	`valor_centavos` integer DEFAULT 0 NOT NULL,
	`data` text NOT NULL,
	`nota` text,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`removido_em` text,
	CONSTRAINT "btc_movimentos_sats" CHECK("btc_movimentos"."sats" <> 0),
	CONSTRAINT "btc_movimentos_valor" CHECK("btc_movimentos"."valor_centavos" >= 0),
	CONSTRAINT "btc_movimentos_data" CHECK(("btc_movimentos"."data" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND substr("btc_movimentos"."data", 6, 2) BETWEEN '01' AND '12' AND substr("btc_movimentos"."data", 9, 2) BETWEEN '01' AND '31'))
);
--> statement-breakpoint
CREATE INDEX `btc_movimentos_data_idx` ON `btc_movimentos` (`data`);--> statement-breakpoint
CREATE TABLE `btc_precos` (
	`data` text PRIMARY KEY NOT NULL,
	`preco_centavos` integer NOT NULL,
	`origem` text DEFAULT 'manual' NOT NULL,
	CONSTRAINT "btc_precos_data" CHECK(("btc_precos"."data" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND substr("btc_precos"."data", 6, 2) BETWEEN '01' AND '12' AND substr("btc_precos"."data", 9, 2) BETWEEN '01' AND '31')),
	CONSTRAINT "btc_precos_preco_positivo" CHECK("btc_precos"."preco_centavos" > 0),
	CONSTRAINT "btc_precos_origem" CHECK("btc_precos"."origem" IN ('manual', 'implicito', 'api'))
);
--> statement-breakpoint
CREATE TABLE `cartoes` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`limite_centavos` integer DEFAULT 0 NOT NULL,
	`dia_fechamento` integer NOT NULL,
	`dia_vencimento` integer NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`removido_em` text,
	CONSTRAINT "cartoes_nome_preenchido" CHECK(length(trim("cartoes"."nome")) > 0),
	CONSTRAINT "cartoes_limite_nao_negativo" CHECK("cartoes"."limite_centavos" >= 0),
	CONSTRAINT "cartoes_dia_fechamento" CHECK("cartoes"."dia_fechamento" BETWEEN 1 AND 31),
	CONSTRAINT "cartoes_dia_vencimento" CHECK("cartoes"."dia_vencimento" BETWEEN 1 AND 31),
	CONSTRAINT "cartoes_ativo_bool" CHECK("cartoes"."ativo" IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `categorias` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`cor` text,
	`ordem` integer DEFAULT 0 NOT NULL,
	`arquivada` integer DEFAULT false NOT NULL,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "categorias_nome_preenchido" CHECK(length(trim("categorias"."nome")) > 0),
	CONSTRAINT "categorias_arquivada_bool" CHECK("categorias"."arquivada" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categorias_nome_unico` ON `categorias` (lower("nome"));--> statement-breakpoint
CREATE TABLE `compras` (
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
	CONSTRAINT "compras_descricao_preenchida" CHECK(length(trim("compras"."descricao")) > 0),
	CONSTRAINT "compras_data" CHECK(("compras"."data_compra" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND substr("compras"."data_compra", 6, 2) BETWEEN '01' AND '12' AND substr("compras"."data_compra", 9, 2) BETWEEN '01' AND '31')),
	CONSTRAINT "compras_valor_positivo" CHECK("compras"."valor_total_centavos" > 0),
	CONSTRAINT "compras_meio_valido" CHECK("compras"."meio" IN ('conta', 'cartao')),
	CONSTRAINT "compras_meio_coerente" CHECK(("compras"."meio" = 'conta' AND "compras"."conta_id" IS NOT NULL AND "compras"."cartao_id" IS NULL) OR ("compras"."meio" = 'cartao' AND "compras"."cartao_id" IS NOT NULL AND "compras"."conta_id" IS NULL)),
	CONSTRAINT "compras_num_parcelas" CHECK("compras"."num_parcelas" BETWEEN 1 AND 24)
);
--> statement-breakpoint
CREATE INDEX `compras_data_idx` ON `compras` (`data_compra`);--> statement-breakpoint
CREATE INDEX `compras_categoria_idx` ON `compras` (`categoria_id`);--> statement-breakpoint
CREATE TABLE `config` (
	`chave` text PRIMARY KEY NOT NULL,
	`valor` text NOT NULL,
	CONSTRAINT "config_valor_json" CHECK(json_valid("config"."valor"))
);
--> statement-breakpoint
CREATE TABLE `contas` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`tipo` text DEFAULT 'corrente' NOT NULL,
	`saldo_centavos` integer DEFAULT 0 NOT NULL,
	`ativa` integer DEFAULT true NOT NULL,
	`ordem` integer DEFAULT 0 NOT NULL,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`removido_em` text,
	CONSTRAINT "contas_nome_preenchido" CHECK(length(trim("contas"."nome")) > 0),
	CONSTRAINT "contas_tipo_valido" CHECK("contas"."tipo" IN ('corrente', 'poupanca', 'investimento', 'dinheiro', 'outro')),
	CONSTRAINT "contas_ativa_bool" CHECK("contas"."ativa" IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `faturas` (
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
	CONSTRAINT "faturas_mes_vencimento" CHECK(("faturas"."mes_vencimento" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr("faturas"."mes_vencimento", 6, 2) BETWEEN '01' AND '12')),
	CONSTRAINT "faturas_data_fechamento" CHECK(("faturas"."data_fechamento" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND substr("faturas"."data_fechamento", 6, 2) BETWEEN '01' AND '12' AND substr("faturas"."data_fechamento", 9, 2) BETWEEN '01' AND '31')),
	CONSTRAINT "faturas_data_vencimento" CHECK(("faturas"."data_vencimento" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND substr("faturas"."data_vencimento", 6, 2) BETWEEN '01' AND '12' AND substr("faturas"."data_vencimento", 9, 2) BETWEEN '01' AND '31')),
	CONSTRAINT "faturas_paga_em" CHECK("faturas"."paga_em" IS NULL OR ("faturas"."paga_em" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND substr("faturas"."paga_em", 6, 2) BETWEEN '01' AND '12' AND substr("faturas"."paga_em", 9, 2) BETWEEN '01' AND '31')),
	CONSTRAINT "faturas_valor_pago" CHECK("faturas"."valor_pago_centavos" IS NULL OR "faturas"."valor_pago_centavos" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `faturas_cartao_mes_unico` ON `faturas` (`cartao_id`,`mes_vencimento`);--> statement-breakpoint
CREATE TABLE `limites_mensais` (
	`mes` text PRIMARY KEY NOT NULL,
	`valor_centavos` integer NOT NULL,
	CONSTRAINT "limites_mensais_mes" CHECK("limites_mensais"."mes" = 'padrao' OR ("limites_mensais"."mes" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr("limites_mensais"."mes", 6, 2) BETWEEN '01' AND '12')),
	CONSTRAINT "limites_mensais_valor" CHECK("limites_mensais"."valor_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE `parcelas` (
	`id` text PRIMARY KEY NOT NULL,
	`compra_id` text NOT NULL,
	`numero` integer NOT NULL,
	`valor_centavos` integer NOT NULL,
	`mes_competencia` text NOT NULL,
	`fatura_id` text,
	FOREIGN KEY (`compra_id`) REFERENCES `compras`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fatura_id`) REFERENCES `faturas`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "parcelas_numero" CHECK("parcelas"."numero" BETWEEN 1 AND 24),
	CONSTRAINT "parcelas_mes_competencia" CHECK(("parcelas"."mes_competencia" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr("parcelas"."mes_competencia", 6, 2) BETWEEN '01' AND '12'))
);
--> statement-breakpoint
CREATE INDEX `parcelas_mes_competencia_idx` ON `parcelas` (`mes_competencia`);--> statement-breakpoint
CREATE INDEX `parcelas_fatura_idx` ON `parcelas` (`fatura_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `parcelas_compra_numero_unico` ON `parcelas` (`compra_id`,`numero`);--> statement-breakpoint
CREATE TABLE `saldos_historico` (
	`id` text PRIMARY KEY NOT NULL,
	`conta_id` text NOT NULL,
	`saldo_centavos` integer NOT NULL,
	`registrado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`conta_id`) REFERENCES `contas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `saldos_historico_conta_data_idx` ON `saldos_historico` (`conta_id`,`registrado_em`);