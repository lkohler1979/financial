import { z } from "zod";

export const buscarPorCpfSchema = z.object({
  cpf: z.string().trim().min(1, "CPF é obrigatório"),
});

export type BuscarPorCpfInput = z.infer<typeof buscarPorCpfSchema>;

export const confirmarImportacaoSchema = z.object({
  cpf: z.string().trim().min(1, "CPF é obrigatório"),
  // Só os cursos que o usuário decidiu importar — cada um já com o Curso do
  // Ethos escolhido manualmente na tela de pré-visualização (decisão do
  // usuário, 2026-09-15: mapeamento de curso é sempre manual, nunca
  // automático — ver PENDENCIAS.md).
  selecoes: z
    .array(
      z.object({
        alunocursoId: z.string().trim().min(1),
        cursoEthosId: z.string().trim().min(1, "Selecione o curso correspondente no Ethos"),
      }),
    )
    .min(1, "Selecione ao menos um curso para importar"),
});

export type ConfirmarImportacaoInput = z.infer<typeof confirmarImportacaoSchema>;
