export interface MatriculaElegivel {
  matriculaId: string;
  alunoId: string;
  alunoNome: string;
  alunoCpf: string;
  cursoId: string;
  cursoNome: string;
  quantidadeParcelasVencidas: number;
  diasAtrasoMaximo: number;
  valorTotal: number;
  situacaoCobrancaId?: string | null;
  situacaoCobrancaNome?: string | null;
  tags?: Array<{ id: string; nome: string }>;
}

export interface ErroItemRelatorio {
  matriculaId: string;
  mensagem: string;
}

export interface ItemRelatorio extends MatriculaElegivel {
  documentoGerado?: boolean;
  caminhoDocumento?: string | null;
}

export interface RelatorioInadimplencia {
  id: string;
  usuarioId: string;
  data: string;
  parcelasMinimas?: number | null;
  diasAtraso?: number | null;
  valorMinimo?: number | null;
  cursoId?: string | null;
  curso?: { id: string; nome: string } | null;
  totalElegiveis: number;
  totalDocumentosGerados: number;
  itens?: ItemRelatorio[] | null;
  erros?: ErroItemRelatorio[] | null;
}

export interface FiltrosRelatorio {
  parcelasMinimas?: number;
  diasAtraso?: number;
  valorMinimo?: number;
  cursoId?: string;
  situacaoCobrancaId?: string;
  tagId?: string;
  ignorarSituacoesTratadas?: boolean;
}
