-- CreateEnum
CREATE TYPE "TipoOcorrenciaLote" AS ENUM ('ALUNO_SEM_CPF', 'ALUNO_SEM_MATRICULA', 'CURSO_CRIADO', 'MATRICULA_NAO_REALIZADA', 'PARCELA_NAO_IMPORTADA', 'ERRO', 'VARREDURA_INCOMPLETA');

-- AlterTable
ALTER TABLE "importacoes_legado_lote" ADD COLUMN     "cursos_criados" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "importacoes_legado_ocorrencias" (
    "id" TEXT NOT NULL,
    "lote_id" TEXT NOT NULL,
    "tipo" "TipoOcorrenciaLote" NOT NULL,
    "pessoa_nome" TEXT,
    "cpf" TEXT,
    "pes_id" TEXT,
    "curso" TEXT,
    "titulo" TEXT,
    "motivo" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "importacoes_legado_ocorrencias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "importacoes_legado_ocorrencias_lote_id_tipo_idx" ON "importacoes_legado_ocorrencias"("lote_id", "tipo");

-- AddForeignKey
ALTER TABLE "importacoes_legado_ocorrencias" ADD CONSTRAINT "importacoes_legado_ocorrencias_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "importacoes_legado_lote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

