import { z } from "zod";
import { campoValido } from "./mapeamento-importacao.constants";

const tabelaDestino = z.enum(["ALUNO", "MATRICULA", "PARCELA"]);
const acaoAusente = z.enum(["VALOR_PADRAO", "NAO_IMPORTAR"]);

const camposComuns = {
  colunaPlanilha: z.string().trim().min(1, "Coluna da planilha é obrigatória").max(100),
  tabelaDestino,
  campoDestino: z.string().trim().min(1, "Campo de destino é obrigatório").max(100),
  acaoAusente,
  valorPadrao: z.string().trim().max(200).optional(),
  ativo: z.boolean().optional(),
};

function validarCampoConhecido<T extends { tabelaDestino: z.infer<typeof tabelaDestino>; campoDestino: string }>(
  obj: T,
  ctx: z.RefinementCtx,
) {
  if (!campoValido(obj.tabelaDestino, obj.campoDestino)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["campoDestino"],
      message: `Campo "${obj.campoDestino}" não é configurável para a tabela ${obj.tabelaDestino}`,
    });
  }
}

export const criarMapeamentoSchema = z
  .object(camposComuns)
  .superRefine(validarCampoConhecido);

export const atualizarMapeamentoSchema = z
  .object({
    colunaPlanilha: camposComuns.colunaPlanilha.optional(),
    tabelaDestino: tabelaDestino.optional(),
    campoDestino: camposComuns.campoDestino.optional(),
    acaoAusente: acaoAusente.optional(),
    valorPadrao: camposComuns.valorPadrao,
    ativo: z.boolean().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, "Informe ao menos um campo para atualizar");

export type CriarMapeamentoInput = z.infer<typeof criarMapeamentoSchema>;
export type AtualizarMapeamentoInput = z.infer<typeof atualizarMapeamentoSchema>;
