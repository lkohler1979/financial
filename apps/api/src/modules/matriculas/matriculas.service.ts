import { Prisma } from "@prisma/client";
import { ConflictError, NotFoundError } from "../../shared/errors/app-error";
import { registrarAuditoria } from "../auditoria/auditoria.service";
import { alunosRepository } from "../alunos/alunos.repository";
import { cursosRepository } from "../cursos/cursos.repository";
import { matriculasRepository } from "./matriculas.repository";
import type {
  AtualizarMatriculaInput,
  CriarMatriculaInput,
  ListarMatriculasInput,
} from "./matriculas.schema";

const ENTIDADE = "Matricula";

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
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const dataComResumo = data.map(({ parcelas, ...matricula }) => ({
      ...matricula,
      resumoParcelas: resumoParcelas(parcelas),
    }));
    return { data: dataComResumo, total, page, pageSize };
  },

  async buscarPorId(id: string) {
    const matricula = await matriculasRepository.findById(id);
    if (!matricula) throw new NotFoundError("Matrícula não encontrada");
    return matricula;
  },

  async criar(input: CriarMatriculaInput, usuarioId: string) {
    await garantirAlunoExiste(input.alunoId);
    await garantirCursoExiste(input.cursoId);

    if (input.numeroMatricula) {
      await garantirChaveNaturalLivre(input.alunoId, input.cursoId, input.numeroMatricula);
    }

    const data: Prisma.MatriculaCreateInput = {
      aluno: { connect: { id: input.alunoId } },
      curso: { connect: { id: input.cursoId } },
      numeroMatricula: input.numeroMatricula,
      dataMatricula: input.dataMatricula,
      contratoAssinado: input.contratoAssinado,
      situacao: input.situacao,
      observacoes: input.observacoes,
    };

    const matricula = await matriculasRepository.create(data);

    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: matricula.id,
      acao: "CRIACAO",
      detalhes: { alunoId: input.alunoId, cursoId: input.cursoId },
    });

    return matricula;
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
      ...(input.situacao !== undefined ? { situacao: input.situacao } : {}),
      ...(input.observacoes !== undefined ? { observacoes: input.observacoes } : {}),
    };

    const matricula = await matriculasRepository.update(id, data);

    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: matricula.id,
      acao: "ATUALIZACAO",
      detalhes: { camposAlterados: Object.keys(input) },
    });

    return matricula;
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
