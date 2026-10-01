-- Multa/juros/total calculados pelo próprio sistema legado — quando
-- presentes, o Ethos nunca recalcula multa/juros para a parcela, sempre usa
-- estes valores (decisão do usuário, 2026-09-15).
ALTER TABLE "parcelas" ADD COLUMN "multa_legado" DECIMAL(12,2);
ALTER TABLE "parcelas" ADD COLUMN "juros_legado" DECIMAL(12,2);
ALTER TABLE "parcelas" ADD COLUMN "total_legado" DECIMAL(12,2);
