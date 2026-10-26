import type { Parcela } from "../../core/models/parcela.model";
import { arredondarAbnt } from "../../shared/utils/arredondamento.util";

/**
 * Estado de uma parcela (Paga, Vencida…) e seus encargos (multa e juros), sem Angular: usados pela
 * Ficha de Cobrança e pela tela de títulos do aluno, e testados em
 * apps/api/tests/unit/estado-parcela.test.ts.
 */

export interface ConfigEncargos {
  /** Dias de atraso a partir dos quais o estado vira "Vencida há mais de N dias" (0 = nunca). */
  diasAtrasoMinimo: number;
  multaPercentual: number;
  jurosDiarioPercentual: number;
  /** O dia de hoje entra na contagem de dias de atraso? */
  jurosContarDiaGeracao: boolean;
}

export type ParcelaParaEstado = Pick<Parcela, "status" | "vencimento">;

export type ParcelaParaEncargos = ParcelaParaEstado &
  Pick<
    Parcela,
    | "valor"
    | "multaProtesto"
    | "jurosProtesto"
    | "totalProtesto"
    | "multaLegado"
    | "jurosLegado"
    | "totalLegado"
  >;

const DIA_EM_MS = 86_400_000;

function inicioDoDia(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

/**
 * Dia do vencimento como data local. O vencimento é só uma data, guardada à meia-noite UTC: lido
 * como `new Date(...)` cai no dia anterior em fusos a oeste (Brasil) e contava um dia a mais de atraso.
 */
function vencimentoLocal(parcela: Pick<Parcela, "vencimento">): Date {
  const [ano, mes, dia] = parcela.vencimento.slice(0, 10).split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

/**
 * Estado exibido da parcela (PRD): deriva de status + vencimento, já que "vencida" não é um
 * StatusParcela — é calculada a partir da data.
 */
export function estadoDaParcela(
  parcela: ParcelaParaEstado,
  diasAtrasoMinimo: number,
  agora: Date,
): { rotulo: string; classe: string } {
  if (parcela.status === "PROTESTO_ENVIADO") {
    return { rotulo: "Vencida e enviada para protesto", classe: "bg-red-100 text-red-800" };
  }
  if (parcela.status === "PROTESTADO") {
    return { rotulo: "Protestada", classe: "bg-red-100 text-red-800" };
  }
  if (parcela.status === "PAGO") return { rotulo: "Paga", classe: "bg-green-100 text-green-700" };
  if (parcela.status === "CANCELADO") {
    return { rotulo: "Cancelada", classe: "bg-gray-100 text-gray-500" };
  }
  if (parcela.status === "RENEGOCIADO") {
    return { rotulo: "Renegociada", classe: "bg-blue-100 text-blue-700" };
  }

  const hoje = inicioDoDia(agora);
  const vencimento = vencimentoLocal(parcela);
  if (vencimento >= hoje) return { rotulo: "A vencer", classe: "bg-gray-100 text-gray-600" };

  if (diasAtrasoMinimo > 0) {
    const diasAtraso = Math.floor((hoje.getTime() - vencimento.getTime()) / DIA_EM_MS);
    if (diasAtraso > diasAtrasoMinimo) {
      return {
        rotulo: `Vencida há mais de ${diasAtrasoMinimo} dias`,
        classe: "bg-red-100 text-red-700",
      };
    }
  }
  return { rotulo: "Vencida", classe: "bg-orange-100 text-orange-700" };
}

/**
 * Multa/juros/total da parcela. Se a parcela já foi protestada (documento já gerado), usa os
 * valores CONGELADOS naquele momento — nunca recalculados depois, senão a grade divergiria cada vez
 * mais do documento já gerado conforme os dias passam (decisão do usuário, 2026-07-09). Parcela do
 * legado nunca é recalculada: o legado é a fonte de verdade (decisão do usuário, 2026-09-15). Só
 * sem nenhum dos dois o cálculo é ao vivo, com a mesma fórmula do relatório de inadimplência:
 * multa flat sobre o valor bruto e juros pro-rata pelos dias corridos desde o vencimento. Parcela
 * ainda "a vencer" não tem multa nem juros.
 */
export function calcularEncargos(
  parcela: ParcelaParaEncargos,
  config: Omit<ConfigEncargos, "diasAtrasoMinimo">,
  agora: Date,
): { multa: number; juros: number; total: number } {
  if (parcela.totalProtesto !== undefined && parcela.totalProtesto !== null) {
    return {
      multa: Number(parcela.multaProtesto ?? 0),
      juros: Number(parcela.jurosProtesto ?? 0),
      total: Number(parcela.totalProtesto),
    };
  }
  if (parcela.totalLegado !== undefined && parcela.totalLegado !== null) {
    return {
      multa: Number(parcela.multaLegado ?? 0),
      juros: Number(parcela.jurosLegado ?? 0),
      total: Number(parcela.totalLegado),
    };
  }

  const valor = Number(parcela.valor);
  const hoje = inicioDoDia(agora);
  const vencimento = vencimentoLocal(parcela);
  if (vencimento >= hoje) return { multa: 0, juros: 0, total: arredondarAbnt(valor) };

  const ajuste = config.jurosContarDiaGeracao ? 0 : 1;
  const diasAtraso = Math.max(
    Math.floor((hoje.getTime() - vencimento.getTime()) / DIA_EM_MS) - ajuste,
    0,
  );
  const multa = arredondarAbnt(valor * (config.multaPercentual / 100));
  const juros = arredondarAbnt(valor * (config.jurosDiarioPercentual / 100) * diasAtraso);
  return { multa, juros, total: arredondarAbnt(valor + multa + juros) };
}
