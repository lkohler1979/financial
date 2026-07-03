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

export interface Matricula {
  id: string;
  alunoId: string;
  cursoId: string;
  numeroMatricula?: string | null;
  dataMatricula?: string | null;
  contratoAssinado: boolean;
  situacao: string;
  observacoes?: string | null;
  aluno?: MatriculaResumoAluno;
  curso?: MatriculaResumoCurso;
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
