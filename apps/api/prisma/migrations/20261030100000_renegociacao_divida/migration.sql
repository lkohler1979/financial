-- AlterTable
ALTER TABLE "parcelas" ADD COLUMN     "origem_renegociacao_id" TEXT,
ADD COLUMN     "renegociada_em_id" TEXT;

-- CreateTable
CREATE TABLE "renegociacoes" (
    "id" TEXT NOT NULL,
    "matricula_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "valor_original" DECIMAL(12,2) NOT NULL,
    "multa" DECIMAL(12,2) NOT NULL,
    "juros" DECIMAL(12,2) NOT NULL,
    "total_devido" DECIMAL(12,2) NOT NULL,
    "desconto" DECIMAL(12,2) NOT NULL,
    "valor_negociado" DECIMAL(12,2) NOT NULL,
    "numero_parcelas" INTEGER NOT NULL,
    "primeiro_vencimento" TIMESTAMP(3) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "renegociacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "renegociacoes_matricula_id_numero_key" ON "renegociacoes"("matricula_id", "numero");

-- CreateIndex
CREATE INDEX "parcelas_renegociada_em_id_idx" ON "parcelas"("renegociada_em_id");

-- CreateIndex
CREATE INDEX "parcelas_origem_renegociacao_id_idx" ON "parcelas"("origem_renegociacao_id");

-- AddForeignKey
ALTER TABLE "parcelas" ADD CONSTRAINT "parcelas_renegociada_em_id_fkey" FOREIGN KEY ("renegociada_em_id") REFERENCES "renegociacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcelas" ADD CONSTRAINT "parcelas_origem_renegociacao_id_fkey" FOREIGN KEY ("origem_renegociacao_id") REFERENCES "renegociacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renegociacoes" ADD CONSTRAINT "renegociacoes_matricula_id_fkey" FOREIGN KEY ("matricula_id") REFERENCES "matriculas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renegociacoes" ADD CONSTRAINT "renegociacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

