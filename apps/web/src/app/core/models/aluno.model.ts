export interface Aluno {
  id: string;
  cpf: string;
  nome: string;
  tipoPessoa?: string | null;
  email?: string | null;
  telefone1?: string | null;
  telefone2?: string | null;
  cep?: string | null;
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  criadoEm?: string;
  atualizadoEm?: string;
}

// Campos aceitos na criação/atualização (o CPF só é enviado na criação).
export type AlunoPayload = Partial<Omit<Aluno, "id" | "criadoEm" | "atualizadoEm">>;
