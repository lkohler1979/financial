import { ConflictError, NotFoundError } from "../../shared/errors/app-error";
import { situacoesRepository } from "./situacoes.repository";
import type {
  AtualizarSituacaoInput,
  CriarSituacaoInput,
  ListarSituacoesInput,
} from "./situacoes.schema";

export const situacoesService = {
  listar(params: ListarSituacoesInput) {
    return situacoesRepository.list(params.ativa);
  },

  async buscarPorId(id: string) {
    const situacao = await situacoesRepository.findById(id);
    if (!situacao) throw new NotFoundError("Situação de cobrança não encontrada");
    return situacao;
  },

  async criar(input: CriarSituacaoInput) {
    const existente = await situacoesRepository.findByNome(input.nome);
    if (existente) throw new ConflictError("Já existe uma situação de cobrança com este nome");
    return situacoesRepository.create(input);
  },

  async atualizar(id: string, input: AtualizarSituacaoInput) {
    await this.buscarPorId(id);

    if (input.nome) {
      const existente = await situacoesRepository.findByNome(input.nome);
      if (existente && existente.id !== id) {
        throw new ConflictError("Já existe uma situação de cobrança com este nome");
      }
    }

    return situacoesRepository.update(id, input);
  },

  async remover(id: string) {
    await this.buscarPorId(id);

    const matriculas = await situacoesRepository.countMatriculas(id);
    if (matriculas > 0) {
      throw new ConflictError("Não é possível remover uma situação em uso por matrículas", {
        matriculas,
      });
    }

    await situacoesRepository.delete(id);
  },
};
