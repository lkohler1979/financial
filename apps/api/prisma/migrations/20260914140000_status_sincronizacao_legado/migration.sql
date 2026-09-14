-- CreateEnum
CREATE TYPE "StatusSincronizacaoLegado" AS ENUM ('PENDENTE', 'SINCRONIZADO');

-- AlterTable: rastreia se Matrícula/Parcela já foram conferidas contra o
-- sistema legado ao menos uma vez (decisão do usuário, 2026-09-14).
ALTER TABLE "matriculas"
  ADD COLUMN "status_sincronizacao_legado" "StatusSincronizacaoLegado" NOT NULL DEFAULT 'PENDENTE';

ALTER TABLE "parcelas"
  ADD COLUMN "status_sincronizacao_legado" "StatusSincronizacaoLegado" NOT NULL DEFAULT 'PENDENTE';
