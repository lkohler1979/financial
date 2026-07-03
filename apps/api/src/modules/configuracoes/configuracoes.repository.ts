import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";

// Configuracao é um singleton (seção 13 do PRD) — uma única linha guarda os
// parâmetros do sistema. Sem CRUD completo ainda (tela de configurações é
// Sprint 5); aqui só o necessário para os módulos que já dependem dela
// (relatórios, importação).
const DEFAULTS: Prisma.ConfiguracaoCreateInput = {
  parcelasMinimas: Number(process.env.MIN_PARCELAS_VENCIDAS ?? 3),
  diasAtraso: Number(process.env.DIAS_ATRASO_MINIMO ?? 0),
  pastaSaidaDocumentos: process.env.PASTA_SAIDA_DOCUMENTOS ?? "./output/relatorios",
  modeloDocx: process.env.MODELO_DOCX_PROTESTO ?? "./templates/modelo-protesto.docx",
};

export const configuracoesRepository = {
  async obterOuCriar() {
    const existente = await prisma.configuracao.findFirst();
    if (existente) return existente;
    return prisma.configuracao.create({ data: DEFAULTS });
  },
};
