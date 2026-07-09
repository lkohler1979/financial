import { z } from "zod";
import { SENHA_MENSAGEM, SENHA_REGEX } from "../auth/auth.schema";

const PERFIS = ["ADMINISTRADOR", "FINANCEIRO", "USUARIO"] as const;

export const criarUsuarioSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").max(200),
  email: z.string().trim().toLowerCase().email("E-mail inválido").max(200),
  senha: z.string().regex(SENHA_REGEX, SENHA_MENSAGEM),
  perfil: z.enum(PERFIS),
});

export const atualizarUsuarioSchema = z
  .object({
    nome: z.string().trim().min(1).max(200).optional(),
    perfil: z.enum(PERFIS).optional(),
    ativo: z.boolean().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, "Informe ao menos um campo para atualizar");

export const alterarSenhaSchema = z.object({
  senha: z.string().regex(SENHA_REGEX, SENHA_MENSAGEM),
});

export const listarUsuariosSchema = z.object({
  busca: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CriarUsuarioInput = z.infer<typeof criarUsuarioSchema>;
export type AtualizarUsuarioInput = z.infer<typeof atualizarUsuarioSchema>;
export type AlterarSenhaInput = z.infer<typeof alterarSenhaSchema>;
export type ListarUsuariosInput = z.infer<typeof listarUsuariosSchema>;
