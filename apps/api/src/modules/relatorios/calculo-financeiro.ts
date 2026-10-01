import { arredondarAbnt } from "../../shared/utils/arredondamento";

// Cálculo de multa e juros do relatório de inadimplência (PRD seção 15/23).
//
// Fórmula e parâmetros confirmados pelo usuário em 2026-07-03: multa flat
// sobre o valor bruto e juros diários pro-rata desde o vencimento, ambos
// configuráveis via `Configuracao` (multaPercentual, jurosDiarioPercentual,
// jurosContarDiaGeracao) — padrão de fábrica: 2% de multa e 0,033% de juros
// ao dia. `jurosContarDiaGeracao` decide se o dia da geração do relatório
// entra ou não na contagem de dias de atraso. Arredondamento segue a NBR
// 5891 (ABNT), decisão do usuário em 2026-07-09.
export interface ConfiguracaoFinanceira {
  multaPercentual: number;
  jurosDiarioPercentual: number;
  jurosContarDiaGeracao: boolean;
}

export interface CalculoParcela {
  valorBruto: number;
  multa: number;
  juros: number;
  total: number;
}

export function calcularMultaJuros(
  valorBruto: number,
  diasAtraso: number,
  config: ConfiguracaoFinanceira,
): CalculoParcela {
  const dias = Math.max(diasAtraso, 0);
  const multa = arredondarAbnt(valorBruto * (config.multaPercentual / 100));
  const juros = arredondarAbnt(valorBruto * (config.jurosDiarioPercentual / 100) * dias);
  const total = arredondarAbnt(valorBruto + multa + juros);
  return { valorBruto: arredondarAbnt(valorBruto), multa, juros, total };
}

export interface ParcelaComPossivelOrigemLegado {
  valor: number;
  vencimento: Date;
  /** Presentes quando a Parcela foi importada/sincronizada do sistema
   * legado (`Parcela.multaLegado`/`jurosLegado`/`totalLegado`). */
  multaLegado?: number | null;
  jurosLegado?: number | null;
  totalLegado?: number | null;
}

/**
 * Multa/juros/total de uma parcela — usa o valor já calculado pelo sistema
 * legado quando disponível (`totalLegado` não nulo), em vez de recalcular
 * com a fórmula do Ethos. Decisão do usuário, 2026-09-15: parcela vinda do
 * legado nunca é recalculada pelo Ethos, o legado é sempre a fonte de
 * verdade para multa/juros. Sem esses valores (parcela nunca sincronizada
 * com o legado), cai no cálculo próprio de sempre.
 */
export function calcularMultaJurosParcela(
  parcela: ParcelaComPossivelOrigemLegado,
  referencia: Date,
  config: ConfiguracaoFinanceira,
): CalculoParcela {
  if (parcela.totalLegado !== undefined && parcela.totalLegado !== null) {
    return {
      valorBruto: arredondarAbnt(parcela.valor),
      multa: arredondarAbnt(parcela.multaLegado ?? 0),
      juros: arredondarAbnt(parcela.jurosLegado ?? 0),
      total: arredondarAbnt(parcela.totalLegado),
    };
  }

  const diasAtraso = calcularDiasAtraso(parcela.vencimento, referencia, config.jurosContarDiaGeracao);
  return calcularMultaJuros(parcela.valor, diasAtraso, config);
}

/**
 * Dias corridos entre o vencimento e a data de referência (geração do
 * relatório). Quando `jurosContarDiaGeracao` é false, subtrai 1 dia — ou
 * seja, os juros contam só até o dia anterior à geração.
 */
export function calcularDiasAtraso(
  vencimento: Date,
  referencia: Date,
  jurosContarDiaGeracao: boolean,
): number {
  const dataReferencia = new Date(
    referencia.getFullYear(),
    referencia.getMonth(),
    referencia.getDate(),
  );
  const dataVencimento = new Date(
    vencimento.getFullYear(),
    vencimento.getMonth(),
    vencimento.getDate(),
  );
  const dias = Math.floor(
    (dataReferencia.getTime() - dataVencimento.getTime()) / (1000 * 60 * 60 * 24),
  );
  const ajuste = jurosContarDiaGeracao ? 0 : 1;
  return Math.max(dias - ajuste, 0);
}
