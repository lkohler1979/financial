import { z } from "zod";

const dadosMatricula = {
  numeroMatricula: z.string().trim().max(50).optional(),
  dataMatricula: z.coerce.date().optional(),
  contratoAssinado: z.boolean().optional(),
  tcdAssinado: z.boolean().optional(),
  situacao: z.string().trim().min(1).max(50).optional(),
  observacoes: z.string().trim().max(1000).optional(),
  agenteEducacionalId: z.string().uuid().optional().or(z.literal("")),
  // Integração com Asaas (pedido do usuário): informando valorCurso +
  // numeroParcelas (+ diaVencimento) na criação, o sistema gera as parcelas
  // mensais automaticamente (ver matriculas.service.ts). Nenhum dos três é
  // obrigatório — matrícula sem cobrança associada continua válida.
  valorCurso: z.coerce.number().positive("Valor do curso deve ser maior que zero").optional(),
  numeroParcelas: z.coerce
    .number()
    .int()
    .positive("Número de parcelas deve ser maior que zero")
    .max(360)
    .optional(),
  diaVencimento: z.coerce
    .number()
    .int()
    .min(1, "Dia de vencimento deve ser entre 1 e 28")
    .max(28, "Dia de vencimento deve ser entre 1 e 28")
    .optional(),
};

// Cobranças escolhidas no cadastro (uma por tipo: Mensalidade, Taxa de
// matrícula...). O valor é opcional — cai no padrão do curso/tipo.
// Data "AAAA-MM-DD" (input type=date) vira meia-noite no fuso local (Brasil) —
// z.coerce.date() a leria como UTC e o dia recuaria ao calcular o vencimento.
const dataLocal = z.preprocess((v) => {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [ano, mes, dia] = v.split("-").map(Number);
    return new Date(ano, mes - 1, dia);
  }
  return v;
}, z.coerce.date());

const cobrancaSchema = z.object({
  tipoCobrancaId: z.string().uuid("tipoCobrancaId inválido"),
  valor: z.coerce.number().positive("Valor deve ser maior que zero").optional(),
  numeroParcelas: z.coerce.number().int().positive().max(360),
  primeiroVencimento: dataLocal,
  formaPagamento: z.enum(["BOLETO", "PIX", "CREDIT_CARD"]).optional(),
  // Observação do título (balão "Obs." do cadastro) — vai para cada parcela gerada.
  observacoes: z.string().trim().max(1000).optional(),
});

export const alterarSituacaoSchema = z.object({
  situacao: z.string().trim().min(1, "Informe a nova situação"),
  periodoLetivo: z.string().trim().max(50).nullable().optional(),
  motivo: z.string().trim().max(500).nullable().optional(),
  observacoes: z.string().trim().max(1000).nullable().optional(),
});

export const criarMatriculaSchema = z.object({
  cobrancas: z.array(cobrancaSchema).optional(),
  // Só cupons já cadastrados (e válidos) são aceitos — ver cupons.service.ts.
  cupomCodigo: z.string().trim().min(1).optional(),
  alunoId: z.string().uuid("alunoId inválido"),
  cursoId: z.string().uuid("cursoId inválido"),
  ...dadosMatricula,
});

// Vínculo aluno/curso e número da matrícula podem ser ajustados na edição.
export const atualizarMatriculaSchema = z
  .object({
    alunoId: z.string().uuid("alunoId inválido").optional(),
    cursoId: z.string().uuid("cursoId inválido").optional(),
    ...dadosMatricula,
  })
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, "Informe ao menos um campo para atualizar");

export const listarMatriculasSchema = z.object({
  alunoId: z.string().uuid().optional(),
  cursoId: z.string().uuid().optional(),
  situacao: z.string().trim().optional(),
  alunoNome: z.string().trim().optional(),
  alunoCpf: z.string().trim().optional(),
  dataMatriculaInicio: z.coerce.date().optional(),
  dataMatriculaFim: z.coerce.date().optional(),
  situacaoCobrancaId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  contratoAssinado: z.coerce.boolean().optional(),
  tcdAssinado: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CriarMatriculaInput = z.infer<typeof criarMatriculaSchema>;
export type AtualizarMatriculaInput = z.infer<typeof atualizarMatriculaSchema>;
export type ListarMatriculasInput = z.infer<typeof listarMatriculasSchema>;
