import { EscopoDocumento, SituacaoDeferimentoDocumento, SituacaoEntregaDocumento } from "./documento.model";
import { FormaPagamento } from "./tipo-cobranca.model";

export interface PortalMatricula {
  id: string;
  numeroMatricula: string | null;
  dataMatricula: string | null;
  curso: { id: string; nome: string };
}

export interface PortalMe {
  aluno: { id: string; codigo: string | null; nome: string; cpf: string; email: string | null };
  matriculas: PortalMatricula[];
}

export interface PortalItemDocumento {
  tipo: { id: string; nome: string; escopo: EscopoDocumento; obrigatorio: boolean };
  documento: {
    id: string;
    situacaoEntrega: SituacaoEntregaDocumento;
    situacaoDeferimento: SituacaoDeferimentoDocumento;
    arquivoNome: string | null;
    anexadoEm: string | null;
    observacaoAluno: string | null;
  } | null;
}

export interface PortalDocumentos {
  pendentesObrigatorios: number;
  itens: PortalItemDocumento[];
}

export type StatusParcelaPortal =
  | "EM_ABERTO"
  | "PAGO"
  | "CANCELADO"
  | "PROTESTO_ENVIADO"
  | "PROTESTADO"
  | "RENEGOCIADO";

export interface PortalParcela {
  id: string;
  matriculaId: string;
  codTitulo: string;
  matricula: { curso: { nome: string } };
  parcela: string;
  tipoTitulo: string | null;
  vencimento: string;
  valor: number | string;
  status: StatusParcelaPortal;
  dataPagamento: string | null;
  valorPago: number | string | null;
  formaPagamento: FormaPagamento | null;
  asaasBillingType: FormaPagamento | null;
  asaasBoletoUrl: string | null;
  asaasLinhaDigitavel: string | null;
  asaasInvoiceUrl: string | null;
  asaasPixQrCodeImagem: string | null;
  asaasPixCopiaECola: string | null;
}

export interface PortalCobranca {
  asaasBillingType: FormaPagamento | null;
  asaasBoletoUrl: string | null;
  asaasLinhaDigitavel: string | null;
  asaasInvoiceUrl: string | null;
  asaasPixQrCodeImagem: string | null;
  asaasPixCopiaECola: string | null;
}

export type StatusSolicitacao = "ABERTA" | "ATENDIDA" | "RECUSADA";

export interface TipoSolicitacao {
  id: string;
  nome: string;
  descricao: string | null;
  ordem?: number;
  ativo?: boolean;
}

export interface Solicitacao {
  id: string;
  status: StatusSolicitacao;
  observacaoAluno: string | null;
  respostaStaff: string | null;
  arquivoNome: string | null;
  criadoEm: string;
  atendidoEm: string | null;
  tipo: { id: string; nome: string };
  matricula: { id: string; numeroMatricula: string | null; curso: { nome: string } } | null;
  aluno: { id: string; codigo: string | null; nome: string; cpf: string };
  atendidoPor: { id: string; nome: string } | null;
}
