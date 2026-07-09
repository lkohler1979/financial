import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";
import { marcarAuditoriaRegistrada } from "./auditoria.context";

// Ações de auditoria padronizadas (CLAUDE.md seção 4 / PRD seção 18).
export type AcaoAuditoria = "CRIACAO" | "ATUALIZACAO" | "EXCLUSAO";

export interface RegistroAuditoria {
  usuarioId: string;
  entidade: string;
  entidadeId: string;
  acao: AcaoAuditoria;
  detalhes?: Prisma.InputJsonValue;
}

/**
 * Registra uma entrada de Auditoria. Toda alteração em Aluno, Matrícula,
 * Parcela ou Configuração deve chamar esta função.
 *
 * Aceita um `client` transacional opcional para que o registro de auditoria
 * participe da mesma transação da operação de negócio.
 */
export async function registrarAuditoria(
  registro: RegistroAuditoria,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  await client.auditoria.create({
    data: {
      usuarioId: registro.usuarioId,
      entidade: registro.entidade,
      entidadeId: registro.entidadeId,
      acao: registro.acao,
      detalhes: registro.detalhes,
    },
  });
  marcarAuditoriaRegistrada();
}

export interface ListarAuditoriaParams {
  entidade?: string;
  usuario?: string;
  acao?: AcaoAuditoria;
  dataInicio?: Date;
  dataFim?: Date;
  page: number;
  pageSize: number;
}
