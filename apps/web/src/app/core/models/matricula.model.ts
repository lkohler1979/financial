export interface MatriculaResumoAluno {
  id: string;
  codigo?: string | null;
  cpf: string;
  nome: string;
}

export interface AgenteEducacional {
  id: string;
  nome: string;
}

export interface MatriculaResumoCurso {
  id: string;
  codigo: string;
  nome: string;
}

export interface MatriculaResumoSituacaoCobranca {
  id: string;
  nome: string;
  cor: string;
}

export interface MatriculaResumoParcelas {
  vencidas: number;
  emAberto: number;
  pagas: number;
  protestadas: number;
  renegociadas: number;
  canceladas: number;
}

export interface Matricula {
  id: string;
  alunoId: string;
  cursoId: string;
  numeroMatricula?: string | null;
  dataMatricula?: string | null;
  contratoAssinado: boolean;
  tcdAssinado: boolean;
  situacao: string;
  observacoes?: string | null;
  situacaoCobrancaId?: string | null;
  agenteEducacionalId?: string | null;
  agenteEducacional?: AgenteEducacional | null;
  aluno?: MatriculaResumoAluno;
  curso?: MatriculaResumoCurso;
  situacaoCobranca?: MatriculaResumoSituacaoCobranca | null;
  resumoParcelas?: MatriculaResumoParcelas;
  /** Ver StatusSincronizacaoLegado (parcela.model.ts) — marcado SINCRONIZADO
   * quando esta Matrícula já foi conferida com sucesso contra o legado. */
  statusSincronizacaoLegado?: "PENDENTE" | "SINCRONIZADO";
  /** Junto com numeroParcelas/diaVencimento, dispara a geração automática
   * das parcelas mensais na criação da matrícula (integração Asaas). */
  valorCurso?: number | null;
  numeroParcelas?: number | null;
  diaVencimento?: number | null;
  /** Quantas Parcela já existem para esta matrícula — usado pra decidir se
   * mostra o botão "Gerar parcelas" (só faz sentido quando ainda é 0). */
  quantidadeParcelas?: number;
}

export interface MatriculaPayload {
  cobrancas?: import("./tipo-cobranca.model").CobrancaMatriculaPayload[];
  agenteEducacionalId?: string;
  alunoId?: string;
  cursoId?: string;
  numeroMatricula?: string;
  dataMatricula?: string;
  contratoAssinado?: boolean;
  tcdAssinado?: boolean;
  situacao?: string;
  observacoes?: string;
  valorCurso?: number;
  numeroParcelas?: number;
  diaVencimento?: number;
}
