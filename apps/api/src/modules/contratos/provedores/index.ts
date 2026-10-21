import type { Configuracao, ProvedorAssinatura } from "@prisma/client";
import { ValidationError } from "../../../shared/errors/app-error";
import { decifrar } from "../../../shared/utils/criptografia";
import { criarProvedorAutentique, regrasWebhookAutentique } from "./autentique.provider";
import { criarProvedorClicksign, regrasWebhookClicksign } from "./clicksign.provider";
import type { ProvedorDeAssinatura, RegrasWebhook } from "./tipos";

export type { ProvedorDeAssinatura, RegrasWebhook } from "./tipos";

/**
 * Provedor de assinatura de um contrato. Sem `id`, usa o escolhido em Configurações; para
 * consultar/cancelar um contrato antigo, passa-se o provedor com que ele foi enviado.
 */
export function obterProvedor(config: Configuracao, id?: ProvedorAssinatura): ProvedorDeAssinatura {
  const escolhido = id ?? config.assinaturaProvedor;
  if (escolhido === "AUTENTIQUE") {
    if (!config.autentiqueTokenCriptografado)
      throw new ValidationError("Informe o token da Autentique em Configurações.");
    return criarProvedorAutentique(
      decifrar(config.autentiqueTokenCriptografado),
      config.autentiqueSandbox,
    );
  }
  if (!config.clicksignTokenCriptografado)
    throw new ValidationError("Informe o token da Clicksign em Configurações.");
  return criarProvedorClicksign(
    decifrar(config.clicksignTokenCriptografado),
    config.clicksignAmbiente,
  );
}

/** Segredo HMAC (já decifrado) do webhook de cada plataforma, ou null se não configurado. */
export function segredoWebhook(config: Configuracao, id: ProvedorAssinatura): string | null {
  const cifrado =
    id === "AUTENTIQUE"
      ? config.autentiqueWebhookSecretCriptografado
      : config.clicksignHmacCriptografado;
  return cifrado ? decifrar(cifrado) : null;
}

export const REGRAS_WEBHOOK: Record<ProvedorAssinatura, RegrasWebhook> = {
  CLICKSIGN: regrasWebhookClicksign,
  AUTENTIQUE: regrasWebhookAutentique,
};
