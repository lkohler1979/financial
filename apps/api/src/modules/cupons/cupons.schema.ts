import { z } from "zod";

const dadosCupom = {
  codigo: z
    .string()
    .trim()
    .min(2, "Código muito curto")
    .max(40)
    .transform((v) => v.toUpperCase()),
  descricao: z.string().trim().max(200).nullable(),
  tipoDesconto: z.enum(["PERCENTUAL", "VALOR"]),
  valor: z.coerce.number().positive("O desconto deve ser maior que zero"),
  validadeAte: z.union([z.coerce.date(), z.null()]),
  ativo: z.boolean(),
};

export const criarCupomSchema = z
  .object({
    ...dadosCupom,
    descricao: dadosCupom.descricao.optional(),
    validadeAte: dadosCupom.validadeAte.optional(),
    ativo: dadosCupom.ativo.default(true),
  })
  .refine((c) => c.tipoDesconto !== "PERCENTUAL" || c.valor <= 100, {
    message: "Desconto percentual não pode passar de 100%",
    path: ["valor"],
  });

export const atualizarCupomSchema = z
  .object({ ...dadosCupom, codigo: dadosCupom.codigo })
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, "Informe ao menos um campo para atualizar");

export const validarCupomSchema = z.object({ codigo: z.string().trim().min(1) });

export type CriarCupomInput = z.infer<typeof criarCupomSchema>;
export type AtualizarCupomInput = z.infer<typeof atualizarCupomSchema>;
