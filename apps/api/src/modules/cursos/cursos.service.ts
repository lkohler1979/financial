import { ConflictError, NotFoundError } from "../../shared/errors/app-error";
import { registrarAuditoria } from "../auditoria/auditoria.service";
import { cursosRepository } from "./cursos.repository";
import type { AtualizarCursoInput, CriarCursoInput, ListarCursosInput } from "./cursos.schema";

const ENTIDADE = "Curso";

export const cursosService = {
  async listar(params: ListarCursosInput) {
    const { page, pageSize, busca, situacao } = params;
    const { data, total } = await cursosRepository.list({
      busca,
      situacao,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { data, total, page, pageSize };
  },

  async buscarPorId(id: string) {
    const curso = await cursosRepository.findById(id);
    if (!curso) throw new NotFoundError("Curso não encontrado");
    return curso;
  },

  async criar(input: CriarCursoInput, usuarioId: string) {
    const existente = await cursosRepository.findByCodigo(input.codigo);
    if (existente) {
      throw new ConflictError("Já existe um curso com este código", { codigo: input.codigo });
    }

    const curso = await cursosRepository.create(input);

    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: curso.id,
      acao: "CRIACAO",
      detalhes: { codigo: curso.codigo, nome: curso.nome },
    });

    return curso;
  },

  async atualizar(id: string, input: AtualizarCursoInput, usuarioId: string) {
    await this.buscarPorId(id);

    // Código é editável, mas precisa continuar único.
    if (input.codigo) {
      const outro = await cursosRepository.findByCodigo(input.codigo);
      if (outro && outro.id !== id) {
        throw new ConflictError("Já existe outro curso com este código", { codigo: input.codigo });
      }
    }

    const curso = await cursosRepository.update(id, input);

    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: curso.id,
      acao: "ATUALIZACAO",
      detalhes: { camposAlterados: Object.keys(input) },
    });

    return curso;
  },

  async remover(id: string, usuarioId: string) {
    await this.buscarPorId(id);

    const matriculas = await cursosRepository.countMatriculas(id);
    if (matriculas > 0) {
      throw new ConflictError("Não é possível remover um curso com matrículas vinculadas", {
        matriculas,
      });
    }

    await cursosRepository.delete(id);

    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: id,
      acao: "EXCLUSAO",
    });
  },
};
