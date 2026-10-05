export interface Curso {
  id: string;
  codigo: string;
  nome: string;
  situacao: boolean;
  observacoes?: string | null;
  /** Valor sugerido ao criar uma matrícula neste curso — editável por
   * matrícula (desconto/negociação), ver Matricula.valorCurso. */
  valorPadrao?: number | null;
  /** Nível de ensino (Lato Sensu, Aperfeiçoamento...) — filtra cursos no cadastro de matrícula. */
  grauEnsino?: string | null;
}

export type CursoPayload = Partial<Omit<Curso, "id">>;
