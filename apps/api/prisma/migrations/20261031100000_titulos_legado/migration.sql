-- CreateEnum
CREATE TYPE "StatusLoteTitulos" AS ENUM ('EM_ANDAMENTO', 'CONCLUIDO', 'FALHOU');

-- CreateTable
CREATE TABLE "titulos_legado" (
    "id" TEXT NOT NULL,
    "aluno_id" TEXT NOT NULL,
    "cod_titulo" TEXT NOT NULL,
    "parcela" TEXT NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "valor_pago" DECIMAL(12,2),
    "tipo_titulo" TEXT,
    "tipo_titulo_id_legado" INTEGER,
    "status" "StatusParcela" NOT NULL DEFAULT 'EM_ABERTO',
    "data_pagamento" TIMESTAMP(3),
    "descricao_legado" TEXT,
    "curso_legado_nome" TEXT,
    "alunocurso_id_legado" TEXT,
    "estado_legado" TEXT,
    "multa_legado" DECIMAL(12,2),
    "juros_legado" DECIMAL(12,2),
    "total_legado" DECIMAL(12,2),
    "desconto_legado" DECIMAL(12,2),
    "boleto_legado_id" TEXT,
    "boleto_legado_hash" TEXT,
    "remessa_legado_id" TEXT,
    "data_pagamento_legado" TIMESTAMP(3),
    "data_baixa_legado" TIMESTAMP(3),
    "titulo_observacoes_legado" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "titulos_legado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importacoes_titulos_lote" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "status" "StatusLoteTitulos" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "total" INTEGER NOT NULL,
    "processados" INTEGER NOT NULL DEFAULT 0,
    "parcelas_novas" INTEGER NOT NULL DEFAULT 0,
    "titulos_sem_matricula" INTEGER NOT NULL DEFAULT 0,
    "ja_importados" INTEGER NOT NULL DEFAULT 0,
    "ignorados" INTEGER NOT NULL DEFAULT 0,
    "alunos_nao_encontrados" INTEGER NOT NULL DEFAULT 0,
    "alunos_com_erro" INTEGER NOT NULL DEFAULT 0,
    "problemas" JSONB,
    "mensagem_falha" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "finalizado_em" TIMESTAMP(3),

    CONSTRAINT "importacoes_titulos_lote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "titulos_legado_aluno_id_idx" ON "titulos_legado"("aluno_id");

-- CreateIndex
CREATE UNIQUE INDEX "titulos_legado_aluno_id_cod_titulo_key" ON "titulos_legado"("aluno_id", "cod_titulo");

-- AddForeignKey
ALTER TABLE "titulos_legado" ADD CONSTRAINT "titulos_legado_aluno_id_fkey" FOREIGN KEY ("aluno_id") REFERENCES "alunos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importacoes_titulos_lote" ADD CONSTRAINT "importacoes_titulos_lote_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

