-- CreateEnum
CREATE TYPE "TipoTituloProtesto" AS ENUM ('MENSALIDADE', 'RENEGOCIACAO', 'AMBOS');

-- AlterTable
ALTER TABLE "configuracoes" ADD COLUMN     "tipo_titulo_protesto_default" "TipoTituloProtesto" NOT NULL DEFAULT 'AMBOS';

-- AlterTable
ALTER TABLE "relatorios_inadimplencia" ADD COLUMN     "tipo_titulo_protesto" "TipoTituloProtesto" NOT NULL DEFAULT 'AMBOS';
