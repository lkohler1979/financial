/**
 * Dispara o download de um Blob já em memória (obtido via HttpClient, que
 * passa pelo interceptor de autenticação) — necessário desde o Sprint 7
 * (login/JWT): `window.open`/`<a href="...">` apontando direto para a URL da
 * API navegam sem o header `Authorization`, então o backend responde 401
 * ("Não autenticado") em vez do arquivo.
 */
export function salvarBlobComoArquivo(blob: Blob, nomeArquivo: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/** Extrai o nome do arquivo do cabeçalho Content-Disposition (setado pelo
 * backend via `res.download`), com um nome de reserva se não vier. */
export function extrairNomeArquivo(contentDisposition: string | null, nomeReserva: string): string {
  if (!contentDisposition) return nomeReserva;
  const match = /filename="?([^";]+)"?/.exec(contentDisposition);
  return match?.[1] ?? nomeReserva;
}
