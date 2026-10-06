-- AlterTable
ALTER TABLE "configuracoes" ADD COLUMN     "rede_cartao_max_parcelas" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "parcelas" ADD COLUMN     "cartao_bandeira" TEXT,
ADD COLUMN     "cartao_final" TEXT,
ADD COLUMN     "cartao_parcelas" INTEGER;

