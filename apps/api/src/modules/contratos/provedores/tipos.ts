import type { ClicksignAutenticacao, ProvedorAssinatura } from "@prisma/client";

export interface Signatario {
  nome: string;
  email: string;
  /** CPF já formatado (###.###.###-##). */
  cpf: string;
  telefone?: string;
  /** AAAA-MM-DD */
  nascimento?: string;
}

export interface DadosEnvio {
  nomeDocumento: string;
  filename: string;
  arquivo: Buffer;
  mime: string;
  autenticacao: ClicksignAutenticacao;
  contratante: Signatario;
  /** Representante da escola, quando configurado. */
  escola?: Signatario;
}

export interface ReferenciaContrato {
  envelopeId: string | null;
  documentoId: string;
}

/** Resultado de um evento de webhook que interessa ao contrato. */
export type EventoContrato = "FINALIZADO" | "RECUSADO" | "CANCELADO";

/** Operações de uma plataforma de assinatura eletrônica. */
export interface ProvedorDeAssinatura {
  readonly id: ProvedorAssinatura;
  readonly nome: string;
  /** Cria o documento na plataforma e dispara o pedido de assinatura. */
  enviar(dados: DadosEnvio): Promise<ReferenciaContrato>;
  /** PDF assinado, ou null se ainda não está disponível. */
  baixarAssinado(ref: ReferenciaContrato): Promise<Buffer | null>;
  cancelar(ref: ReferenciaContrato): Promise<void>;
}

/** Como cada plataforma assina e descreve seus webhooks. */
export interface RegrasWebhook {
  /** Nome do header que traz o HMAC-SHA256 do corpo bruto. */
  headerAssinatura: string;
  /** Traduz o payload do evento; null para eventos que não interessam. */
  interpretar(payload: unknown): EventoContrato | null;
}
