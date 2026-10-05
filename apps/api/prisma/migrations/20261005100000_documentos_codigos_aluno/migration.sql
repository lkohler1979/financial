-- CreateEnum
CREATE TYPE "EscopoDocumento" AS ENUM ('ALUNO', 'MATRICULA');

-- CreateEnum
CREATE TYPE "SituacaoEntregaDocumento" AS ENUM ('NAO_ENVIADO', 'ENVIADO');

-- CreateEnum
CREATE TYPE "SituacaoDeferimentoDocumento" AS ENUM ('PENDENTE', 'DEFERIDO', 'INDEFERIDO');

-- AlterTable
ALTER TABLE "alunos" ADD COLUMN     "agente_educacional_id" TEXT,
ADD COLUMN     "cidade_nascimento" TEXT,
ADD COLUMN     "codigo" TEXT,
ADD COLUMN     "data_nascimento" TIMESTAMP(3),
ADD COLUMN     "empresa" TEXT,
ADD COLUMN     "estado_nascimento" TEXT,
ADD COLUMN     "genero" TEXT,
ADD COLUMN     "mediador" TEXT,
ADD COLUMN     "necessidades_especiais" TEXT,
ADD COLUMN     "nome_mae" TEXT,
ADD COLUMN     "nome_pai" TEXT,
ADD COLUMN     "numero_documento_identificacao" TEXT,
ADD COLUMN     "origem_cadastro" TEXT,
ADD COLUMN     "profissao" TEXT,
ADD COLUMN     "tipo_documento_identificacao" TEXT;

-- AlterTable
ALTER TABLE "matriculas" ADD COLUMN     "agente_educacional_id" TEXT;

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "pode_deferir_documentos" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "sequenciais" (
    "chave" TEXT NOT NULL,
    "valor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sequenciais_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "tipos_documento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "escopo" "EscopoDocumento" NOT NULL,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipos_documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos" (
    "id" TEXT NOT NULL,
    "tipo_documento_id" TEXT NOT NULL,
    "aluno_id" TEXT NOT NULL,
    "matricula_id" TEXT,
    "situacao_entrega" "SituacaoEntregaDocumento" NOT NULL DEFAULT 'NAO_ENVIADO',
    "situacao_deferimento" "SituacaoDeferimentoDocumento" NOT NULL DEFAULT 'PENDENTE',
    "vencimento" TIMESTAMP(3),
    "anexado_em" TIMESTAMP(3),
    "deferido_em" TIMESTAMP(3),
    "validado_por_id" TEXT,
    "observacao_interna" TEXT,
    "observacao_aluno" TEXT,
    "arquivo_nome" TEXT,
    "arquivo_chave" TEXT,
    "arquivo_mime" TEXT,
    "arquivo_tamanho" INTEGER,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipos_documento_nome_key" ON "tipos_documento"("nome");

-- CreateIndex
CREATE INDEX "documentos_aluno_id_idx" ON "documentos"("aluno_id");

-- CreateIndex
CREATE INDEX "documentos_matricula_id_idx" ON "documentos"("matricula_id");

-- CreateIndex
CREATE UNIQUE INDEX "alunos_codigo_key" ON "alunos"("codigo");

-- AddForeignKey
ALTER TABLE "alunos" ADD CONSTRAINT "alunos_agente_educacional_id_fkey" FOREIGN KEY ("agente_educacional_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matriculas" ADD CONSTRAINT "matriculas_agente_educacional_id_fkey" FOREIGN KEY ("agente_educacional_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_tipo_documento_id_fkey" FOREIGN KEY ("tipo_documento_id") REFERENCES "tipos_documento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_aluno_id_fkey" FOREIGN KEY ("aluno_id") REFERENCES "alunos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_matricula_id_fkey" FOREIGN KEY ("matricula_id") REFERENCES "matriculas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_validado_por_id_fkey" FOREIGN KEY ("validado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- DataMigration: tipos de documento iniciais (todos obrigatórios).
INSERT INTO "tipos_documento" ("id","nome","escopo","obrigatorio","ordem","ativo") VALUES
  (gen_random_uuid()::text,'CPF','ALUNO',true,1,true),
  (gen_random_uuid()::text,'RG','ALUNO',true,2,true),
  (gen_random_uuid()::text,'Comprovante de Residência','ALUNO',true,3,true),
  (gen_random_uuid()::text,'Contrato de Prestação de Serviços','MATRICULA',true,4,true);

-- DataMigration: código dos alunos já existentes = ano do cadastro + sequencial
-- de 5 dígitos (por ano, na ordem de criação).
WITH numerados AS (
  SELECT id, EXTRACT(YEAR FROM "criado_em")::int AS ano,
         ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM "criado_em") ORDER BY "criado_em", id) AS seq
  FROM "alunos"
)
UPDATE "alunos" a SET "codigo" = n.ano::text || LPAD(n.seq::text, 5, '0')
FROM numerados n WHERE a.id = n.id;

-- DataMigration: número das matrículas que ainda não têm (ano da matrícula,
-- ou ano corrente se sem data). Matrículas com número vindo do legado ficam.
WITH numeradas AS (
  SELECT id, EXTRACT(YEAR FROM COALESCE("data_matricula", NOW()))::int AS ano,
         ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM COALESCE("data_matricula", NOW())) ORDER BY "data_matricula", id) AS seq
  FROM "matriculas" WHERE "numero_matricula" IS NULL
)
UPDATE "matriculas" m SET "numero_matricula" = n.ano::text || LPAD(n.seq::text, 5, '0')
FROM numeradas n WHERE m.id = n.id;

-- DataMigration: contadores já avançados até o último código gerado por ano.
INSERT INTO "sequenciais" ("chave","valor")
SELECT 'ALUNO-' || SUBSTRING("codigo",1,4), MAX(SUBSTRING("codigo",5)::int)
FROM "alunos" WHERE "codigo" ~ '^[0-9]{9}$' GROUP BY SUBSTRING("codigo",1,4);

INSERT INTO "sequenciais" ("chave","valor")
SELECT 'MATRICULA-' || SUBSTRING("numero_matricula",1,4), MAX(SUBSTRING("numero_matricula",5)::int)
FROM "matriculas" WHERE "numero_matricula" ~ '^[0-9]{9}$' GROUP BY SUBSTRING("numero_matricula",1,4)
ON CONFLICT ("chave") DO UPDATE SET "valor" = GREATEST("sequenciais"."valor", EXCLUDED."valor");
