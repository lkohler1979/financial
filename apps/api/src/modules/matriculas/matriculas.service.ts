import { Prisma } from "@prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors/app-error";
import { registrarAuditoria } from "../auditoria/auditoria.service";
import { alunosRepository } from "../alunos/alunos.repository";
import { cursosRepository } from "../cursos/cursos.repository";
import { financeiroService } from "../financeiro/financeiro.service";
import { tiposCobrancaRepository } from "../tipos-cobranca/tipos-cobranca.repository";
import { tiposCobrancaService } from "../tipos-cobranca/tipos-cobranca.service";
import { aplicarDesconto, cuponsService } from "../cupons/cupons.service";
import { matriculasRepository } from "./matriculas.repository";
import type {
  AtualizarMatriculaInput,
  CriarMatriculaInput,
  ListarMatriculasInput,
} from "./matriculas.schema";

const ENTIDADE = "Matricula";

/** Troca o `_count.parcelas` (forma crua do Prisma) pelo campo
 * `quantidadeParcelas`, usado pelo frontend para decidir se mostra o botão
 * "Gerar parcelas" (só faz sentido quando a matrícula ainda não tem nenhuma). */
function serializarMatricula<T extends { _count: { parcelas: number } }>(matricula: T) {
  const { _count, ...resto } = matricula;
  return { ...resto, quantidadeParcelas: _count.parcelas };
}

/**
 * Calcula o mês/ano da primeira parcela: o mês de `dataBase` (dataMatricula,
 * ou hoje se omitida) no `diaVencimento` escolhido — ou o mês seguinte, se
 * esse dia já tiver passado (evita a matrícula nascer com uma parcela já
 * vencida). Pedido do usuário, 2026-10-01.
 */
function calcularMesPrimeiraParcela(
  dataBase: Date,
  diaVencimento: number,
): { ano: number; mes: number } {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const ano = dataBase.getFullYear();
  const mes = dataBase.getMonth();
  const candidata = new Date(ano, mes, diaVencimento);
  return candidata < hoje ? { ano, mes: mes + 1 } : { ano, mes };
}

/** Divide `valorTotal` em `quantidade` parcelas iguais (2 casas decimais) —
 * a última parcela absorve a diferença de arredondamento, para a soma bater
 * exatamente com `valorTotal`. */
function dividirValorEmParcelas(valorTotal: number, quantidade: number): number[] {
  const base = Math.floor((valorTotal / quantidade) * 100) / 100;
  const valores = new Array(quantidade).fill(base) as number[];
  const diferenca = Math.round((valorTotal - base * quantidade) * 100) / 100;
  valores[quantidade - 1] = Math.round((valores[quantidade - 1] + diferenca) * 100) / 100;
  return valores;
}

/**
 * Gera as N parcelas mensais de uma matrícula recém-criada, a partir de
 * valorCurso/numeroParcelas/diaVencimento (pedido do usuário, 2026-10-01) —
 * reaproveita financeiroService.criar (mesma validação/auditoria de uma
 * parcela lançada manualmente), uma por vez, em sequência.
 */
async function gerarParcelasAutomaticas(
  matriculaId: string,
  dados: { valorCurso: number; numeroParcelas: number; diaVencimento: number; dataMatricula?: Date },
  usuarioId: string,
): Promise<void> {
  const { ano, mes } = calcularMesPrimeiraParcela(dados.dataMatricula ?? new Date(), dados.diaVencimento);
  const valores = dividirValorEmParcelas(dados.valorCurso, dados.numeroParcelas);

  for (let indice = 0; indice < dados.numeroParcelas; indice++) {
    await financeiroService.criar(
      {
        matriculaId,
        codTitulo: String(indice + 1),
        parcela: `${indice + 1}/${dados.numeroParcelas}`,
        vencimento: new Date(ano, mes + indice, dados.diaVencimento),
        valor: valores[indice],
      },
      usuarioId,
    );
  }
}

interface CobrancaResolvida {
  tipo: { id: string; nome: string; usaValorDoCurso: boolean; prefixoTitulo: string | null };
  valor: number;
  numeroParcelas: number;
  primeiroVencimento: Date;
  formaPagamento: "BOLETO" | "PIX" | "CREDIT_CARD" | null;
}

/** Vencimento da parcela `indice`: mesmo dia do primeiro vencimento nos meses
 * seguintes — em mês mais curto (ex.: dia 31 em fevereiro) cai no último dia. */
function vencimentoDaParcela(primeiro: Date, indice: number): Date {
  const ano = primeiro.getFullYear();
  const mes = primeiro.getMonth() + indice;
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  return new Date(ano, mes, Math.min(primeiro.getDate(), ultimoDia));
}

/**
 * Valida as cobranças escolhidas no cadastro (tipo existe e está ativo, número
 * de parcelas é uma das opções do tipo, há valor, todos os tipos obrigatórios
 * foram incluídos) ANTES de criar a matrícula, pra nunca deixar um registro
 * pela metade.
 */
async function resolverCobrancas(
  cobrancas: NonNullable<CriarMatriculaInput["cobrancas"]>,
  valorPadraoCurso: number | null,
  cupom: { tipoDesconto: "PERCENTUAL" | "VALOR"; valor: unknown } | null,
): Promise<CobrancaResolvida[]> {
  const formasHabilitadas = await tiposCobrancaService.formasPagamentoHabilitadas();
  const tipos = await tiposCobrancaRepository.findManyByIds(cobrancas.map((c) => c.tipoCobrancaId));
  const obrigatorios = await tiposCobrancaRepository.listObrigatoriosAtivos();

  const resolvidas = cobrancas.map((c) => {
    const tipo = tipos.find((t) => t.id === c.tipoCobrancaId);
    if (!tipo || !tipo.ativo) throw new ValidationError("Tipo de cobrança inválido ou inativo");
    if (!tipo.opcoesParcelas.includes(c.numeroParcelas)) {
      throw new ValidationError(
        `${tipo.nome}: parcelamento em ${c.numeroParcelas}x não é uma opção disponível`,
      );
    }
    const valor =
      c.valor ??
      (tipo.usaValorDoCurso
        ? valorPadraoCurso
        : tipo.valorPadrao == null
          ? null
          : Number(tipo.valorPadrao));
    if (valor == null) {
      throw new ValidationError(`${tipo.nome}: informe o valor (o curso/tipo não tem valor padrão)`);
    }
    const formaPagamento = c.formaPagamento ?? tipo.formaPagamentoPadrao ?? null;
    if (formaPagamento && !formasHabilitadas.includes(formaPagamento)) {
      throw new ValidationError(`${tipo.nome}: a forma de pagamento escolhida não está habilitada`);
    }
    return {
      tipo,
      // Cupom só incide nos tipos que aceitam (ex.: Mensalidade).
      valor: cupom && tipo.aceitaCupom ? aplicarDesconto(cupom, valor) : valor,
      numeroParcelas: c.numeroParcelas,
      primeiroVencimento: c.primeiroVencimento,
      formaPagamento,
    };
  });

  if (cupom && !cobrancas.some((c) => tipos.find((t) => t.id === c.tipoCobrancaId)?.aceitaCupom)) {
    throw new ValidationError("Nenhuma das cobranças escolhidas aceita cupom de desconto");
  }

  for (const obrigatorio of obrigatorios) {
    if (!resolvidas.some((r) => r.tipo.id === obrigatorio.id)) {
      throw new ValidationError(`A cobrança "${obrigatorio.nome}" é obrigatória`);
    }
  }
  return resolvidas;
}

/** Gera as parcelas de uma cobrança escolhida — mesma validação/auditoria de
 * uma parcela lançada manualmente (financeiroService.criar). */
async function gerarParcelasDaCobranca(
  matriculaId: string,
  cobranca: CobrancaResolvida,
  usuarioId: string,
): Promise<void> {
  const valores = dividirValorEmParcelas(cobranca.valor, cobranca.numeroParcelas);
  for (let indice = 0; indice < cobranca.numeroParcelas; indice++) {
    await financeiroService.criar(
      {
        matriculaId,
        codTitulo: `${cobranca.tipo.prefixoTitulo ?? ""}${indice + 1}`,
        parcela: `${indice + 1}/${cobranca.numeroParcelas}`,
        vencimento: vencimentoDaParcela(cobranca.primeiroVencimento, indice),
        valor: valores[indice],
        tipoTitulo: cobranca.tipo.nome,
        ...(cobranca.formaPagamento ? { formaPagamento: cobranca.formaPagamento } : {}),
      },
      usuarioId,
    );
  }
}

interface ParcelaResumida {
  status: string;
  vencimento: Date;
}

/**
 * "Vencida" não é um StatusParcela — é derivada de EM_ABERTO + vencimento no
 * passado (mesmo critério usado na ficha de cobrança, ficha-cobranca.component.ts).
 */
function resumoParcelas(parcelas: ParcelaResumida[]) {
  const hoje = new Date();
  const resumo = {
    vencidas: 0,
    emAberto: 0,
    pagas: 0,
    protestadas: 0,
    renegociadas: 0,
    canceladas: 0,
  };

  for (const parcela of parcelas) {
    if (parcela.status === "EM_ABERTO") {
      if (parcela.vencimento < hoje) resumo.vencidas += 1;
      else resumo.emAberto += 1;
    } else if (parcela.status === "PAGO") resumo.pagas += 1;
    else if (parcela.status === "PROTESTADO" || parcela.status === "PROTESTO_ENVIADO")
      resumo.protestadas += 1;
    else if (parcela.status === "RENEGOCIADO") resumo.renegociadas += 1;
    else if (parcela.status === "CANCELADO") resumo.canceladas += 1;
  }

  return resumo;
}

async function garantirAlunoExiste(alunoId: string): Promise<void> {
  const aluno = await alunosRepository.findById(alunoId);
  if (!aluno) throw new NotFoundError("Aluno não encontrado");
}

async function garantirCursoExiste(cursoId: string): Promise<void> {
  const curso = await cursosRepository.findById(cursoId);
  if (!curso) throw new NotFoundError("Curso não encontrado");
}

async function garantirChaveNaturalLivre(
  alunoId: string,
  cursoId: string,
  numeroMatricula: string,
  ignorarId?: string,
): Promise<void> {
  const existente = await matriculasRepository.findByChaveNatural(
    alunoId,
    cursoId,
    numeroMatricula,
  );
  if (existente && existente.id !== ignorarId) {
    throw new ConflictError("Já existe uma matrícula com este número para o mesmo aluno e curso", {
      alunoId,
      cursoId,
      numeroMatricula,
    });
  }
}

export const matriculasService = {
  async listar(params: ListarMatriculasInput) {
    const {
      page,
      pageSize,
      alunoId,
      cursoId,
      situacao,
      alunoNome,
      alunoCpf,
      dataMatriculaInicio,
      dataMatriculaFim,
      situacaoCobrancaId,
      tagId,
      contratoAssinado,
      tcdAssinado,
    } = params;
    const { data, total } = await matriculasRepository.list({
      alunoId,
      cursoId,
      situacao,
      alunoNome,
      alunoCpf,
      dataMatriculaInicio,
      dataMatriculaFim,
      situacaoCobrancaId,
      tagId,
      contratoAssinado,
      tcdAssinado,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const dataComResumo = data.map(({ parcelas, _count, ...matricula }) => ({
      ...matricula,
      resumoParcelas: resumoParcelas(parcelas),
      quantidadeParcelas: _count.parcelas,
    }));
    return { data: dataComResumo, total, page, pageSize };
  },

  listarAgentes() {
    return matriculasRepository.listarAgentes();
  },

  async buscarPorId(id: string) {
    const matricula = await matriculasRepository.findById(id);
    if (!matricula) throw new NotFoundError("Matrícula não encontrada");
    return serializarMatricula(matricula);
  },

  async criar(input: CriarMatriculaInput, usuarioId: string) {
    await garantirAlunoExiste(input.alunoId);
    await garantirCursoExiste(input.cursoId);

    if (input.numeroMatricula) {
      await garantirChaveNaturalLivre(input.alunoId, input.cursoId, input.numeroMatricula);
    }

    // Geração automática de parcelas (pedido do usuário, 2026-10-01): só
    // dispara quando valorCurso E numeroParcelas vêm preenchidos; nesse caso
    // diaVencimento passa a ser obrigatório. Validado antes de criar a
    // matrícula, para não deixar um registro "pela metade" se faltar o dia.
    const curso = await cursosRepository.findById(input.cursoId);
    const cupom = input.cupomCodigo ? await cuponsService.obterValido(input.cupomCodigo) : null;
    const cobrancas = input.cobrancas?.length
      ? await resolverCobrancas(
          input.cobrancas,
          curso?.valorPadrao == null ? null : Number(curso.valorPadrao),
          cupom,
        )
      : [];
    if (cupom && cobrancas.length === 0) {
      throw new ValidationError("Cupom só pode ser aplicado junto com as cobranças do cadastro");
    }
    // A mensalidade (valor vindo do curso) também fica gravada na matrícula,
    // pra tela de edição mostrar valor/parcelas/dia como antes.
    const mensalidade = cobrancas.find((c) => c.tipo.usaValorDoCurso);

    const gerarParcelas =
      cobrancas.length === 0 &&
      input.valorCurso !== undefined &&
      input.numeroParcelas !== undefined;
    if (gerarParcelas && input.diaVencimento === undefined) {
      throw new ValidationError(
        "Informe o dia de vencimento para gerar as parcelas automaticamente",
      );
    }

    const data: Prisma.MatriculaCreateInput = {
      aluno: { connect: { id: input.alunoId } },
      curso: { connect: { id: input.cursoId } },
      numeroMatricula: input.numeroMatricula,
      dataMatricula: input.dataMatricula,
      contratoAssinado: input.contratoAssinado,
      tcdAssinado: input.tcdAssinado,
      situacao: input.situacao,
      observacoes: input.observacoes,
      ...(input.agenteEducacionalId
        ? { agenteEducacional: { connect: { id: input.agenteEducacionalId } } }
        : {}),
      ...(cupom ? { cupom: { connect: { id: cupom.id } } } : {}),
      valorCurso: mensalidade?.valor ?? input.valorCurso,
      numeroParcelas: mensalidade?.numeroParcelas ?? input.numeroParcelas,
      diaVencimento: mensalidade
        ? Math.min(mensalidade.primeiroVencimento.getDate(), 28)
        : input.diaVencimento,
    };

    const matricula = await matriculasRepository.create(data);

    for (const cobranca of cobrancas) {
      await gerarParcelasDaCobranca(matricula.id, cobranca, usuarioId);
    }

    if (gerarParcelas) {
      await gerarParcelasAutomaticas(
        matricula.id,
        {
          valorCurso: input.valorCurso as number,
          numeroParcelas: input.numeroParcelas as number,
          diaVencimento: input.diaVencimento as number,
          dataMatricula: input.dataMatricula,
        },
        usuarioId,
      );
    }

    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: matricula.id,
      acao: "CRIACAO",
      detalhes: { alunoId: input.alunoId, cursoId: input.cursoId },
    });

    return serializarMatricula(matricula);
  },

  /**
   * Gera as parcelas de uma matrícula já existente, a partir dos valores já
   * salvos (valorCurso/numeroParcelas/diaVencimento) — botão "Gerar
   * parcelas" na tela de edição (pedido do usuário, 2026-10-01), para o caso
   * de uma matrícula ter sido criada sem esses campos e só depois ganhar a
   * cobrança configurada, ou qualquer correção antes da primeira geração.
   * Só roda uma vez: uma matrícula que já tem parcela nenhuma gera de novo
   * (evita duplicar cobrança).
   */
  async gerarParcelas(id: string, usuarioId: string) {
    const matricula = await this.buscarPorId(id);

    if (
      matricula.valorCurso == null ||
      matricula.numeroParcelas == null ||
      matricula.diaVencimento == null
    ) {
      throw new ValidationError(
        "Preencha valor do curso, número de parcelas e dia de vencimento antes de gerar as parcelas",
      );
    }

    if (matricula.quantidadeParcelas > 0) {
      throw new ConflictError("Esta matrícula já possui parcelas geradas", {
        quantidadeParcelas: matricula.quantidadeParcelas,
      });
    }

    await gerarParcelasAutomaticas(
      id,
      {
        valorCurso: Number(matricula.valorCurso),
        numeroParcelas: matricula.numeroParcelas,
        diaVencimento: matricula.diaVencimento,
        dataMatricula: matricula.dataMatricula ?? undefined,
      },
      usuarioId,
    );

    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: id,
      acao: "ATUALIZACAO",
      detalhes: { acao: "parcelas_geradas", numeroParcelas: matricula.numeroParcelas },
    });

    return { parcelasGeradas: matricula.numeroParcelas };
  },

  async atualizar(id: string, input: AtualizarMatriculaInput, usuarioId: string) {
    const atual = await this.buscarPorId(id);

    const alunoId = input.alunoId ?? atual.alunoId;
    const cursoId = input.cursoId ?? atual.cursoId;
    const numeroMatricula = input.numeroMatricula ?? atual.numeroMatricula;

    if (input.alunoId) await garantirAlunoExiste(input.alunoId);
    if (input.cursoId) await garantirCursoExiste(input.cursoId);

    // Revalida a chave natural se qualquer um dos três componentes mudou.
    const chaveMudou =
      input.alunoId !== undefined ||
      input.cursoId !== undefined ||
      input.numeroMatricula !== undefined;
    if (chaveMudou && numeroMatricula) {
      await garantirChaveNaturalLivre(alunoId, cursoId, numeroMatricula, id);
    }

    const data: Prisma.MatriculaUpdateInput = {
      ...(input.alunoId ? { aluno: { connect: { id: input.alunoId } } } : {}),
      ...(input.cursoId ? { curso: { connect: { id: input.cursoId } } } : {}),
      ...(input.numeroMatricula !== undefined ? { numeroMatricula: input.numeroMatricula } : {}),
      ...(input.dataMatricula !== undefined ? { dataMatricula: input.dataMatricula } : {}),
      ...(input.contratoAssinado !== undefined ? { contratoAssinado: input.contratoAssinado } : {}),
      ...(input.tcdAssinado !== undefined ? { tcdAssinado: input.tcdAssinado } : {}),
      ...(input.situacao !== undefined ? { situacao: input.situacao } : {}),
      ...(input.observacoes !== undefined ? { observacoes: input.observacoes } : {}),
      ...(input.agenteEducacionalId
        ? { agenteEducacional: { connect: { id: input.agenteEducacionalId } } }
        : input.agenteEducacionalId === ""
          ? { agenteEducacional: { disconnect: true } }
          : {}),
      // Só grava o valor — editar aqui nunca regenera/apaga parcelas já
      // existentes (a geração automática só roda na criação, ver criar()).
      ...(input.valorCurso !== undefined ? { valorCurso: input.valorCurso } : {}),
      ...(input.numeroParcelas !== undefined ? { numeroParcelas: input.numeroParcelas } : {}),
      ...(input.diaVencimento !== undefined ? { diaVencimento: input.diaVencimento } : {}),
    };

    const matricula = await matriculasRepository.update(id, data);

    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: matricula.id,
      acao: "ATUALIZACAO",
      detalhes: { camposAlterados: Object.keys(input) },
    });

    return serializarMatricula(matricula);
  },

  async remover(id: string, usuarioId: string) {
    await this.buscarPorId(id);

    // Append-first: matrícula com parcelas guarda histórico financeiro que
    // jamais deve ser excluído (PRD seção 12).
    const parcelas = await matriculasRepository.countParcelas(id);
    if (parcelas > 0) {
      throw new ConflictError("Não é possível remover uma matrícula com parcelas vinculadas", {
        parcelas,
      });
    }

    await matriculasRepository.delete(id);

    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: id,
      acao: "EXCLUSAO",
    });
  },
};
