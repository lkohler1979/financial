// Cálculo de multa e juros do relatório de inadimplência (PRD seção 15/23).
//
// Fórmula reverso-engenheirada a partir dos documentos de exemplo fornecidos
// pelo usuário em 2026-07-03 (docs reais gerados pelo sistema legado da
// Ethos): Multa = 2% flat sobre o valor bruto; Juros = 1% ao mês, pro-rata
// por dia de atraso (base 30 dias). Bate exatamente com o valor de Multa dos
// exemplos; Juros ficou próximo mas não idêntico ao centavo (possível
// diferença de contagem de dias ou arredondamento intermediário do sistema
// de origem) — ver docs/PENDENCIAS.md, precisa de confirmação da instituição.
export const MULTA_PERCENTUAL = 0.02;
export const JUROS_PERCENTUAL_MENSAL = 0.01;
const DIAS_BASE_MES = 30;

export interface CalculoParcela {
  valorBruto: number;
  multa: number;
  juros: number;
  total: number;
}

export function calcularMultaJuros(valorBruto: number, diasAtraso: number): CalculoParcela {
  const dias = Math.max(diasAtraso, 0);
  const multa = arredondar(valorBruto * MULTA_PERCENTUAL);
  const juros = arredondar(valorBruto * (JUROS_PERCENTUAL_MENSAL / DIAS_BASE_MES) * dias);
  const total = arredondar(valorBruto + multa + juros);
  return { valorBruto: arredondar(valorBruto), multa, juros, total };
}

/** Dias corridos entre o vencimento e hoje (0 se ainda não venceu). */
export function calcularDiasAtraso(vencimento: Date, referencia: Date = new Date()): number {
  const hoje = new Date(referencia.getFullYear(), referencia.getMonth(), referencia.getDate());
  const dataVencimento = new Date(
    vencimento.getFullYear(),
    vencimento.getMonth(),
    vencimento.getDate(),
  );
  const dias = Math.floor((hoje.getTime() - dataVencimento.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(dias, 0);
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}
