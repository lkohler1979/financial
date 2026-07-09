export type AcaoAuditoria = "CRIACAO" | "ATUALIZACAO" | "EXCLUSAO";

export interface Auditoria {
  id: string;
  usuarioId: string;
  entidade: string;
  entidadeId: string;
  acao: AcaoAuditoria;
  detalhes?: unknown;
  data: string;
  usuario?: {
    id: string;
    nome: string;
    email: string;
  };
}

export interface FiltrosAuditoria {
  entidade?: string;
  usuario?: string;
  acao?: AcaoAuditoria;
  dataInicio?: string;
  dataFim?: string;
  page?: number;
  pageSize?: number;
}
