export type TipoDescontoCupom = "PERCENTUAL" | "VALOR";

export interface Cupom {
  id: string;
  codigo: string;
  descricao: string | null;
  tipoDesconto: TipoDescontoCupom;
  /** % quando PERCENTUAL; R$ quando VALOR. */
  valor: number;
  validadeAte: string | null;
  ativo: boolean;
}

/** Cupom já conferido pela API (cadastrado, ativo e dentro da validade). */
export type CupomValidado = Pick<Cupom, "id" | "codigo" | "descricao" | "tipoDesconto" | "valor">;

export type CupomPayload = Partial<Omit<Cupom, "id">>;
