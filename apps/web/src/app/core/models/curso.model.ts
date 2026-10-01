export interface Curso {
  id: string;
  codigo: string;
  nome: string;
  situacao: boolean;
  observacoes?: string | null;
  /** Valor sugerido ao criar uma matrícula neste curso — editável por
   * matrícula (desconto/negociação), ver Matricula.valorCurso. */
  valorPadrao?: number | null;
}

export type CursoPayload = Partial<Omit<Curso, "id">>;
