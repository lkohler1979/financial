export type TipoPessoaSacado = "FISICA" | "JURIDICA";

export interface Sacado {
  id: string;
  tipoPessoa: TipoPessoaSacado;
  cpfCnpj: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  dataNascimento?: string | null;
}

/** Dados de um responsável financeiro enviados no cadastro da matrícula
 * (o backend reaproveita o cadastro existente com o mesmo CPF/CNPJ). */
export interface SacadoPayload {
  tipoPessoa: TipoPessoaSacado;
  cpfCnpj: string;
  nome: string;
  email?: string;
  telefone?: string;
  dataNascimento?: string;
}
