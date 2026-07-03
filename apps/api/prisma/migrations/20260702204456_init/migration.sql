-- CreateEnum
CREATE TYPE "PerfilUsuario" AS ENUM ('ADMINISTRADOR', 'OPERADOR');

-- CreateEnum
CREATE TYPE "StatusParcela" AS ENUM ('EM_ABERTO', 'PAGO', 'CANCELADO', 'PROTESTADO', 'RENEGOCIADO');

-- CreateEnum
CREATE TYPE "FrequenciaImportacao" AS ENUM ('MANUAL', 'SEMANAL', 'MENSAL');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "perfil" "PerfilUsuario" NOT NULL DEFAULT 'OPERADOR',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alunos" (
    "id" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo_pessoa" TEXT,
    "email" TEXT,
    "telefone_1" TEXT,
    "telefone_2" TEXT,
    "cep" TEXT,
    "endereco" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "estado" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alunos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cursos" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "situacao" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,

    CONSTRAINT "cursos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matriculas" (
    "id" TEXT NOT NULL,
    "aluno_id" TEXT NOT NULL,
    "curso_id" TEXT NOT NULL,
    "numero_matricula" TEXT,
    "data_matricula" TIMESTAMP(3),
    "contrato_assinado" BOOLEAN NOT NULL DEFAULT false,
    "situacao" TEXT NOT NULL DEFAULT 'ATIVA',
    "observacoes" TEXT,
    "situacao_cobranca_id" TEXT,

    CONSTRAINT "matriculas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcelas" (
    "id" TEXT NOT NULL,
    "matricula_id" TEXT NOT NULL,
    "cod_titulo" TEXT NOT NULL,
    "parcela" TEXT NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "tipo_titulo" TEXT,
    "status" "StatusParcela" NOT NULL DEFAULT 'EM_ABERTO',
    "data_pagamento" TIMESTAMP(3),
    "valor_pago" DECIMAL(12,2),
    "observacoes" TEXT,

    CONSTRAINT "parcelas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importacoes" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "arquivo" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_registros" INTEGER NOT NULL DEFAULT 0,
    "novos_alunos" INTEGER NOT NULL DEFAULT 0,
    "alunos_atualizados" INTEGER NOT NULL DEFAULT 0,
    "parcelas_novas" INTEGER NOT NULL DEFAULT 0,
    "parcelas_atualizadas" INTEGER NOT NULL DEFAULT 0,
    "erros" JSONB,

    CONSTRAINT "importacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracoes" (
    "id" TEXT NOT NULL,
    "parcelas_minimas" INTEGER NOT NULL DEFAULT 3,
    "dias_atraso" INTEGER NOT NULL DEFAULT 0,
    "pasta_saida_documentos" TEXT NOT NULL,
    "modelo_docx" TEXT NOT NULL,
    "padrao_nome_arquivo" TEXT NOT NULL DEFAULT '{NOME}_{CPF}_{CURSO}.docx',
    "frequencia_importacao" "FrequenciaImportacao" NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "configuracoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "situacoes_cobranca" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "descricao" TEXT,
    "participa_novos_relatorios" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "situacoes_cobranca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matricula_tags" (
    "matricula_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "matricula_tags_pkey" PRIMARY KEY ("matricula_id","tag_id")
);

-- CreateTable
CREATE TABLE "historico_cobranca" (
    "id" TEXT NOT NULL,
    "matricula_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acao" TEXT NOT NULL,

    CONSTRAINT "historico_cobranca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observacoes_cobranca" (
    "id" TEXT NOT NULL,
    "matricula_id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "texto" TEXT NOT NULL,

    CONSTRAINT "observacoes_cobranca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "detalhes" JSONB,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "alunos_cpf_key" ON "alunos"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "cursos_codigo_key" ON "cursos"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "matriculas_aluno_id_curso_id_numero_matricula_key" ON "matriculas"("aluno_id", "curso_id", "numero_matricula");

-- CreateIndex
CREATE UNIQUE INDEX "parcelas_matricula_id_cod_titulo_key" ON "parcelas"("matricula_id", "cod_titulo");

-- CreateIndex
CREATE UNIQUE INDEX "situacoes_cobranca_nome_key" ON "situacoes_cobranca"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "tags_nome_key" ON "tags"("nome");

-- AddForeignKey
ALTER TABLE "matriculas" ADD CONSTRAINT "matriculas_aluno_id_fkey" FOREIGN KEY ("aluno_id") REFERENCES "alunos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matriculas" ADD CONSTRAINT "matriculas_curso_id_fkey" FOREIGN KEY ("curso_id") REFERENCES "cursos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matriculas" ADD CONSTRAINT "matriculas_situacao_cobranca_id_fkey" FOREIGN KEY ("situacao_cobranca_id") REFERENCES "situacoes_cobranca"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcelas" ADD CONSTRAINT "parcelas_matricula_id_fkey" FOREIGN KEY ("matricula_id") REFERENCES "matriculas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matricula_tags" ADD CONSTRAINT "matricula_tags_matricula_id_fkey" FOREIGN KEY ("matricula_id") REFERENCES "matriculas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matricula_tags" ADD CONSTRAINT "matricula_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_cobranca" ADD CONSTRAINT "historico_cobranca_matricula_id_fkey" FOREIGN KEY ("matricula_id") REFERENCES "matriculas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_cobranca" ADD CONSTRAINT "historico_cobranca_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observacoes_cobranca" ADD CONSTRAINT "observacoes_cobranca_matricula_id_fkey" FOREIGN KEY ("matricula_id") REFERENCES "matriculas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
