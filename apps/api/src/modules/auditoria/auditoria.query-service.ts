import { auditoriaRepository } from "./auditoria.repository";
import type { ListarAuditoriaInput } from "./auditoria.schema";

function inicioDoDia(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

function fimDoDia(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate(), 23, 59, 59, 999);
}

export const auditoriaQueryService = {
  listar(input: ListarAuditoriaInput) {
    return auditoriaRepository.list({
      ...input,
      dataInicio: input.dataInicio ? inicioDoDia(input.dataInicio) : undefined,
      dataFim: input.dataFim ? fimDoDia(input.dataFim) : undefined,
    });
  },

  listarEntidades() {
    return auditoriaRepository.listarEntidades();
  },
};
