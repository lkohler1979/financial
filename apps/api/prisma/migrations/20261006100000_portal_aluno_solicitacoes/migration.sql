-- CreateEnum
CREATE TYPE "StatusSolicitacao" AS ENUM ('ABERTA', 'ATENDIDA', 'RECUSADA');

-- CreateTable
CREATE TABLE "tipos_solicitacao" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipos_solicitacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitacoes_documento" (
    "id" TEXT NOT NULL,
    "tipo_solicitacao_id" TEXT NOT NULL,
    "aluno_id" TEXT NOT NULL,
    "matricula_id" TEXT,
    "status" "StatusSolicitacao" NOT NULL DEFAULT 'ABERTA',
    "observacao_aluno" TEXT,
    "resposta_staff" TEXT,
    "arquivo_nome" TEXT,
    "arquivo_chave" TEXT,
    "arquivo_mime" TEXT,
    "arquivo_tamanho" INTEGER,
    "atendido_por_id" TEXT,
    "atendido_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitacoes_documento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipos_solicitacao_nome_key" ON "tipos_solicitacao"("nome");

-- CreateIndex
CREATE INDEX "solicitacoes_documento_aluno_id_idx" ON "solicitacoes_documento"("aluno_id");

-- CreateIndex
CREATE INDEX "solicitacoes_documento_status_idx" ON "solicitacoes_documento"("status");

-- AddForeignKey
ALTER TABLE "solicitacoes_documento" ADD CONSTRAINT "solicitacoes_documento_tipo_solicitacao_id_fkey" FOREIGN KEY ("tipo_solicitacao_id") REFERENCES "tipos_solicitacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_documento" ADD CONSTRAINT "solicitacoes_documento_aluno_id_fkey" FOREIGN KEY ("aluno_id") REFERENCES "alunos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_documento" ADD CONSTRAINT "solicitacoes_documento_matricula_id_fkey" FOREIGN KEY ("matricula_id") REFERENCES "matriculas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_documento" ADD CONSTRAINT "solicitacoes_documento_atendido_por_id_fkey" FOREIGN KEY ("atendido_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- DataMigration: tipos de solicitação iniciais da área do aluno.
INSERT INTO "tipos_solicitacao" ("id","nome","descricao","ordem","ativo") VALUES
  (gen_random_uuid()::text,'Declaração de matrícula','Comprova o vínculo do aluno com o curso',1,true),
  (gen_random_uuid()::text,'Declaração de pagamento / quitação','Comprova pagamentos realizados',2,true),
  (gen_random_uuid()::text,'Histórico escolar','Histórico de disciplinas e notas',3,true),
  (gen_random_uuid()::text,'Certificado de conclusão','Após a conclusão do curso',4,true);
