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
  diasAtraso?: number | null;
  incluirParcelasVencidasRecentes?: boolean;
  valorMinimo?: number | null;
  cursoId?: string | null;
  curso?: { id: string; nome: string } | null;
  totalElegiveis: number;
  totalDocumentosGerados: number;
  itens?: ItemRelatorio[] | null;
  erros?: ErroItemRelatorio[] | null;
}

export interface GerarRelatorioResultado extends RelatorioInadimplencia {
  jobId?: string;
}

export interface StatusJobRelatorio {
  jobId: string;
  estado: string;
  progresso: number;
  erro?: string;
}

export interface UltimoDocumentoMatricula {
  relatorioId: string;
  temDocx: boolean;
  temPdf: boolean;
}

export interface FiltrosRelatorio {
  diasAtraso?: number;
  valorMinimo?: number;
  cursoId?: string;
  situacaoCobrancaId?: string;
  tagId?: string;
  ignorarSituacoesTratadas?: boolean;
  /** Por padrão, só entra no protesto a parcela vencida há mais de
   * `diasAtraso` dias; quando true, inclui também a parcela só "vencida" da
   * mesma matrícula, no mesmo documento (decisão do usuário, 2026-07-07). */
  incluirParcelasVencidasRecentes?: boolean;
}
