-- AlterTable
ALTER TABLE "configuracoes" ADD COLUMN     "juros_contar_dia_geracao" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "juros_diario_percentual" DECIMAL(6,3) NOT NULL DEFAULT 0.033,
ADD COLUMN     "multa_percentual" DECIMAL(5,2) NOT NULL DEFAULT 2;
