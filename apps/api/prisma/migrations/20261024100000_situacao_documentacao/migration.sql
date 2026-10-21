-- CreateEnum
CREATE TYPE "SituacaoDocumentacao" AS ENUM ('SEM_DOCUMENTOS', 'DOCUMENTOS_PENDENTES', 'DOCUMENTACAO_COMPLETA');

-- AlterTable
ALTER TABLE "matriculas" ADD COLUMN     "situacao_documentacao" "SituacaoDocumentacao" NOT NULL DEFAULT 'SEM_DOCUMENTOS';

-- CreateIndex
CREATE INDEX "matriculas_situacao_documentacao_idx" ON "matriculas"("situacao_documentacao");

-- Situação das matrículas que já existem (mesma regra de documentos/situacao-documentacao.ts):
--  * nenhum documento enviado (da matrícula ou do aluno)            -> SEM_DOCUMENTOS
--  * algum tipo obrigatório ativo sem documento enviado e deferido,
--    ou algum documento enviado indeferido                          -> DOCUMENTOS_PENDENTES
--  * senão                                                          -> DOCUMENTACAO_COMPLETA
UPDATE "matriculas" m
SET "situacao_documentacao" = CASE
  WHEN NOT EXISTS (
    SELECT 1 FROM "documentos" d
    JOIN "tipos_documento" t ON t."id" = d."tipo_documento_id"
    WHERE t."ativo" AND d."situacao_entrega" = 'ENVIADO'
      AND ((t."escopo" = 'MATRICULA' AND d."matricula_id" = m."id")
        OR (t."escopo" = 'ALUNO' AND d."matricula_id" IS NULL AND d."aluno_id" = m."aluno_id"))
  ) THEN 'SEM_DOCUMENTOS'::"SituacaoDocumentacao"
  WHEN EXISTS (
    SELECT 1 FROM "tipos_documento" t
    WHERE t."ativo" AND t."obrigatorio" AND NOT EXISTS (
      SELECT 1 FROM "documentos" d
      WHERE d."tipo_documento_id" = t."id"
        AND d."situacao_entrega" = 'ENVIADO' AND d."situacao_deferimento" = 'DEFERIDO'
        AND ((t."escopo" = 'MATRICULA' AND d."matricula_id" = m."id")
          OR (t."escopo" = 'ALUNO' AND d."matricula_id" IS NULL AND d."aluno_id" = m."aluno_id"))
    )
  ) OR EXISTS (
    SELECT 1 FROM "documentos" d
    JOIN "tipos_documento" t ON t."id" = d."tipo_documento_id"
    WHERE t."ativo" AND d."situacao_entrega" = 'ENVIADO' AND d."situacao_deferimento" = 'INDEFERIDO'
      AND ((t."escopo" = 'MATRICULA' AND d."matricula_id" = m."id")
        OR (t."escopo" = 'ALUNO' AND d."matricula_id" IS NULL AND d."aluno_id" = m."aluno_id"))
  ) THEN 'DOCUMENTOS_PENDENTES'::"SituacaoDocumentacao"
  ELSE 'DOCUMENTACAO_COMPLETA'::"SituacaoDocumentacao"
END;
