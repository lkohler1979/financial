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

export interface SacadoListado extends Sacado {
  _count: { matriculas: number };
}

export interface SacadoFicha extends Sacado {
  matriculas: {
    id: string;
    numeroMatricula: string | null;
    situacao: string;
    aluno: { id: string; nome: string; codigo: string | null };
    curso: { id: string; nome: string };
  }[];
}

export interface AtualizarSacadoPayload {
  nome?: string;
  email?: string | null;
  telefone?: string | null;
  dataNascimento?: string;
}
