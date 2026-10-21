-- CreateEnum
CREATE TYPE "ClicksignAmbiente" AS ENUM ('SANDBOX', 'PRODUCAO');

-- CreateEnum
CREATE TYPE "ClicksignAutenticacao" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'ICP_BRASIL');

-- CreateEnum
CREATE TYPE "StatusContrato" AS ENUM ('ENVIADO', 'ASSINADO', 'RECUSADO', 'CANCELADO');

-- AlterTable
ALTER TABLE "configuracoes" ADD COLUMN     "clicksign_ambiente" "ClicksignAmbiente" NOT NULL DEFAULT 'SANDBOX',
ADD COLUMN     "clicksign_autenticacao" "ClicksignAutenticacao" NOT NULL DEFAULT 'EMAIL',
ADD COLUMN     "clicksign_escola_cpf" TEXT,
ADD COLUMN     "clicksign_escola_email" TEXT,
ADD COLUMN     "clicksign_escola_nome" TEXT,
ADD COLUMN     "clicksign_hmac_criptografado" TEXT,
ADD COLUMN     "clicksign_token_criptografado" TEXT,
ADD COLUMN     "contrato_modelo_chave" TEXT,
ADD COLUMN     "contrato_modelo_nome" TEXT;

-- CreateTable
CREATE TABLE "contratos_matricula" (
    "id" TEXT NOT NULL,
    "matricula_id" TEXT NOT NULL,
    "status" "StatusContrato" NOT NULL DEFAULT 'ENVIADO',
    "envelope_id" TEXT,
    "documento_clicksign_id" TEXT,
    "contratante_nome" TEXT NOT NULL,
    "contratante_email" TEXT NOT NULL,
    "autenticacao" "ClicksignAutenticacao" NOT NULL,
    "arquivo_gerado_chave" TEXT NOT NULL,
    "arquivo_assinado_chave" TEXT,
    "enviado_por_id" TEXT,
    "enviado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assinado_em" TIMESTAMP(3),
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contratos_matricula_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contratos_matricula_matricula_id_idx" ON "contratos_matricula"("matricula_id");

-- CreateIndex
CREATE INDEX "contratos_matricula_envelope_id_idx" ON "contratos_matricula"("envelope_id");

-- AddForeignKey
ALTER TABLE "contratos_matricula" ADD CONSTRAINT "contratos_matricula_matricula_id_fkey" FOREIGN KEY ("matricula_id") REFERENCES "matriculas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

