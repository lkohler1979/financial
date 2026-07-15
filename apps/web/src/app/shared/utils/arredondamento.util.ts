// Arredondamento monetário conforme a NBR 5891 (ABNT) — mesma regra usada no
// backend (apps/api/src/shared/utils/arredondamento.ts), decisão do usuário
// em 2026-07-09 para todos os cálculos de multa, juros e valores exibidos.
//
// Regra: quando o algarismo a eliminar é exatamente 5 e não há nenhum
// algarismo significativo depois dele, arredonda para o algarismo par mais
// próximo (banker's rounding); nos demais casos, arredonda normalmente —
// diferente do `Math.round` do JavaScript, que sempre arredonda ".5" para cima.
export function arredondarAbnt(valor: number, casasDecimais = 2): number {
  const fator = 10 ** casasDecimais;
  const escalado = valor * fator;
  const piso = Math.floor(escalado);
  const resto = escalado - piso;

  const EPSILON = 1e-9;

  if (Math.abs(resto - 0.5) < EPSILON) {
    const parMaisProximo = piso % 2 === 0 ? piso : piso + 1;
    return parMaisProximo / fator;
  }

  return Math.round(escalado) / fator;
}
