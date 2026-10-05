/** Dispara o download de um Blob recebido via HttpClient (precisa do header de
 * autenticação, então não dá pra usar um link direto). */
export function baixarBlob(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}
