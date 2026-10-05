export interface MatriculaResumoAluno {
  id: string;
  codigo?: string | null;
  cpf: string;
  nome: string;
  email?: string | null;
  telefone1?: string | null;
  telefone2?: string | null;
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

/** Resultado da emissão automática de boleto/Pix no cadastro (taxas + 1ª mensalidade). */
export interface EmissaoCobrancas {
  emitidas: number;
  falhas: { parcelaId: string; erro: string }[];
}

export interface Matricula {
  /** Só vem na resposta da criação. */
  emissaoCobrancas?: EmissaoCobrancas;
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
  /** Responsável financeiro quando não é o próprio aluno. */
  sacado?: { id: string; tipoPessoa: "FISICA" | "JURIDICA"; cpfCnpj: string; nome: string; email?: string | null } | null;
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
  sacadoId?: string;
  sacado?: import("./sacado.model").SacadoPayload;
  cupomCodigo?: string;
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

export interface SituacaoMatriculaOpcao {
  codigo: string;
  nome: string;
  /** Situações que encerram/suspendem o vínculo exigem motivo. */
  exigeMotivo: boolean;
}

export interface HistoricoSituacaoMatricula {
  id: string;
  situacaoAnterior: string | null;
  situacaoNova: string;
  periodoLetivo: string | null;
  motivo: string | null;
  observacoes: string | null;
  /** Nulo = mudança automática do sistema. */
  usuario: { id: string; nome: string } | null;
  criadoEm: string;
}

export interface AlterarSituacaoPayload {
  situacao: string;
  periodoLetivo?: string | null;
  motivo?: string | null;
  observacoes?: string | null;
}

/** Nome amigável da situação (o valor gravado é o código). */
export const ROTULO_SITUACAO_MATRICULA: Record<string, string> = {
  AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
  ATIVA: "Ativa",
  INDEFERIDA: "Indeferida",
  TRANCADA: "Trancada",
  CANCELADA: "Cancelada",
  TRANSFERENCIA: "Transferência",
  CONCLUIDA: "Concluída",
};

export function rotuloSituacaoMatricula(codigo: string | null | undefined): string {
  return codigo ? (ROTULO_SITUACAO_MATRICULA[codigo] ?? codigo) : "—";
}

export function classeSituacaoMatricula(codigo: string): string {
  if (codigo === "ATIVA" || codigo === "CONCLUIDA") return "bg-green-100 text-green-700";
  if (codigo === "AGUARDANDO_PAGAMENTO") return "bg-amber-100 text-amber-700";
  if (["INDEFERIDA", "CANCELADA"].includes(codigo)) return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-700";
}
