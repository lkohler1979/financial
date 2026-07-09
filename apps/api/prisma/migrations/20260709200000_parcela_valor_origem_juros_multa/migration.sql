-- Coluna TITULO_VALOR_JUROS_E_MULTA da planilha real (2026-07-09): valor com
-- juros/multa já calculado pelo sistema de origem, guardado só para
-- referência/conferência — não substitui o cálculo próprio do sistema
-- (Configuracao.multaPercentual/jurosDiarioPercentual, ver docs/PENDENCIAS.md).
ALTER TABLE "parcelas" ADD COLUMN "valor_origem_com_juros_e_multa" DECIMAL(12,2);
