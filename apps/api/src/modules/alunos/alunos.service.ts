import { ConflictError, NotFoundError } from "../../shared/errors/app-error";
import { registrarAuditoria } from "../auditoria/auditoria.service";
import { alunosRepository } from "./alunos.repository";
import type { AtualizarAlunoInput, CriarAlunoInput, ListarAlunosInput } from "./alunos.schema";

const ENTIDADE = "Aluno";

// Remove strings vazias (ex.: e-mail "") para armazenar null em vez de "".
function limparVazios<T extends Record<string, unknown>>(obj: T): T {
  const resultado = { ...obj };
  for (const chave of Object.keys(resultado)) {
    if (resultado[chave] === "") {
      (resultado as Record<string, unknown>)[chave] = undefined;
    }
  }
  return resultado;
}

export const alunosService = {
  async listar(params: ListarAlunosInput) {
    const { page, pageSize, busca } = params;
    const { data, total } = await alunosRepository.list({
      busca,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { data, total, page, pageSize };
  },

  async buscarPorId(id: string) {
    const aluno = await alunosRepository.findById(id);
    if (!aluno) throw new NotFoundError("Aluno não encontrado");
    return aluno;
  },

  async criar(input: CriarAlunoInput, usuarioId: string) {
    const existente = await alunosRepository.findByCpf(input.cpf);
    if (existente) {
      throw new ConflictError("Já existe um aluno com este CPF", { cpf: input.cpf });
    }

    const aluno = await alunosRepository.create(limparVazios(input));

    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: aluno.id,
      acao: "CRIACAO",
      detalhes: { cpf: aluno.cpf, nome: aluno.nome },
    });

    return aluno;
  },

  async atualizar(id: string, input: AtualizarAlunoInput, usuarioId: string) {
    await this.buscarPorId(id);

    const aluno = await alunosRepository.update(id, limparVazios(input));

    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: aluno.id,
      acao: "ATUALIZACAO",
      detalhes: { camposAlterados: Object.keys(input) },
    });

    return aluno;
  },

  async remover(id: string, usuarioId: string) {
    await this.buscarPorId(id);

    // Sistema append-first: não removemos aluno que ainda possui matrículas
    // (e, portanto, histórico financeiro/de cobrança). PRD seção 12.
    const matriculas = await alunosRepository.countMatriculas(id);
    if (matriculas > 0) {
      throw new ConflictError("Não é possível remover um aluno com matrículas vinculadas", {
        matriculas,
      });
    }

    await alunosRepository.delete(id);

    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: id,
      acao: "EXCLUSAO",
    });
  },
};
