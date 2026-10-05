-- AlterTable
ALTER TABLE "cursos" ADD COLUMN     "grau_ensino" TEXT;

-- CreateTable
CREATE TABLE "tipos_cobranca" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT false,
    "usa_valor_do_curso" BOOLEAN NOT NULL DEFAULT false,
    "valor_padrao" DECIMAL(12,2),
    "opcoes_parcelas" INTEGER[],
    "prefixo_titulo" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipos_cobranca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipos_cobranca_nome_key" ON "tipos_cobranca"("nome");


-- DataMigration: tipos iniciais (Universa: Mensalidade obrigatoria, Matricula opcional).
INSERT INTO "tipos_cobranca" ("id","nome","obrigatorio","usa_valor_do_curso","valor_padrao","opcoes_parcelas","prefixo_titulo","ordem","ativo") VALUES
  (gen_random_uuid()::text, 'Mensalidade', true, true, NULL, ARRAY[1,6,9,12,15,18], NULL, 1, true),
  (gen_random_uuid()::text, 'Taxa de matrícula', false, false, 49.90, ARRAY[1], 'TM', 2, true);
