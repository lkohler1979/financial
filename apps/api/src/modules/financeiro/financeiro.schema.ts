import { z } from "zod";

const statusParcela = z.enum([
  "EM_ABERTO",
  "PAGO",
  "CANCELADO",
  "PROTESTO_ENVIADO",
  "PROTESTADO",
  "RENEGOCIADO",
]);

// codTitulo + matriculaId compõem a chave natural (PRD seção 12) usada pela
// importação incremental — não são editáveis após a criação.
const dadosParcela = {
  parcela: z.string().trim().min(1, "Parcela é obrigatória").max(50),
  vencimento: z.coerce.date(),
  valor: z.coerce.number().positive("Valor deve ser maior que zero"),
  tipoTitulo: z.string().trim().max(50).optional(),
  observacoes: z.string().trim().max(1000).optional(),
};

export const criarParcelaSchema = z.object({
  matriculaId: z.string().uuid("matriculaId inválido"),
  codTitulo: z.string().trim().min(1, "Código do título é obrigatório").max(50),
  ...dadosParcela,
});

// Ao marcar como PAGO, dataPagamento/valorPago são preenchidos com padrão
// (agora / valor da parcela) pelo service quando não informados.
//
// multaProtesto/jurosProtesto/totalProtesto: congelam os valores calculados
// no momento em que o documento de protesto foi gerado para esta parcela
// (geracao-word.worker.ts) — nunca recalculados depois, para que a Ficha de
// Cobrança sempre bata com o documento já gerado (decisão do usuário,
// 2026-07-09). Normalmente gravados só pelo worker, mas expostos aqui como
// qualquer outro campo de Parcela para permitir correção manual se preciso.
export const atualizarParcelaSchema = z
  .object({
    ...dadosParcela,
    status: statusParcela,
    dataPagamento: z.coerce.date(),
    valorPago: z.coerce.number().positive(),
    multaProtesto: z.coerce.number().min(0),
    jurosProtesto: z.coerce.number().min(0),
    totalProtesto: z.coerce.number().min(0),
  })
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, "Informe ao menos um campo para atualizar");

export const listarParcelasSchema = z.object({
  matriculaId: z.string().uuid().optional(),
  status: statusParcela.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CriarParcelaInput = z.infer<typeof criarParcelaSchema>;
export type AtualizarParcelaInput = z.infer<typeof atualizarParcelaSchema>;
export type ListarParcelasInput = z.infer<typeof listarParcelasSchema>;
