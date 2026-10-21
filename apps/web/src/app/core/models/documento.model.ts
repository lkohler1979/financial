export type EscopoDocumento = "ALUNO" | "MATRICULA";
export type SituacaoEntregaDocumento = "NAO_ENVIADO" | "ENVIADO";
export type SituacaoDeferimentoDocumento = "PENDENTE" | "DEFERIDO" | "INDEFERIDO";

export interface TipoDocumento {
  id: string;
  nome: string;
  escopo: EscopoDocumento;
  obrigatorio: boolean;
  ordem?: number;
  ativo?: boolean;
}

export interface DocumentoAguardandoConferencia {
  id: string;
  anexadoEm: string | null;
  arquivoNome: string | null;
  tipo: { id: string; nome: string; escopo: EscopoDocumento };
  aluno: {
    id: string;
    codigo: string | null;
    nome: string;
    cpf: string;
    matriculas: { id: string; numeroMatricula: string | null }[];
  };
  matricula: { id: string; numeroMatricula: string | null } | null;
}

/** Documento enviado, como aparece na tela Documentos (com o aluno e as matrículas dele). */
export interface DocumentoListado {
  id: string;
  tipo: { id: string; nome: string; escopo: EscopoDocumento };
  situacaoEntrega: SituacaoEntregaDocumento;
  situacaoDeferimento: SituacaoDeferimentoDocumento;
  anexadoEm: string | null;
  deferidoEm: string | null;
  arquivoNome: string | null;
  arquivoMime: string | null;
  arquivoTamanho: number | null;
  validadoPor: { id: string; nome: string } | null;
  aluno: {
    id: string;
    codigo: string | null;
    nome: string;
    cpf: string;
    matriculas: { id: string; numeroMatricula: string | null; curso: { nome: string } }[];
  };
  matricula: { id: string; numeroMatricula: string | null } | null;
}

export interface PaginaDocumentos {
  data: DocumentoListado[];
  total: number;
  page: number;
  pageSize: number;
  /** Quantos documentos há em cada situação (respeitando a busca, não o filtro de situação). */
  totais: Record<SituacaoDeferimentoDocumento, number>;
}

export interface Documento {
  id: string;
  situacaoEntrega: SituacaoEntregaDocumento;
  situacaoDeferimento: SituacaoDeferimentoDocumento;
  vencimento?: string | null;
  anexadoEm?: string | null;
  /** IP de origem do último envio e se foi o próprio aluno (área do aluno). */
  anexadoIp?: string | null;
  anexadoPorAluno?: boolean;
  deferidoEm?: string | null;
  validadoPor?: { id: string; nome: string } | null;
  observacaoInterna?: string | null;
  observacaoAluno?: string | null;
  arquivoNome?: string | null;
  arquivoMime?: string | null;
  arquivoTamanho?: number | null;
  atualizadoEm?: string;
}

export interface ItemDocumento {
  tipo: TipoDocumento;
  /** Null até o primeiro upload/edição daquele tipo. */
  documento: Documento | null;
}

export interface DocumentosDaMatricula {
  /** Aluno dono da matrícula (para buscar os documentos dele no legado). */
  aluno: { id: string; nome: string };
  /** Se o usuário logado pode alterar a situação de deferimento. */
  podeDeferir: boolean;
  pendentesObrigatorios: number;
  itens: ItemDocumento[];
}

export interface AtualizarDocumentoPayload {
  situacaoEntrega?: SituacaoEntregaDocumento;
  situacaoDeferimento?: SituacaoDeferimentoDocumento;
  vencimento?: string | null;
  observacaoInterna?: string | null;
  observacaoAluno?: string | null;
}
