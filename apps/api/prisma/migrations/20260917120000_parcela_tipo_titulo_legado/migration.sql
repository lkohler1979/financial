-- Campo estruturado de tipo de título do legado (tipotituloId/tipotituloNome
-- do endpoint titulo-informacoes/{id}, confirmado ao vivo em 2026-09-17) e
-- tituloObservacoes do legado — guardados para exibição/conferência na
-- Ficha de Cobrança, sem substituir Parcela.tipo_titulo (normalizado, usado
-- no filtro de geração de protesto) nem Parcela.observacoes (gestão interna).
ALTER TABLE "parcelas" ADD COLUMN "tipo_titulo_id_legado" INTEGER;
ALTER TABLE "parcelas" ADD COLUMN "titulo_observacoes_legado" TEXT;
