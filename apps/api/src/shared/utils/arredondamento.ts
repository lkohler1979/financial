// Arredondamento monetário conforme a NBR 5891 (ABNT) — regra oficial de
// arredondamento usada no Brasil, decisão do usuário em 2026-07-09 para
// todos os cálculos de multa, juros e valores.
//
// Regra: quando o algarismo a eliminar é exatamente 5 e não há nenhum
// algarismo significativo depois dele, arredonda para o algarismo par mais
// próximo (banker's rounding); nos demais casos, arredonda normalmente
// (para cima se o algarismo a eliminar for > 5, para baixo se for < 5) —
// diferente do `Math.round` do JavaScript, que sempre arredonda ".5" para
// cima.
export function arredondarAbnt(valor: number, casasDecimais = 2): number {
  const fator = 10 ** casasDecimais;
  const escalado = valor * fator;
  const piso = Math.floor(escalado);
  const resto = escalado - piso;

  // Tolerância para o erro de representação binária de ponto flutuante
  // (ex.: 2.345 * 100 pode virar 234.49999999999997 em vez de 234.5).
  const EPSILON = 1e-9;

  if (Math.abs(resto - 0.5) < EPSILON) {
    const parMaisProximo = piso % 2 === 0 ? piso : piso + 1;
    return parMaisProximo / fator;
  }

  return Math.round(escalado) / fator;
}
