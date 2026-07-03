import { Matricula } from "./matricula.model";

export interface SituacaoCobranca {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
  ativa: boolean;
  descricao?: string | null;
  participaNovosRelatorios: boolean;
}

export interface Tag {
  id: string;
  nome: string;
}

export interface HistoricoCobranca {
  id: string;
  matriculaId: string;
  usuarioId: string;
  data: string;
  acao: string;
  usuario?: { id: string; nome: string };
}

export interface ObservacaoCobranca {
  id: string;
  matriculaId: string;
  data: string;
  texto: string;
}

export interface FichaCobranca {
  matricula: Matricula;
  tags: Tag[];
  observacoes: ObservacaoCobranca[];
  historico: HistoricoCobranca[];
}

export interface ResultadoLote {
  total: number;
  sucesso: number;
  erros: Array<{ matriculaId: string; mensagem: string }>;
}
