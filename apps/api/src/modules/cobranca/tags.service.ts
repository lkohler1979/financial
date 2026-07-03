import { ConflictError, NotFoundError } from "../../shared/errors/app-error";
import { tagsRepository } from "./tags.repository";
import type { CriarTagInput } from "./tags.schema";

export const tagsService = {
  listar() {
    return tagsRepository.list();
  },

  async criar(input: CriarTagInput) {
    const existente = await tagsRepository.findByNome(input.nome);
    if (existente) throw new ConflictError("Já existe uma TAG com este nome");
    return tagsRepository.create(input.nome);
  },

  async remover(id: string) {
    const tag = await tagsRepository.findById(id);
    if (!tag) throw new NotFoundError("TAG não encontrada");

    const matriculas = await tagsRepository.countMatriculas(id);
    if (matriculas > 0) {
      throw new ConflictError("Não é possível remover uma TAG em uso por matrículas", {
        matriculas,
      });
    }

    await tagsRepository.delete(id);
  },
};
