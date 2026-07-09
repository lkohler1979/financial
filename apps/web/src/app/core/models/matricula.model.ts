export interface MatriculaResumoAluno {
  id: string;
  cpf: string;
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
  situacao: string;
  observacoes?: string | null;
  situacaoCobrancaId?: string | null;
  aluno?: MatriculaResumoAluno;
  curso?: MatriculaResumoCurso;
  situacaoCobranca?: MatriculaResumoSituacaoCobranca | null;
  resumoParcelas?: MatriculaResumoParcelas;
}

export interface MatriculaPayload {
  alunoId?: string;
  cursoId?: string;
  numeroMatricula?: string;
  dataMatricula?: string;
  contratoAssinado?: boolean;
  situacao?: string;
  observacoes?: string;
}
