CREATE TABLE `metas` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`alvo_centavos` integer NOT NULL,
	`prazo` text,
	`cor` text,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`removido_em` text,
	CONSTRAINT "metas_nome_preenchido" CHECK(length(trim("metas"."nome")) > 0),
	CONSTRAINT "metas_alvo_positivo" CHECK(typeof("metas"."alvo_centavos") = 'integer' AND "metas"."alvo_centavos" > 0),
	CONSTRAINT "metas_prazo" CHECK("metas"."prazo" IS NULL OR (typeof("metas"."prazo") = 'text' AND "metas"."prazo" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND date("metas"."prazo") IS "metas"."prazo")),
	CONSTRAINT "metas_cor" CHECK("metas"."cor" IS NULL OR "metas"."cor" IN ('c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'))
);
--> statement-breakpoint
CREATE TABLE `metas_movimentos` (
	`id` text PRIMARY KEY NOT NULL,
	`meta_id` text NOT NULL,
	`valor_centavos` integer NOT NULL,
	`data` text NOT NULL,
	`nota` text,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`removido_em` text,
	FOREIGN KEY (`meta_id`) REFERENCES `metas`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "metas_mov_valor" CHECK(typeof("metas_movimentos"."valor_centavos") = 'integer' AND "metas_movimentos"."valor_centavos" <> 0),
	CONSTRAINT "metas_mov_data" CHECK((typeof("metas_movimentos"."data") = 'text' AND "metas_movimentos"."data" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND date("metas_movimentos"."data") IS "metas_movimentos"."data")),
	CONSTRAINT "metas_mov_nota" CHECK("metas_movimentos"."nota" IS NULL OR length(trim("metas_movimentos"."nota")) > 0)
);
--> statement-breakpoint
CREATE INDEX `metas_mov_meta_idx` ON `metas_movimentos` (`meta_id`);