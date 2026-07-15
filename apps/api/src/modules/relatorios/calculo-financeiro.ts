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
