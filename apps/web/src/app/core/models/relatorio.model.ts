export type TipoTituloProtesto = "MENSALIDADE" | "RENEGOCIACAO" | "AMBOS";

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
  /** Presente só quando o relatório separou os documentos por tipo (Ambos +
   * separarDocumentosPorTipo) — indica a qual subconjunto de parcelas este
   * item/documento se refere. */
  tipoTituloDocumento?: "MENSALIDADE" | "RENEGOCIACAO";
}

export interface RelatorioInadimplencia {
  id: string;
  usuarioId: string;
  data: string;
  diasAtraso?: number | null;
  incluirParcelasVencidasRecentes?: boolean;
  tipoTituloProtesto?: TipoTituloProtesto;
  separarDocumentosPorTipo?: boolean;
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
  tcdAssinado?: boolean;
  ignorarSituacoesTratadas?: boolean;
  /** Por padrão, só entra no protesto a parcela vencida há mais de
   * `diasAtraso` dias; quando true, inclui também a parcela só "vencida" da
   * mesma matrícula, no mesmo documento (decisão do usuário, 2026-07-07). */
  incluirParcelasVencidasRecentes?: boolean;
  /** Filtro por tipo de título (Parcela.tipoTitulo): gerar protesto só com
   * mensalidade, só com renegociação, ou ambas (padrão). Sem valor, usa
   * Configuracao.tipoTituloProtestoDefault. */
  tipoTituloProtesto?: TipoTituloProtesto;
  /** Só tem efeito quando tipoTituloProtesto = "AMBOS" (pedido do usuário):
   * gera um documento separado para mensalidade e outro para renegociação
   * em vez de um único documento combinado. */
  separarDocumentosPorTipo?: boolean;
}
