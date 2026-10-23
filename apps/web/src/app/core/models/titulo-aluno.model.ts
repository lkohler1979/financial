import type { Parcela } from "./parcela.model";

export type OrigemTitulo = "MATRICULA" | "SEM_MATRICULA";

/**
 * Um título do aluno, venha de uma matrícula (é uma Parcela) ou do legado sem matrícula no Ethos.
 * Tem a mesma forma da Parcela, para usar as mesmas regras de estado, situação e encargos.
 */
export interface TituloAluno extends Omit<Parcela, "matriculaId"> {
  origem: OrigemTitulo;
  matriculaId?: string | null;
  /** Matrícula e curso — só nos títulos de matrícula. */
  matricula?: {
    id: string;
    numeroMatricula: string | null;
    curso: { id: string; codigo: string; nome: string };
  } | null;
  /** Só nos títulos sem matrícula: o curso e a descrição como estão no legado. */
  cursoLegadoNome?: string | null;
  descricaoLegado?: string | null;
}

export interface TitulosDoAluno {
  aluno: { id: string; nome: string; cpf: string };
  titulos: TituloAluno[];
}

/** O que a rotina "buscar títulos que faltam" fez para UM aluno. */
export interface ResultadoTitulosDoAluno {
  encontradoNoLegado: boolean;
  titulosNoLegado: number;
  jaImportados: number;
  parcelasNovas: number;
  titulosSemMatricula: number;
  ignorados: number;
  avisos: string[];
}

export type StatusLoteTitulos = "EM_ANDAMENTO" | "CONCLUIDO" | "FALHOU";

/** Andamento da busca em lote dos títulos que faltam (roda em segundo plano no worker). */
export interface LoteTitulos {
  id: string;
  status: StatusLoteTitulos;
  total: number;
  processados: number;
  parcelasNovas: number;
  titulosSemMatricula: number;
  jaImportados: number;
  ignorados: number;
  alunosNaoEncontrados: number;
  alunosComErro: number;
  /** Primeiros problemas (até 50). */
  problemas: { alunoNome: string; cpf: string; motivo: string }[] | null;
  mensagemFalha: string | null;
  criadoEm: string;
  finalizadoEm: string | null;
}
