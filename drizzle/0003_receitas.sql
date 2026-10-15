CREATE TABLE `receitas` (
	`id` text PRIMARY KEY NOT NULL,
	`descricao` text,
	`categoria` text NOT NULL,
	`data` text NOT NULL,
	`valor_centavos` integer NOT NULL,
	`conta_id` text,
	`observacao` text,
	`criado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`atualizado_em` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`removido_em` text,
	FOREIGN KEY (`conta_id`) REFERENCES `contas`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "receitas_descricao_preenchida" CHECK("receitas"."descricao" IS NULL OR length(trim("receitas"."descricao")) > 0),
	CONSTRAINT "receitas_categoria_preenchida" CHECK(length(trim("receitas"."categoria")) > 0),
	CONSTRAINT "receitas_data" CHECK((typeof("receitas"."data") = 'text' AND "receitas"."data" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND date("receitas"."data") IS "receitas"."data")),
	CONSTRAINT "receitas_valor_positivo" CHECK(typeof("receitas"."valor_centavos") = 'integer' AND "receitas"."valor_centavos" > 0)
);
--> statement-breakpoint
CREATE INDEX `receitas_data_idx` ON `receitas` (`data`);