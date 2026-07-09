-- Remove "parcelas mínimas vencidas" como critério de elegibilidade (decisão
-- do usuário, 2026-07-06): dias de atraso já basta para detectar parcela
-- atrasada ou não. Backfill: linhas existentes de "configuracoes" com o
-- default antigo (dias_atraso = 0) passam para o novo default (90).

ALTER TABLE "configuracoes" DROP COLUMN "parcelas_minimas",
ALTER COLUMN "dias_atraso" SET DEFAULT 90;

UPDATE "configuracoes" SET "dias_atraso" = 90 WHERE "dias_atraso" = 0;

ALTER TABLE "relatorios_inadimplencia" DROP COLUMN "parcelas_minimas";
