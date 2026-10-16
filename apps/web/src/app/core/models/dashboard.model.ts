import { Importacao } from "./importacao.model";

export interface SerieRelatoriosMes {
  mes: string;
  relatoriosGerados: number;
  documentosGerados: number;
}

export interface DashboardGeral {
  indicadores: {
    totalAlunos: number;
    totalCursos: number;
    totalCursosAtivos: number;
    totalMatriculas: number;
    parcelasVencidas: number;
    valorTotalVencido: number;
    alunosInadimplentes: number;
    relatoriosGerados: number;
    ultimaImportacao: Importacao | null;
  };
  inadimplenciaPorCurso: Array<{
    cursoId: string;
    cursoNome: string;
    matriculas: number;
    parcelas: number;
    valorTotal: number;
  }>;
  inadimplenciaMensal: Array<{ mes: string; matriculas: number; parcelas: number }>;
  valorVencidoPorMes: Array<{ mes: string; valor: number }>;
  evolucaoHistorica: SerieRelatoriosMes[];
}

export interface ResumoPorContrato {
  matriculas: number;
  valor: number;
}

export interface DashboardCobranca {
  indicadores: {
    inadimplentes: number;
    valorEmAberto: number;
    parcelasEmAberto: number;
    valorProtestado: number;
    valorRenegociado: number;
    valorQuitado: number;
    relatoriosPeriodo: number;
  };
  /** Valor em aberto (vencido) separado por matrícula ter ou não o contrato
   * assinado, + o resumo somando os dois. */
  porContrato: {
    comContrato: ResumoPorContrato;
    semContrato: ResumoPorContrato;
    resumo: ResumoPorContrato;
  };
  porSituacao: Array<{
    id: string | null;
    nome: string;
    cor: string;
    quantidade: number;
    valor: number;
  }>;
  porTag: Array<{ id: string; nome: string; quantidade: number; valor: number }>;
  topCursos: Array<{ cursoId: string; cursoNome: string; matriculas: number; valor: number }>;
  rankingTags: Array<{ tagId: string; nome: string; matriculas: number; valor: number }>;
  relatoriosPorPeriodo: SerieRelatoriosMes[];
}

/** Visão geral da operação: alunos, matrículas, cursos e a carteira de parcelas. */
export interface DashboardVisaoGeral {
  geradoEm: string;
  indicadores: {
    totalAlunos: number;
    alunosComMatricula: number;
    totalMatriculas: number;
    totalCursos: number;
    cursosComMatricula: number;
    parcelasEmAberto: number;
    valorEmAberto: number;
    parcelasVencidas: number;
    valorVencido: number;
    parcelasAVencer: number;
    valorAVencer: number;
    parcelasAVencer30Dias: number;
    valorAVencer30Dias: number;
    parcelasPagas: number;
    valorRecebido: number;
    recebidoMes: number;
    recebidoMesAnterior: number;
    alunosInadimplentes: number;
    matriculasInadimplentes: number;
    /** Média de dias de atraso das parcelas vencidas em aberto. */
    diasMedioAtraso: number;
    maiorAtrasoDias: number;
    /** Média de (data do pagamento − vencimento) das parcelas pagas; negativo = paga antes. */
    prazoMedioPagamentoDias: number;
    /** Vencido ÷ (vencido + recebido), em %. */
    percentualInadimplencia: number;
    ticketMedio: number;
    parcelasProtestadas: number;
    valorProtestado: number;
    parcelasRenegociadas: number;
    valorRenegociado: number;
  };
  matriculasPorMes: Array<{ mes: string; matriculas: number }>;
  alunosNovosPorMes: Array<{ mes: string; alunos: number }>;
  recebidoPorMes: Array<{ mes: string; qtd: number; valor: number }>;
  aVencerPorMes: Array<{ mes: string; qtd: number; valor: number }>;
  faixasAtraso: Array<{ faixa: string; qtd: number; valor: number }>;
  porCurso: Array<{
    cursoId: string;
    cursoNome: string;
    matriculas: number;
    alunos: number;
    parcelasAbertas: number;
    valorAberto: number;
    valorAVencer: number;
    valorVencido: number;
    diasMedioAtraso: number;
  }>;
  porTipoTitulo: Array<{
    tipo: string;
    parcelas: number;
    valorAberto: number;
    valorVencido: number;
  }>;
  maioresDevedores: Array<{
    alunoId: string;
    nome: string;
    matriculas: number;
    parcelas: number;
    valorVencido: number;
    maiorAtrasoDias: number;
  }>;
  matriculasPorSituacao: Array<{ situacao: string; matriculas: number }>;
}
