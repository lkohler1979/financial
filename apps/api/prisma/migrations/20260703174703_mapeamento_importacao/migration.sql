-- CreateEnum
CREATE TYPE "TabelaDestinoImportacao" AS ENUM ('ALUNO', 'MATRICULA', 'PARCELA');

-- CreateEnum
CREATE TYPE "AcaoColunaAusente" AS ENUM ('VALOR_PADRAO', 'NAO_IMPORTAR');

-- CreateTable
CREATE TABLE "mapeamentos_importacao" (
    "id" TEXT NOT NULL,
    "coluna_planilha" TEXT NOT NULL,
    "tabela_destino" "TabelaDestinoImportacao" NOT NULL,
    "campo_destino" TEXT NOT NULL,
    "acao_ausente" "AcaoColunaAusente" NOT NULL DEFAULT 'NAO_IMPORTAR',
    "valor_padrao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mapeamentos_importacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mapeamentos_importacao_coluna_planilha_key" ON "mapeamentos_importacao"("coluna_planilha");

-- CreateIndex
CREATE UNIQUE INDEX "mapeamentos_importacao_tabela_destino_campo_destino_key" ON "mapeamentos_importacao"("tabela_destino", "campo_destino");
