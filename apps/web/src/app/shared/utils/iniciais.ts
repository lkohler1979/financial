/** Iniciais para o avatar: a 1ª letra do primeiro e do último nome ("Mariana Costa Ribeiro" → "MR"). */
export function iniciaisDe(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0 && !/^(d[aeo]s?|e)$/i.test(p));
  if (partes.length === 0) return "?";
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}
