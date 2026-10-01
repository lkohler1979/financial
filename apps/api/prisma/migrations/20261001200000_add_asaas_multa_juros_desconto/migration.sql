-- AlterTable
ALTER TABLE "configuracoes" ADD COLUMN     "asaas_desconto_dias_antes_vencimento" INTEGER,
ADD COLUMN     "asaas_desconto_percentual" DECIMAL(5,2),
ADD COLUMN     "asaas_juros_mensal_percentual" DECIMAL(5,2),
ADD COLUMN     "asaas_multa_percentual" DECIMAL(5,2);
