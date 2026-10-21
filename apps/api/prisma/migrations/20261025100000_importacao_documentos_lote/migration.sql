-- CreateEnum
CREATE TYPE "StatusLoteDocumentos" AS ENUM ('EM_ANDAMENTO', 'CONCLUIDO', 'FALHOU', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ResultadoItemDocumentos" AS ENUM ('PENDENTE', 'CONCLUIDO', 'ERRO');

-- CreateTable
CREATE TABLE "importacoes_documentos_lote" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "status" "StatusLoteDocumentos" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "total" INTEGER NOT NULL,
    "processados" INTEGER NOT NULL DEFAULT 0,
    "baixados" INTEGER NOT NULL DEFAULT 0,
    "ja_importados" INTEGER NOT NULL DEFAULT 0,
    "mantidos" INTEGER NOT NULL DEFAULT 0,
    "sem_documento" INTEGER NOT NULL DEFAULT 0,
    "erros_documentos" INTEGER NOT NULL DEFAULT 0,
    "alunos_com_erro" INTEGER NOT NULL DEFAULT 0,
    "mensagem_falha" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "finalizado_em" TIMESTAMP(3),

    CONSTRAINT "importacoes_documentos_lote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importacoes_documentos_itens" (
    "id" TEXT NOT NULL,
    "lote_id" TEXT NOT NULL,
    "aluno_id" TEXT NOT NULL,
    "aluno_nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "resultado" "ResultadoItemDocumentos" NOT NULL DEFAULT 'PENDENTE',
    "baixados" INTEGER NOT NULL DEFAULT 0,
    "ja_importados" INTEGER NOT NULL DEFAULT 0,
    "mantidos" INTEGER NOT NULL DEFAULT 0,
    "sem_documento" INTEGER NOT NULL DEFAULT 0,
    "erros" INTEGER NOT NULL DEFAULT 0,
    "mensagem" TEXT,
    "processado_em" TIMESTAMP(3),

    CONSTRAINT "importacoes_documentos_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "importacoes_documentos_itens_lote_id_resultado_idx" ON "importacoes_documentos_itens"("lote_id", "resultado");

-- AddForeignKey
ALTER TABLE "importacoes_documentos_lote" ADD CONSTRAINT "importacoes_documentos_lote_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importacoes_documentos_itens" ADD CONSTRAINT "importacoes_documentos_itens_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "importacoes_documentos_lote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

