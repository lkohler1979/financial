-- CreateEnum
CREATE TYPE "AsaasAmbiente" AS ENUM ('SANDBOX', 'PRODUCAO');

-- AlterTable
ALTER TABLE "alunos" ADD COLUMN     "asaas_customer_id" TEXT;

-- AlterTable
ALTER TABLE "configuracoes" ADD COLUMN     "asaas_ambiente" "AsaasAmbiente" NOT NULL DEFAULT 'SANDBOX',
ADD COLUMN     "asaas_api_key_criptografada" TEXT,
ADD COLUMN     "asaas_webhook_token_criptografado" TEXT;

-- AlterTable
ALTER TABLE "cursos" ADD COLUMN     "valor_padrao" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "matriculas" ADD COLUMN     "dia_vencimento" INTEGER,
ADD COLUMN     "numero_parcelas" INTEGER,
ADD COLUMN     "valor_curso" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "parcelas" ADD COLUMN     "asaas_boleto_url" TEXT,
ADD COLUMN     "asaas_data_geracao" TIMESTAMP(3),
ADD COLUMN     "asaas_linha_digitavel" TEXT,
ADD COLUMN     "asaas_payment_id" TEXT,
ADD COLUMN     "asaas_status" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "alunos_asaas_customer_id_key" ON "alunos"("asaas_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "parcelas_asaas_payment_id_key" ON "parcelas"("asaas_payment_id");
