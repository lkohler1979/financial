import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors/app-error";
import { registrarAuditoria } from "../auditoria/auditoria.service";
import { sacadosRepository } from "./sacados.repository";
import type { AtualizarSacadoInput, SacadoDados } from "./sacados.schema";

const ENTIDADE = "Sacado";

const vazioParaNulo = (v: string | null | undefined) => (v ? v : null);

export const sacadosService = {
  buscar(busca?: string) {
    return sacadosRepository.buscar(busca);
  },

  listar(busca: string | undefined, page: number, pageSize: number) {
    return sacadosRepository
      .listar(busca, (page - 1) * pageSize, pageSize)
      .then((r) => ({ ...r, page, pageSize }));
  },

  /** Ficha do sacado com as matrículas que ele paga. */
  async ficha(id: string) {
    const sacado = await sacadosRepository.findComMatriculas(id);
    if (!sacado) throw new NotFoundError("Sacado não encontrado");
    return sacado;
  },

  /** Só remove sacado sem matrícula — o histórico financeiro nunca fica sem responsável. */
  async remover(id: string, usuarioId: string) {
    await this.buscarPorId(id);
    const matriculas = await sacadosRepository.countMatriculas(id);
    if (matriculas > 0) {
      throw new ConflictError("Não é possível remover um sacado com matrículas vinculadas", { matriculas });
    }
    await sacadosRepository.delete(id);
    await registrarAuditoria({ usuarioId, entidade: ENTIDADE, entidadeId: id, acao: "EXCLUSAO" });
  },

  async buscarPorId(id: string) {
    const sacado = await sacadosRepository.findById(id);
    if (!sacado) throw new NotFoundError("Sacado não encontrado");
    return sacado;
  },

  /**
   * Cadastra o sacado ou reaproveita o que já existe com o mesmo CPF/CNPJ —
   * o mesmo responsável (ex.: empresa) pode pagar várias matrículas. Um
   * cadastro existente não é sobrescrito pelo cadastro da matrícula.
   */
  async obterOuCriar(dados: SacadoDados, usuarioId: string) {
    const existente = await sacadosRepository.findByCpfCnpj(dados.cpfCnpj);
    if (existente) {
      if (existente.tipoPessoa !== dados.tipoPessoa) {
        throw new ValidationError("Já existe um sacado com este documento de outro tipo de pessoa");
      }
      return existente;
    }
    const sacado = await sacadosRepository.create({
      tipoPessoa: dados.tipoPessoa,
      cpfCnpj: dados.cpfCnpj,
      nome: dados.nome,
      email: vazioParaNulo(dados.email),
      telefone: vazioParaNulo(dados.telefone),
      dataNascimento: dados.tipoPessoa === "FISICA" ? (dados.dataNascimento ?? null) : null,
    });
    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: sacado.id,
      acao: "CRIACAO",
      detalhes: { cpfCnpj: sacado.cpfCnpj, tipoPessoa: sacado.tipoPessoa },
    });
    return sacado;
  },

  async atualizar(id: string, input: AtualizarSacadoInput, usuarioId: string) {
    const atual = await this.buscarPorId(id);
    const sacado = await sacadosRepository.update(id, {
      ...(input.nome !== undefined ? { nome: input.nome } : {}),
      ...(input.email !== undefined ? { email: vazioParaNulo(input.email) } : {}),
      ...(input.telefone !== undefined ? { telefone: vazioParaNulo(input.telefone) } : {}),
      ...(input.dataNascimento !== undefined && atual.tipoPessoa === "FISICA"
        ? { dataNascimento: input.dataNascimento }
        : {}),
    });
    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: id,
      acao: "ATUALIZACAO",
      detalhes: { camposAlterados: Object.keys(input) },
    });
    return sacado;
  },
};
