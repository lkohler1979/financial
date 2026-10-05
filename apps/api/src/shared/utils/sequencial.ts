import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma";

type Cliente = Prisma.TransactionClient | typeof prisma;

/**
 * Próximo código sequencial por ano: AAAA + 5 dígitos (ex.: 202600001) —
 * usado para o código do aluno e o número da matrícula (pedido do usuário,
 * 2026-10-05). O contador é incrementado de forma atômica no banco, então dois
 * cadastros simultâneos nunca recebem o mesmo número. Reinicia a cada ano.
 */
export async function proximoCodigoSequencial(
  tipo: "ALUNO" | "MATRICULA",
  data: Date = new Date(),
  cliente: Cliente = prisma,
): Promise<string> {
  const ano = data.getFullYear();
  const registro = await cliente.sequencial.upsert({
    where: { chave: `${tipo}-${ano}` },
    update: { valor: { increment: 1 } },
    create: { chave: `${tipo}-${ano}`, valor: 1 },
  });
  return `${ano}${String(registro.valor).padStart(5, "0")}`;
}
