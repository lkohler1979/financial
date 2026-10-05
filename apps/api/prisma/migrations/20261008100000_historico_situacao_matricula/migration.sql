-- CreateTable
CREATE TABLE "historico_situacao_matricula" (
    "id" TEXT NOT NULL,
    "matricula_id" TEXT NOT NULL,
    "situacao_anterior" TEXT,
    "situacao_nova" TEXT NOT NULL,
    "periodo_letivo" TEXT,
    "motivo" TEXT,
    "observacoes" TEXT,
    "usuario_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historico_situacao_matricula_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "historico_situacao_matricula_matricula_id_idx" ON "historico_situacao_matricula"("matricula_id");

-- AddForeignKey
ALTER TABLE "historico_situacao_matricula" ADD CONSTRAINT "historico_situacao_matricula_matricula_id_fkey" FOREIGN KEY ("matricula_id") REFERENCES "matriculas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_situacao_matricula" ADD CONSTRAINT "historico_situacao_matricula_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- DataMigration: situações padronizadas (código em maiúsculas); "ATIVA" já é o valor corrente.
UPDATE "matriculas" SET "situacao" = 'ATIVA' WHERE UPPER("situacao") IN ('ATIVA','ATIVO');
