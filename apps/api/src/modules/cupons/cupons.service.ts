import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors/app-error";
import { registrarAuditoria } from "../auditoria/auditoria.service";
import { cuponsRepository } from "./cupons.repository";
import type { AtualizarCupomInput, CriarCupomInput } from "./cupons.schema";

const ENTIDADE = "Cupom";

interface CupomBasico {
  tipoDesconto: "PERCENTUAL" | "VALOR";
  valor: unknown;
}

function serializar<T extends { valor: unknown }>(cupom: T) {
  return { ...cupom, valor: Number(cupom.valor) };
}

/** Valor da cobrança depois do desconto — percentual sobre o valor, ou valor
 * fixo abatido do total. Nunca zera/negativa a cobrança. */
export function aplicarDesconto(cupom: CupomBasico, valorOriginal: number): number {
  const valor = Number(cupom.valor);
  const final =
    cupom.tipoDesconto === "PERCENTUAL" ? valorOriginal * (1 - valor / 100) : valorOriginal - valor;
  const arredondado = Math.round(final * 100) / 100;
  if (arredondado <= 0) {
    throw new ValidationError("O desconto do cupom é maior ou igual ao valor da cobrança");
  }
  return arredondado;
}

export const cuponsService = {
  async listar() {
    return (await cuponsRepository.list()).map(serializar);
  },

  /** Só cupons cadastrados, ativos e dentro da validade podem ser aplicados. */
  async obterValido(codigo: string) {
    const cupom = await cuponsRepository.findByCodigo(codigo.trim().toUpperCase());
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    if (!cupom || !cupom.ativo || (cupom.validadeAte && cupom.validadeAte < hoje)) {
      throw new ValidationError("Cupom inválido, inativo ou vencido");
    }
    return cupom;
  },

  async validar(codigo: string) {
    const cupom = await this.obterValido(codigo);
    return serializar({
      id: cupom.id,
      codigo: cupom.codigo,
      descricao: cupom.descricao,
      tipoDesconto: cupom.tipoDesconto,
      valor: cupom.valor,
    });
  },

  async criar(input: CriarCupomInput, usuarioId: string) {
    if (await cuponsRepository.findByCodigo(input.codigo)) {
      throw new ConflictError("Já existe um cupom com este código", { codigo: input.codigo });
    }
    const cupom = await cuponsRepository.create({
      ...input,
      descricao: input.descricao ?? null,
      validadeAte: input.validadeAte ?? null,
    });
    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: cupom.id,
      acao: "CRIACAO",
      detalhes: { codigo: cupom.codigo },
    });
    return serializar(cupom);
  },

  async atualizar(id: string, input: AtualizarCupomInput, usuarioId: string) {
    const atual = await cuponsRepository.findById(id);
    if (!atual) throw new NotFoundError("Cupom não encontrado");
    if (input.codigo && input.codigo !== atual.codigo && (await cuponsRepository.findByCodigo(input.codigo))) {
      throw new ConflictError("Já existe um cupom com este código", { codigo: input.codigo });
    }
    const cupom = await cuponsRepository.update(id, input);
    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: id,
      acao: "ATUALIZACAO",
      detalhes: { camposAlterados: Object.keys(input) },
    });
    return serializar(cupom);
  },
};
