import { ConflictError, NotFoundError } from "../../shared/errors/app-error";
import { registrarAuditoria } from "../auditoria/auditoria.service";
import { tiposCobrancaRepository } from "./tipos-cobranca.repository";
import type {
  AtualizarTipoCobrancaInput,
  CriarTipoCobrancaInput,
} from "./tipos-cobranca.schema";

const ENTIDADE = "TipoCobranca";

// Prisma devolve Decimal; a API expõe número.
function serializar<T extends { valorPadrao: unknown }>(tipo: T) {
  return { ...tipo, valorPadrao: tipo.valorPadrao == null ? null : Number(tipo.valorPadrao) };
}

export const tiposCobrancaService = {
  async listar(incluirInativos: boolean) {
    const tipos = await tiposCobrancaRepository.list(incluirInativos);
    return tipos.map(serializar);
  },

  async criar(input: CriarTipoCobrancaInput, usuarioId: string) {
    if (await tiposCobrancaRepository.findByNome(input.nome)) {
      throw new ConflictError("Já existe um tipo de cobrança com este nome", { nome: input.nome });
    }
    const tipo = await tiposCobrancaRepository.create({
      ...input,
      valorPadrao: input.valorPadrao ?? null,
      prefixoTitulo: input.prefixoTitulo || null,
    });
    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: tipo.id,
      acao: "CRIACAO",
      detalhes: { nome: tipo.nome },
    });
    return serializar(tipo);
  },

  async atualizar(id: string, input: AtualizarTipoCobrancaInput, usuarioId: string) {
    const atual = await tiposCobrancaRepository.findById(id);
    if (!atual) throw new NotFoundError("Tipo de cobrança não encontrado");

    if (input.nome && input.nome !== atual.nome) {
      if (await tiposCobrancaRepository.findByNome(input.nome)) {
        throw new ConflictError("Já existe um tipo de cobrança com este nome", { nome: input.nome });
      }
    }

    const tipo = await tiposCobrancaRepository.update(id, {
      ...input,
      ...(input.prefixoTitulo !== undefined ? { prefixoTitulo: input.prefixoTitulo || null } : {}),
    });
    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: id,
      acao: "ATUALIZACAO",
      detalhes: { camposAlterados: Object.keys(input) },
    });
    return serializar(tipo);
  },
};
