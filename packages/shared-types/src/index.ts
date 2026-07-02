// =============================================================================
// EthosFinancial — Tipos e DTOs compartilhados entre API e Web
// =============================================================================

export interface AlunoDTO {
  id: string;
  cpf: string;
  nome: string;
  email?: string;
  telefone1?: string;
  telefone2?: string;
  cidade?: string;
  estado?: string;
}

export interface CursoDTO {
  id: string;
  codigo: string;
  nome: string;
  situacao: boolean;
}

export interface MatriculaDTO {
  id: string;
  alunoId: string;
  cursoId: string;
  numeroMatricula?: string;
  dataMatricula?: string;
  contratoAssinado: boolean;
  situacaoCobrancaId?: string;
  tags: string[];
}

export type StatusParcela = "EM_ABERTO" | "PAGO" | "CANCELADO" | "PROTESTADO" | "RENEGOCIADO";

export interface ParcelaDTO {
  id: string;
  matriculaId: string;
  codTitulo: string;
  parcela: string;
  vencimento: string;
  valor: number;
  tipoTitulo?: string;
  status: StatusParcela;
}

export interface RelatorioInadimplenciaFiltroDTO {
  parcelasMinimas?: number;
  diasAtraso?: number;
  valorMinimo?: number;
  valorMaximo?: number;
  cursoId?: string;
  cpf?: string;
  nome?: string;
  cidade?: string;
  estado?: string;
  situacaoCobrancaIncluir?: string[];
  situacaoCobrancaExcluir?: string[];
  tags?: string[];
  possuiTag?: boolean;
}

export interface AcaoEmLoteDTO {
  matriculaIds: string[];
  situacaoCobrancaId?: string;
  tagsAdicionar?: string[];
  tagsRemover?: string[];
  observacao?: string;
}
