import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Confere o header `Content-Hmac: sha256=<hex>` da Clicksign: HMAC-SHA256 do corpo bruto da
 * requisição, usando o segredo gerado ao cadastrar o webhook.
 */
export function verificarAssinaturaWebhook(
  corpoBruto: Buffer,
  cabecalho: string | undefined,
  segredo: string,
): boolean {
  if (!cabecalho) return false;
  const recebido = cabecalho
    .trim()
    .replace(/^sha256=/i, "")
    .toLowerCase();
  const esperado = createHmac("sha256", segredo).update(corpoBruto).digest("hex");
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}
