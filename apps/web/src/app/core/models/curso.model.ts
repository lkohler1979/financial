export interface Curso {
  id: string;
  codigo: string;
  nome: string;
  situacao: boolean;
  observacoes?: string | null;
}

export type CursoPayload = Partial<Omit<Curso, "id">>;
