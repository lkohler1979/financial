export type StatusParcela = "EM_ABERTO" | "PAGO" | "CANCELADO" | "PROTESTADO" | "RENEGOCIADO";

export interface Parcela {
  id: string;
  matriculaId: string;
  codTitulo: string;
  parcela: string;
  vencimento: string;
  valor: number;
  tipoTitulo?: string | null;
  status: StatusParcela;
  dataPagamento?: string | null;
  valorPago?: number | null;
  observacoes?: string | null;
}
