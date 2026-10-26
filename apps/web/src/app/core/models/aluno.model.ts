/** Situação financeira do aluno: sem matrícula, em atraso (parcela vencida e não paga) ou em dia. */
export type SituacaoFinanceiraAluno = "EM_DIA" | "EM_ATRASO" | "SEM_MATRICULA";

export interface UltimaMatriculaAluno {
  id: string;
  cursoNome: string;
  dataMatricula: string | null;
}

export interface ResumoAluno {
  totalMatriculas: number;
  ultimaMatricula: UltimaMatriculaAluno | null;
  situacaoFinanceira: SituacaoFinanceiraAluno;
  /** Parcelas devendo e já vencidas, somando todas as matrículas. */
  parcelasVencidas: number;
}

export interface ContadoresAlunos {
  total: number;
  comMatricula: number;
  semMatricula: number;
  comPendencias: number;
}

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
  /** Código visível do aluno (ano + 5 dígitos), gerado automaticamente. */
  codigo?: string | null;
  genero?: string | null;
  dataNascimento?: string | null;
  estadoNascimento?: string | null;
  cidadeNascimento?: string | null;
  nomeMae?: string | null;
  nomePai?: string | null;
  tipoDocumentoIdentificacao?: string | null;
  numeroDocumentoIdentificacao?: string | null;
  profissao?: string | null;
  empresa?: string | null;
  necessidadesEspeciais?: string | null;
  origemCadastro?: string | null;
  mediador?: string | null;
  agenteEducacionalId?: string | null;
  criadoEm?: string;
  atualizadoEm?: string;
  /** Só na lista: calculados pelo servidor. */
  totalMatriculas?: number;
  ultimaMatricula?: UltimaMatriculaAluno | null;
  situacaoFinanceira?: SituacaoFinanceiraAluno;
}

// Campos aceitos na criação/atualização (o CPF só é enviado na criação).
export type AlunoPayload = Partial<Omit<Aluno, "id" | "criadoEm" | "atualizadoEm" | "codigo">>;
