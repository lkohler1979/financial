-- AlterTable
ALTER TABLE "configuracoes" ADD COLUMN     "nfse_ativa" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nfse_dia_limite" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "nfse_iss_percentual" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "nfse_municipal_service_id" TEXT,
ADD COLUMN     "nfse_servico_codigo" TEXT NOT NULL DEFAULT '08.01.01',
ADD COLUMN     "nfse_servico_descricao" TEXT NOT NULL DEFAULT 'PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS',
ADD COLUMN     "nfse_servico_nome" TEXT NOT NULL DEFAULT 'Ensino regular pré-escolar, fundamental e médio.';

-- AlterTable
ALTER TABLE "parcelas" ADD COLUMN     "nfse_asaas_id" TEXT,
ADD COLUMN     "nfse_competencia" TIMESTAMP(3),
ADD COLUMN     "nfse_emitida_em" TIMESTAMP(3),
ADD COLUMN     "nfse_erro" TEXT,
ADD COLUMN     "nfse_numero" TEXT,
ADD COLUMN     "nfse_pdf_url" TEXT,
ADD COLUMN     "nfse_status" TEXT;

-- AlterTable
ALTER TABLE "sacados" ADD COLUMN     "bairro" TEXT,
ADD COLUMN     "cep" TEXT,
ADD COLUMN     "complemento" TEXT,
ADD COLUMN     "endereco" TEXT,
ADD COLUMN     "numero" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "parcelas_nfse_asaas_id_key" ON "parcelas"("nfse_asaas_id");

