import { z } from "zod";

export const criarTagSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").max(50),
});

export type CriarTagInput = z.infer<typeof criarTagSchema>;
