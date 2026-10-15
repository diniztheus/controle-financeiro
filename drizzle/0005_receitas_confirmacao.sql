ALTER TABLE `receitas` ADD `confirmada_em` text;
--> statement-breakpoint
-- Tudo que já existia foi lançado por você ou já gerado antes desta mudança: conta como recebido.
UPDATE `receitas` SET `confirmada_em` = `criado_em` WHERE `confirmada_em` IS NULL;
