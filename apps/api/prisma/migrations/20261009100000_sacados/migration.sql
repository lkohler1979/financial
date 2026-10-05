-- CreateEnum
CREATE TYPE "TipoPessoaSacado" AS ENUM ('FISICA', 'JURIDICA');

-- AlterTable
ALTER TABLE "matriculas" ADD COLUMN     "sacado_id" TEXT;

-- CreateTable
CREATE TABLE "sacados" (
    "id" TEXT NOT NULL,
    "tipo_pessoa" "TipoPessoaSacado" NOT NULL,
    "cpf_cnpj" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "data_nascimento" TIMESTAMP(3),
    "asaas_customer_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sacados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sacados_cpf_cnpj_key" ON "sacados"("cpf_cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "sacados_asaas_customer_id_key" ON "sacados"("asaas_customer_id");

-- AddForeignKey
ALTER TABLE "matriculas" ADD CONSTRAINT "matriculas_sacado_id_fkey" FOREIGN KEY ("sacado_id") REFERENCES "sacados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

