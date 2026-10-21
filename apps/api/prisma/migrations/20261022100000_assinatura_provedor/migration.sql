-- CreateEnum
CREATE TYPE "ProvedorAssinatura" AS ENUM ('CLICKSIGN', 'AUTENTIQUE');

-- AlterTable
ALTER TABLE "configuracoes" ADD COLUMN     "assinatura_provedor" "ProvedorAssinatura" NOT NULL DEFAULT 'CLICKSIGN',
ADD COLUMN     "autentique_sandbox" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "autentique_token_criptografado" TEXT,
ADD COLUMN     "autentique_webhook_secret_criptografado" TEXT;

-- AlterTable
ALTER TABLE "contratos_matricula" ADD COLUMN     "provedor" "ProvedorAssinatura" NOT NULL DEFAULT 'CLICKSIGN';

