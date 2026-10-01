-- CreateEnum
CREATE TYPE "AsaasBillingType" AS ENUM ('BOLETO', 'PIX', 'CREDIT_CARD');

-- AlterTable
ALTER TABLE "configuracoes" ADD COLUMN     "asaas_metodos_aceitos" "AsaasBillingType"[] NOT NULL DEFAULT ARRAY['BOLETO', 'PIX', 'CREDIT_CARD']::"AsaasBillingType"[];
