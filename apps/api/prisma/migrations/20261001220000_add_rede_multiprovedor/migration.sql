-- CreateEnum
CREATE TYPE "PagamentoProvedor" AS ENUM ('ASAAS', 'REDE');

-- CreateEnum
CREATE TYPE "RedeAmbiente" AS ENUM ('SANDBOX', 'PRODUCAO');

-- AlterTable: adiciona as novas colunas de provedor por tipo (nullable, sem
-- default ainda) para dar tempo de migrar o dado de asaas_metodos_aceitos
-- antes de fixar o default e remover a coluna antiga.
ALTER TABLE "configuracoes" ADD COLUMN     "provedor_boleto" "PagamentoProvedor",
ADD COLUMN     "provedor_cartao" "PagamentoProvedor",
ADD COLUMN     "provedor_pix" "PagamentoProvedor",
ADD COLUMN     "rede_ambiente" "RedeAmbiente" NOT NULL DEFAULT 'SANDBOX',
ADD COLUMN     "rede_chave_integracao_criptografada" TEXT,
ADD COLUMN     "rede_pv_criptografado" TEXT,
ADD COLUMN     "rede_webhook_token_criptografado" TEXT;

-- DataMigration: converte a lista asaas_metodos_aceitos em um provedor ASAAS
-- por tipo presente na lista (equivalente — só o Asaas existia até agora).
UPDATE "configuracoes" SET
  "provedor_boleto" = CASE WHEN 'BOLETO' = ANY("asaas_metodos_aceitos") THEN 'ASAAS'::"PagamentoProvedor" ELSE NULL END,
  "provedor_pix" = CASE WHEN 'PIX' = ANY("asaas_metodos_aceitos") THEN 'ASAAS'::"PagamentoProvedor" ELSE NULL END,
  "provedor_cartao" = CASE WHEN 'CREDIT_CARD' = ANY("asaas_metodos_aceitos") THEN 'ASAAS'::"PagamentoProvedor" ELSE NULL END;

-- AlterTable: remove a coluna antiga (substituída pelos 3 provedores acima).
ALTER TABLE "configuracoes" DROP COLUMN "asaas_metodos_aceitos";

-- AlterTable
ALTER TABLE "parcelas" ADD COLUMN     "provedor_pagamento" "PagamentoProvedor";

-- DataMigration: toda cobranca ja gerada antes de existir mais de um
-- provedor foi, por definicao, processada pelo Asaas.
UPDATE "parcelas" SET "provedor_pagamento" = 'ASAAS' WHERE "asaas_payment_id" IS NOT NULL;
