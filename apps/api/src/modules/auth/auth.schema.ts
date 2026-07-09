import { z } from "zod";

// Regra do usuário (2026-07-07): senha com no mínimo 6 caracteres alfanuméricos.
export const SENHA_REGEX = /^[a-zA-Z0-9]{6,}$/;
export const SENHA_MENSAGEM = "Senha deve ter ao menos 6 caracteres, apenas letras e números";

export const loginSchema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  senha: z.string().min(1, "Senha é obrigatória"),
});

export type LoginInput = z.infer<typeof loginSchema>;
