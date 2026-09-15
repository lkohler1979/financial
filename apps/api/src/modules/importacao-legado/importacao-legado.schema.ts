import { z } from "zod";

export const buscarPorCpfSchema = z.object({
  cpf: z.string().trim().min(1, "CPF é obrigatório"),
});

export type BuscarPorCpfInput = z.infer<typeof buscarPorCpfSchema>;

export const confirmarImportacaoSchema = z.object({
  cpf: z.string().trim().min(1, "CPF é obrigatório"),
  // 1 entrada por curso do legado que o usuário mexeu na tela de
  // pré-visualização — cada uma já com o Curso do Ethos escolhido
  // manualmente (decisão do usuário, 2026-09-15: mapeamento de curso é
  // sempre manual, nunca automático — ver PENDENCIAS.md).
  selecoes: z
    .array(
      z.object({
        alunocursoId: z.string().trim().min(1),
        cursoEthosId: z.string().trim().min(1, "Selecione o curso correspondente no Ethos"),
        // Só relevante quando a Matrícula ainda não existe no Ethos —
        // decisão do usuário, 2026-09-15: se o aluno/matrícula não existir,
        // o usuário escolhe se quer importar; se não, as parcelas desse
        // curso não são importadas (validado de novo no service, não só
        // confiado no frontend).
        importarMatricula: z.boolean(),
        // Títulos (parcelas) marcados para importar/atualizar — parcelas já
        // existentes no Ethos têm sua situação de pagamento atualizada a
        // partir do legado; as que não existem são criadas.
        titulosSelecionados: z.array(z.string().trim().min(1)).default([]),
      }),
    )
    .min(1, "Selecione ao menos um curso"),
});

export type ConfirmarImportacaoInput = z.infer<typeof confirmarImportacaoSchema>;
