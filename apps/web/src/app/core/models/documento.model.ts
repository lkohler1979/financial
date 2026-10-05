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
  arquivoTamanho?: number | null;
  atualizadoEm?: string;
}

export interface ItemDocumento {
  tipo: TipoDocumento;
  /** Null até o primeiro upload/edição daquele tipo. */
  documento: Documento | null;
}

export interface DocumentosDaMatricula {
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
