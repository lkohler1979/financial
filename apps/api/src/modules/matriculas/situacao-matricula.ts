/**
 * Situações da matrícula (modelo do Universa). O valor gravado em
 * `Matricula.situacao` é o `codigo`; matrículas importadas do legado já usam
 * "ATIVA". Situações que encerram/suspendem o vínculo exigem um motivo.
 */
export const SITUACOES_MATRICULA = [
  { codigo: "AGUARDANDO_PAGAMENTO", nome: "Aguardando pagamento", exigeMotivo: false },
  { codigo: "ATIVA", nome: "Ativa", exigeMotivo: false },
  { codigo: "INDEFERIDA", nome: "Indeferida", exigeMotivo: true },
  { codigo: "TRANCADA", nome: "Trancada", exigeMotivo: true },
  { codigo: "CANCELADA", nome: "Cancelada", exigeMotivo: true },
  { codigo: "TRANSFERENCIA", nome: "Transferência", exigeMotivo: true },
  { codigo: "CONCLUIDA", nome: "Concluída", exigeMotivo: false },
] as const;

export type CodigoSituacaoMatricula = (typeof SITUACOES_MATRICULA)[number]["codigo"];

export function buscarSituacao(codigo: string) {
  return SITUACOES_MATRICULA.find((s) => s.codigo === codigo);
}
