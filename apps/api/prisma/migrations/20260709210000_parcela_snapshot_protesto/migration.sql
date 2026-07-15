-- Congela multa/juros/total efetivamente usados no documento de protesto
-- gerado para a parcela, evitando que a Ficha de Cobrança divirja do
-- documento já gerado ao recalcular com a data de hoje (decisão do usuário,
-- 2026-07-09: os dois precisam ser sempre iguais).
ALTER TABLE "parcelas" ADD COLUMN "multa_protesto" DECIMAL(12,2);
ALTER TABLE "parcelas" ADD COLUMN "juros_protesto" DECIMAL(12,2);
ALTER TABLE "parcelas" ADD COLUMN "total_protesto" DECIMAL(12,2);
