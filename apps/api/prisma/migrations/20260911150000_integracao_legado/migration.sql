-- CreateEnum
CREATE TYPE "TipoExecucaoSincronizacaoLegado" AS ENUM ('MANUAL', 'AGENDADA');

-- AlterTable: credenciais/URL/intervalo da integração com o sistema legado
-- (Universa Educacional), administráveis pela tela de Configurações sem
-- depender de deploy.
ALTER TABLE "configuracoes"
  ADD COLUMN "legado_sincronizacao_ativa" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "legado_url" TEXT,
  ADD COLUMN "legado_usuario" TEXT,
  ADD COLUMN "legado_senha_criptografada" TEXT,
  ADD COLUMN "legado_intervalo_horas" INTEGER NOT NULL DEFAULT 24;

-- CreateTable
CREATE TABLE "sincronizacoes_legado" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT,
    "tipo" "TipoExecucaoSincronizacaoLegado" NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_consultados" INTEGER NOT NULL DEFAULT 0,
    "parcelas_atualizadas" INTEGER NOT NULL DEFAULT 0,
    "nao_encontrados" INTEGER NOT NULL DEFAULT 0,
    "erros" JSONB,

    CONSTRAINT "sincronizacoes_legado_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "sincronizacoes_legado" ADD CONSTRAINT "sincronizacoes_legado_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
