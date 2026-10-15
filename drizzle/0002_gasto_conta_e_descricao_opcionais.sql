PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_compras` (
	`id` text PRIMARY KEY NOT NULL,
	`descricao` text,
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
	CONSTRAINT "compras_descricao_preenchida" CHECK("__new_compras"."descricao" IS NULL OR length(trim("__new_compras"."descricao")) > 0),
	CONSTRAINT "compras_data" CHECK((typeof("__new_compras"."data_compra") = 'text' AND "__new_compras"."data_compra" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND date("__new_compras"."data_compra") IS "__new_compras"."data_compra")),
	CONSTRAINT "compras_valor_positivo" CHECK(typeof("__new_compras"."valor_total_centavos") = 'integer' AND "__new_compras"."valor_total_centavos" > 0),
	CONSTRAINT "compras_meio_valido" CHECK("__new_compras"."meio" IN ('conta', 'cartao')),
	CONSTRAINT "compras_meio_coerente" CHECK(("__new_compras"."meio" = 'conta' AND "__new_compras"."cartao_id" IS NULL) OR ("__new_compras"."meio" = 'cartao' AND "__new_compras"."cartao_id" IS NOT NULL AND "__new_compras"."conta_id" IS NULL)),
	CONSTRAINT "compras_num_parcelas" CHECK(typeof("__new_compras"."num_parcelas") = 'integer' AND "__new_compras"."num_parcelas" BETWEEN 1 AND 24)
);
--> statement-breakpoint
INSERT INTO `__new_compras`("id", "descricao", "categoria_id", "data_compra", "valor_total_centavos", "meio", "conta_id", "cartao_id", "num_parcelas", "observacao", "criado_em", "atualizado_em", "removido_em") SELECT "id", "descricao", "categoria_id", "data_compra", "valor_total_centavos", "meio", "conta_id", "cartao_id", "num_parcelas", "observacao", "criado_em", "atualizado_em", "removido_em" FROM `compras`;--> statement-breakpoint
DROP TABLE `compras`;--> statement-breakpoint
ALTER TABLE `__new_compras` RENAME TO `compras`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `compras_data_idx` ON `compras` (`data_compra`);--> statement-breakpoint
CREATE INDEX `compras_categoria_idx` ON `compras` (`categoria_id`);