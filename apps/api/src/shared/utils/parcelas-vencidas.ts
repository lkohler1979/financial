/** Parcelas que ainda estão devendo (não pagas, renegociadas nem canceladas). */
export const STATUS_PARCELA_DEVENDO = ["EM_ABERTO", "PROTESTO_ENVIADO", "PROTESTADO"] as const;

/** Início do dia de hoje como o vencimento é guardado: só a data, à meia-noite UTC. */
export function inicioDeHoje(agora: Date): Date {
  return new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate()));
}
