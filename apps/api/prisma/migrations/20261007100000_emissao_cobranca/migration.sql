-- CreateEnum
CREATE TYPE "EmissaoCobranca" AS ENUM ('TODAS', 'PRIMEIRA', 'SOB_DEMANDA');

-- AlterTable
ALTER TABLE "configuracoes" ADD COLUMN     "emissao_antecipada_dias" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "tipos_cobranca" ADD COLUMN     "emissao_na_matricula" "EmissaoCobranca" NOT NULL DEFAULT 'PRIMEIRA';


-- DataMigration: taxas já saem com todas as cobranças emitidas; renegociação só sob demanda.
UPDATE "tipos_cobranca" SET "emissao_na_matricula" = 'TODAS' WHERE "nome" = 'Taxa de matrícula';
UPDATE "tipos_cobranca" SET "emissao_na_matricula" = 'SOB_DEMANDA' WHERE "nome" = 'Renegociação';
