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
    cep: z.string().trim().max(10).optional().or(z.literal("")),
    endereco: z.string().trim().max(200).optional().or(z.literal("")),
    numero: z.string().trim().max(20).optional().or(z.literal("")),
    complemento: z.string().trim().max(100).optional().or(z.literal("")),
    bairro: z.string().trim().max(100).optional().or(z.literal("")),
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
  cep: z.string().trim().max(10).nullable().optional().or(z.literal("")),
  endereco: z.string().trim().max(200).nullable().optional().or(z.literal("")),
  numero: z.string().trim().max(20).nullable().optional().or(z.literal("")),
  complemento: z.string().trim().max(100).nullable().optional().or(z.literal("")),
  bairro: z.string().trim().max(100).nullable().optional().or(z.literal("")),
});

export const listarSacadosSchema = z.object({
  busca: z.string().trim().optional(),
});

export const paginarSacadosSchema = z.object({
  busca: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type SacadoDados = z.infer<typeof sacadoDadosSchema>;
export type AtualizarSacadoInput = z.infer<typeof atualizarSacadoSchema>;
