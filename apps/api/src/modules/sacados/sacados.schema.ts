import { z } from "zod";
import { normalizarCpf, validarCnpj, validarCpf } from "../../shared/utils/cpf";

// Datas "YYYY-MM-DD" são lidas como data local (evita o dia a menos por UTC).
export const dataLocalOpcional = z.preprocess((v) => {
  if (v === "" || v === null || v === undefined) return undefined;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [a, m, d] = v.split("-").map(Number);
    return new Date(a, m - 1, d);
  }
  return v;
}, z.coerce.date().optional());

/** Dados de um sacado (pessoa física ou jurídica) — CPF/CNPJ validado conforme o tipo. */
export const sacadoDadosSchema = z
  .object({
    tipoPessoa: z.enum(["FISICA", "JURIDICA"]),
    cpfCnpj: z.string().trim().min(11, "CPF/CNPJ inválido"),
    nome: z.string().trim().min(1, "Nome é obrigatório").max(200),
    email: z.string().trim().email("E-mail inválido").optional().or(z.literal("")),
    telefone: z.string().trim().max(30).optional().or(z.literal("")),
    dataNascimento: dataLocalOpcional,
  })
  .superRefine((dados, ctx) => {
    const ok = dados.tipoPessoa === "FISICA" ? validarCpf(dados.cpfCnpj) : validarCnpj(dados.cpfCnpj);
    if (!ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cpfCnpj"],
        message: dados.tipoPessoa === "FISICA" ? "CPF inválido" : "CNPJ inválido",
      });
    }
  })
  .transform((d) => ({ ...d, cpfCnpj: normalizarCpf(d.cpfCnpj) }));

export const atualizarSacadoSchema = z.object({
  nome: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().email("E-mail inválido").nullable().optional().or(z.literal("")),
  telefone: z.string().trim().max(30).nullable().optional().or(z.literal("")),
  dataNascimento: dataLocalOpcional,
});

export const listarSacadosSchema = z.object({
  busca: z.string().trim().optional(),
});

export type SacadoDados = z.infer<typeof sacadoDadosSchema>;
export type AtualizarSacadoInput = z.infer<typeof atualizarSacadoSchema>;
