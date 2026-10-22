-- AlterTable
ALTER TABLE "parcelas" ADD COLUMN     "situacao_cobranca_id" TEXT;

-- CreateIndex
CREATE INDEX "parcelas_situacao_cobranca_id_idx" ON "parcelas"("situacao_cobranca_id");

-- AddForeignKey
ALTER TABLE "parcelas" ADD CONSTRAINT "parcelas_situacao_cobranca_id_fkey" FOREIGN KEY ("situacao_cobranca_id") REFERENCES "situacoes_cobranca"("id") ON DELETE SET NULL ON UPDATE CASCADE;

