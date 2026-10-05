-- CreateEnum
CREATE TYPE "TipoDescontoCupom" AS ENUM ('PERCENTUAL', 'VALOR');

-- AlterTable
ALTER TABLE "matriculas" ADD COLUMN     "cupom_id" TEXT;

-- AlterTable
ALTER TABLE "parcelas" ADD COLUMN     "forma_pagamento" "AsaasBillingType";

-- AlterTable
ALTER TABLE "tipos_cobranca" ADD COLUMN     "aceita_cupom" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "disponivel_no_cadastro" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "entra_no_protesto" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "forma_pagamento_padrao" "AsaasBillingType";

-- CreateTable
CREATE TABLE "cupons" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo_desconto" "TipoDescontoCupom" NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "validade_ate" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cupons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cupons_codigo_key" ON "cupons"("codigo");

-- AddForeignKey
ALTER TABLE "matriculas" ADD CONSTRAINT "matriculas_cupom_id_fkey" FOREIGN KEY ("cupom_id") REFERENCES "cupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- DataMigration: Mensalidade aceita cupom e usa boleto por padrao; Taxa de
-- matricula fica fora do protesto; Renegociacao vira um tipo de cobranca
-- (entra no protesto, nao aparece no cadastro da matricula).
UPDATE "tipos_cobranca" SET "aceita_cupom" = true, "forma_pagamento_padrao" = 'BOLETO' WHERE "nome" = 'Mensalidade';
UPDATE "tipos_cobranca" SET "entra_no_protesto" = false, "forma_pagamento_padrao" = 'BOLETO' WHERE "nome" = 'Taxa de matrícula';
INSERT INTO "tipos_cobranca" ("id","nome","obrigatorio","usa_valor_do_curso","valor_padrao","opcoes_parcelas","prefixo_titulo","ordem","ativo","forma_pagamento_padrao","aceita_cupom","entra_no_protesto","disponivel_no_cadastro")
VALUES (gen_random_uuid()::text, 'Renegociação', false, false, NULL, ARRAY[1], 'RN', 3, true, 'BOLETO', false, true, false);
