import { ClicksignClient, type AmbienteClicksign, type AuthClicksign } from "../clicksign-client";
import type { ProvedorDeAssinatura, RegrasWebhook } from "./tipos";

const AUTH: Record<string, AuthClicksign> = {
  EMAIL: "email",
  SMS: "sms",
  WHATSAPP: "whatsapp",
  ICP_BRASIL: "icp_brasil",
};

export function criarProvedorClicksign(
  token: string,
  ambiente: AmbienteClicksign,
): ProvedorDeAssinatura {
  const cliente = new ClicksignClient(token, ambiente);
  return {
    id: "CLICKSIGN",
    nome: "Clicksign",

    async enviar(d) {
      const auth = AUTH[d.autenticacao];
      let envelopeId: string | null = null;
      try {
        envelopeId = await cliente.criarEnvelope(d.nomeDocumento);
        const documentoId = await cliente.adicionarDocumento(
          envelopeId,
          d.filename,
          d.arquivo,
          d.mime,
        );
        const signatarioId = await cliente.adicionarSignatario(envelopeId, d.contratante);
        await cliente.adicionarRequisitos(envelopeId, documentoId, signatarioId, auth);

        // Sem telefone cadastrado, o representante da escola se autentica por e-mail
        // (ou ICP-Brasil, quando é o método escolhido).
        if (d.escola) {
          const escolaId = await cliente.adicionarSignatario(envelopeId, d.escola);
          await cliente.adicionarRequisitos(
            envelopeId,
            documentoId,
            escolaId,
            auth === "icp_brasil" ? "icp_brasil" : "email",
          );
        }
        await cliente.ativarEnvelope(envelopeId);
        return { envelopeId, documentoId };
      } catch (erro) {
        // Não deixa envelope órfão na Clicksign.
        if (envelopeId) await cliente.cancelarEnvelope(envelopeId).catch(() => undefined);
        throw erro;
      }
    },

    baixarAssinado: (ref) =>
      ref.envelopeId
        ? cliente.baixarAssinado(ref.envelopeId, ref.documentoId)
        : Promise.resolve(null),

    async cancelar(ref) {
      if (ref.envelopeId) await cliente.cancelarEnvelope(ref.envelopeId);
    },
  };
}

export const regrasWebhookClicksign: RegrasWebhook = {
  headerAssinatura: "content-hmac",
  interpretar(payload) {
    const nome = (payload as { event?: { name?: string } })?.event?.name;
    if (nome === "document_closed") return "FINALIZADO";
    if (nome === "refusal") return "RECUSADO";
    if (nome === "cancel") return "CANCELADO";
    return null;
  },
};
