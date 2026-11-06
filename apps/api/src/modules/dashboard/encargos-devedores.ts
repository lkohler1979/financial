import {
  calcularMultaJurosParcela,
  ConfiguracaoFinanceira,
} from "../relatorios/calculo-financeiro";
import { arredondarAbnt } from "../../shared/utils/arredondamento";

/** Uma parcela vencida e em aberto, como vem do banco para o cálculo dos encargos. */
export interface ParcelaVencidaDoAluno {
  aluno_id: string;
  valor: number;
  /** AAAA-MM-DD */
  vencimento: string;
  multa_legado: number | null;
  juros_legado: number | null;
  total_legado: number | null;
}

export interface EncargosDoAluno {
  multa: number;
  juros: number;
  /** Valor vencido + multa + juros. */
  total: number;
}

/** "AAAA-MM-DD" como data local (evita o dia anterior que `new Date("AAAA-MM-DD")` dá no Brasil). */
function dataLocal(iso: string): Date {
  const [ano, mes, dia] = iso.slice(0, 10).split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

/**
 * Soma, por aluno, a multa, os juros e o total (valor + multa + juros) das parcelas vencidas. É a
 * mesma regra da ficha de cobrança e do relatório de inadimplência: valor já calculado pelo legado,
 * quando existe; senão multa flat sobre o valor e juros pro-rata pelos dias corridos de atraso.
 */
export function somarEncargosPorAluno(
  parcelas: ParcelaVencidaDoAluno[],
  hoje: Date,
  config: ConfiguracaoFinanceira,
): Map<string, EncargosDoAluno> {
  const porAluno = new Map<string, EncargosDoAluno>();
  for (const p of parcelas) {
    const c = calcularMultaJurosParcela(
      {
        valor: Number(p.valor),
        vencimento: dataLocal(p.vencimento),
        multaLegado: p.multa_legado,
        jurosLegado: p.juros_legado,
        totalLegado: p.total_legado,
      },
      hoje,
      config,
    );
    const atual = porAluno.get(p.aluno_id) ?? { multa: 0, juros: 0, total: 0 };
    porAluno.set(p.aluno_id, {
      multa: arredondarAbnt(atual.multa + c.multa),
      juros: arredondarAbnt(atual.juros + c.juros),
      total: arredondarAbnt(atual.total + c.total),
    });
  }
  return porAluno;
}
