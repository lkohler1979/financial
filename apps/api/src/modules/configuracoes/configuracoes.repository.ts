import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";

// Configuracao é um singleton (seção 13 do PRD) — uma única linha guarda os
// parâmetros do sistema. Sem CRUD completo ainda (tela de configurações é
// Sprint 5); aqui só o necessário para os módulos que já dependem dela
// (relatórios, importação).
const DEFAULTS: Prisma.ConfiguracaoCreateInput = {
  diasAtraso: Number(process.env.DIAS_ATRASO_MINIMO ?? 90),
  pastaSaidaDocumentos: process.env.PASTA_SAIDA_DOCUMENTOS ?? "./output/relatorios",
  modeloDocx: process.env.MODELO_DOCX_PROTESTO ?? "./templates/modelo-protesto.docx",
  multaPercentual: Number(process.env.MULTA_PERCENTUAL ?? 2),
  jurosDiarioPercentual: Number(process.env.JUROS_DIARIO_PERCENTUAL ?? 0.033),
  jurosContarDiaGeracao: (process.env.JUROS_CONTAR_DIA_GERACAO ?? "true") === "true",
};

export const configuracoesRepository = {
  async obterOuCriar() {
    const existente = await prisma.configuracao.findFirst();
    if (existente) return existente;
    return prisma.configuracao.create({ data: DEFAULTS });
  },

  async atualizar(data: Prisma.ConfiguracaoUpdateInput) {
    const configuracao = await this.obterOuCriar();
    return prisma.configuracao.update({
      where: { id: configuracao.id },
      data,
    });
  },

  /**
   * Apaga todos os dados transacionais (alunos, cursos, matrículas, parcelas,
   * cobrança e histórico de relatórios) para permitir uma importação real do
   * zero — pedido do usuário, 2026-07-08. Mantém intactos Usuario,
   * Configuracao, MapeamentoImportacao, SituacaoCobranca e Tag (catálogos/
   * configuração, reaproveitáveis na próxima importação) e Auditoria
   * (histórico de auditoria nunca é apagado, CLAUDE.md seção 8 — a própria
   * limpeza gera um novo registro de auditoria, não remove os anteriores).
   * A ordem do array respeita as FKs (filhos antes dos pais).
   */
  async limparDadosTransacionais() {
    const relatoriosAntesDaExclusao = await prisma.relatorioInadimplencia.findMany({
      select: { itens: true },
    });

    const [
      historicoCobranca,
      observacoesCobranca,
      matriculaTags,
      parcelas,
      matriculas,
      relatoriosInadimplencia,
      importacoes,
      alunos,
      cursos,
    ] = await prisma.$transaction([
      prisma.historicoCobranca.deleteMany({}),
      prisma.observacaoCobranca.deleteMany({}),
      prisma.matriculaTag.deleteMany({}),
      prisma.parcela.deleteMany({}),
      prisma.matricula.deleteMany({}),
      prisma.relatorioInadimplencia.deleteMany({}),
      prisma.importacao.deleteMany({}),
      prisma.aluno.deleteMany({}),
      prisma.curso.deleteMany({}),
    ]);

    return {
      relatoriosAntesDaExclusao,
      contagens: {
        historicoCobranca: historicoCobranca.count,
        observacoesCobranca: observacoesCobranca.count,
        matriculaTags: matriculaTags.count,
        parcelas: parcelas.count,
        matriculas: matriculas.count,
        relatoriosInadimplencia: relatoriosInadimplencia.count,
        importacoes: importacoes.count,
        alunos: alunos.count,
        cursos: cursos.count,
      },
    };
  },
};
