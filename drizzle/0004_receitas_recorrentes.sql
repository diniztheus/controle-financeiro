CREATE TABLE `receitas_recorrentes` (
	`id` text PRIMARY KEY NOT NULL,
	`descricao` text,
	`categoria` text NOT NULL,
	`valor_centavos` integer NOT NULL,
	`dia_do_mes` integer NOT NULL,
	`inicio` text NOT NULL,
	`fim` text,
	`conta_id` text,
	`ativa` integer DEFAULT true NOT NULL,
	`observacao` text,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`removido_em` text,
	FOREIGN KEY (`conta_id`) REFERENCES `contas`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "receitas_rec_descricao_preenchida" CHECK("receitas_recorrentes"."descricao" IS NULL OR length(trim("receitas_recorrentes"."descricao")) > 0),
	CONSTRAINT "receitas_rec_categoria_preenchida" CHECK(length(trim("receitas_recorrentes"."categoria")) > 0),
	CONSTRAINT "receitas_rec_valor_positivo" CHECK(typeof("receitas_recorrentes"."valor_centavos") = 'integer' AND "receitas_recorrentes"."valor_centavos" > 0),
	CONSTRAINT "receitas_rec_dia" CHECK(typeof("receitas_recorrentes"."dia_do_mes") = 'integer' AND "receitas_recorrentes"."dia_do_mes" BETWEEN 1 AND 31),
	CONSTRAINT "receitas_rec_inicio" CHECK((typeof("receitas_recorrentes"."inicio") = 'text' AND "receitas_recorrentes"."inicio" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND date("receitas_recorrentes"."inicio") IS "receitas_recorrentes"."inicio")),
	CONSTRAINT "receitas_rec_fim" CHECK("receitas_recorrentes"."fim" IS NULL OR ((typeof("receitas_recorrentes"."fim") = 'text' AND "receitas_recorrentes"."fim" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND date("receitas_recorrentes"."fim") IS "receitas_recorrentes"."fim") AND "receitas_recorrentes"."fim" >= "receitas_recorrentes"."inicio")),
	CONSTRAINT "receitas_rec_ativa" CHECK((typeof("receitas_recorrentes"."ativa") = 'integer' AND "receitas_recorrentes"."ativa" IN (0, 1)))
);
--> statement-breakpoint
ALTER TABLE `receitas` ADD `recorrente_id` text REFERENCES receitas_recorrentes(id);--> statement-breakpoint
CREATE UNIQUE INDEX `receitas_recorrente_data_unico` ON `receitas` (`recorrente_id`,`data`) WHERE "receitas"."recorrente_id" IS NOT NULL;