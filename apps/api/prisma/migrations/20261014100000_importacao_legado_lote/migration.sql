-- CreateEnum
CREATE TYPE "StatusLoteLegado" AS ENUM ('ENUMERANDO', 'IMPORTANDO', 'CONCLUIDO', 'FALHOU');

-- CreateTable
CREATE TABLE "importacoes_legado_lote" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "status" "StatusLoteLegado" NOT NULL DEFAULT 'ENUMERANDO',
    "limite" INTEGER,
    "consultas" INTEGER NOT NULL DEFAULT 0,
    "pessoas_encontradas" INTEGER NOT NULL DEFAULT 0,
    "pessoas_processadas" INTEGER NOT NULL DEFAULT 0,
    "sem_cpf" INTEGER NOT NULL DEFAULT 0,
    "alunos_criados" INTEGER NOT NULL DEFAULT 0,
    "matriculas_novas" INTEGER NOT NULL DEFAULT 0,
    "parcelas_novas" INTEGER NOT NULL DEFAULT 0,
    "parcelas_atualizadas" INTEGER NOT NULL DEFAULT 0,
    "erros" INTEGER NOT NULL DEFAULT 0,
    "cursos_sem_correspondencia" JSONB,
    "detalhes" JSONB,
    "mensagem_falha" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "finalizado_em" TIMESTAMP(3),

    CONSTRAINT "importacoes_legado_lote_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "importacoes_legado_lote" ADD CONSTRAINT "importacoes_legado_lote_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

