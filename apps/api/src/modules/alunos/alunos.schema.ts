import { z } from "zod";
import { normalizarCpf, validarCpf } from "../../shared/utils/cpf";

// Campos de dados do aluno (contato + endereço). O CPF é tratado à parte porque
// é a chave única e não é editável após a criação.
const dadosAluno = {
  nome: z.string().trim().min(1, "Nome é obrigatório").max(200),
  tipoPessoa: z.string().trim().max(50).optional(),
  email: z.string().trim().email("E-mail inválido").max(200).optional().or(z.literal("")),
  telefone1: z.string().trim().max(30).optional(),
  telefone2: z.string().trim().max(30).optional(),
  cep: z.string().trim().max(15).optional(),
  endereco: z.string().trim().max(255).optional(),
  numero: z.string().trim().max(20).optional(),
  complemento: z.string().trim().max(100).optional(),
  bairro: z.string().trim().max(100).optional(),
  cidade: z.string().trim().max(100).optional(),
  estado: z.string().trim().max(50).optional(),
};

export const criarAlunoSchema = z.object({
  cpf: z
    .string()
    .refine((v) => validarCpf(v), "CPF inválido")
    .transform(normalizarCpf),
  ...dadosAluno,
});

// CPF não faz parte do update: é a identidade do aluno (PRD seção 7).
export const atualizarAlunoSchema = z
  .object(dadosAluno)
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, "Informe ao menos um campo para atualizar");

export const listarAlunosSchema = z.object({
  busca: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CriarAlunoInput = z.infer<typeof criarAlunoSchema>;
export type AtualizarAlunoInput = z.infer<typeof atualizarAlunoSchema>;
export type ListarAlunosInput = z.infer<typeof listarAlunosSchema>;
