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
