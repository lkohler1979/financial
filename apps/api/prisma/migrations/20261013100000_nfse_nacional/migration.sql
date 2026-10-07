-- CreateEnum
CREATE TYPE "NfseProvedor" AS ENUM ('ASAAS', 'NACIONAL');

-- CreateEnum
CREATE TYPE "NfseAmbiente" AS ENUM ('HOMOLOGACAO', 'PRODUCAO');

-- AlterTable
ALTER TABLE "configuracoes" ADD COLUMN     "nfse_aliquota_simples" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "nfse_ambiente" "NfseAmbiente" NOT NULL DEFAULT 'HOMOLOGACAO',
ADD COLUMN     "nfse_certificado_cnpj" TEXT,
ADD COLUMN     "nfse_certificado_criptografado" TEXT,
ADD COLUMN     "nfse_certificado_senha_criptografada" TEXT,
ADD COLUMN     "nfse_certificado_titular" TEXT,
ADD COLUMN     "nfse_certificado_valido_ate" TIMESTAMP(3),
ADD COLUMN     "nfse_codigo_tributacao_municipal" TEXT,
ADD COLUMN     "nfse_municipio_ibge" TEXT,
ADD COLUMN     "nfse_opcao_simples" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "nfse_prestador_cnpj" TEXT,
ADD COLUMN     "nfse_prestador_email" TEXT,
ADD COLUMN     "nfse_prestador_inscricao_municipal" TEXT,
ADD COLUMN     "nfse_prestador_telefone" TEXT,
ADD COLUMN     "nfse_provedor" "NfseProvedor" NOT NULL DEFAULT 'ASAAS',
ADD COLUMN     "nfse_proximo_numero_dps" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "nfse_regime_apuracao_sn" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "nfse_regime_especial" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nfse_serie_dps" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "parcelas" ADD COLUMN     "nfse_chave_acesso" TEXT,
ADD COLUMN     "nfse_numero_dps" INTEGER,
ADD COLUMN     "nfse_serie_dps" INTEGER,
ADD COLUMN     "nfse_xml" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "parcelas_nfse_chave_acesso_key" ON "parcelas"("nfse_chave_acesso");

