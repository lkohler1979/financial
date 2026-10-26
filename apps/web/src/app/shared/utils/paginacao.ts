/** Números de página a mostrar: 1 2 3 4 5 … 361, ou 1 … 7 8 9 … 361, ou 1 … 357 358 359 360 361. */
export function numerosDePagina(atual: number, totalPaginas: number): (number | "…")[] {
  if (totalPaginas <= 7) return Array.from({ length: totalPaginas }, (_, i) => i + 1);
  if (atual <= 3) return [1, 2, 3, 4, 5, "…", totalPaginas];
  if (atual >= totalPaginas - 2) {
    return [1, "…", ...Array.from({ length: 5 }, (_, i) => totalPaginas - 4 + i)];
  }
  return [1, "…", atual - 1, atual, atual + 1, "…", totalPaginas];
}

/** "Mostrando 1–8 de 2.885" (sem itens: "Nenhum resultado"). */
export function resumoDaPagina(pagina: number, tamanho: number, total: number): string {
  if (total === 0) return "Nenhum resultado";
  const inicio = (pagina - 1) * tamanho + 1;
  const fim = Math.min(pagina * tamanho, total);
  const n = (v: number) => v.toLocaleString("pt-BR");
  return `Mostrando ${n(inicio)}–${n(fim)} de ${n(total)}`;
}
