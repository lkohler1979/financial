import { Prisma } from "@prisma/client";
import { ConflictError, NotFoundError } from "../../shared/errors/app-error";
import { registrarAuditoria } from "../auditoria/auditoria.service";
import { matriculasRepository } from "../matriculas/matriculas.repository";
import { financeiroRepository } from "./financeiro.repository";
import type {
  AtualizarParcelaInput,
  CriarParcelaInput,
  ListarParcelasInput,
} from "./financeiro.schema";

const ENTIDADE = "Parcela";

export const financeiroService = {
  async listar(params: ListarParcelasInput) {
    const { page, pageSize, matriculaId, status } = params;
    const { data, total } = await financeiroRepository.list({
      matriculaId,
      status,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { data, total, page, pageSize };
  },

  async buscarPorId(id: string) {
    const parcela = await financeiroRepository.findById(id);
    if (!parcela) throw new NotFoundError("Parcela não encontrada");
    return parcela;
  },

  async criar(input: CriarParcelaInput, usuarioId: string) {
    const matricula = await matriculasRepository.findById(input.matriculaId);
    if (!matricula) throw new NotFoundError("Matrícula não encontrada");

    const existente = await financeiroRepository.findByChaveNatural(
      input.matriculaId,
      input.codTitulo,
    );
    if (existente) {
      throw new ConflictError(
        "Já existe uma parcela com este código de título para esta matrícula",
        { matriculaId: input.matriculaId, codTitulo: input.codTitulo },
      );
    }

    const parcela = await financeiroRepository.create({
      matricula: { connect: { id: input.matriculaId } },
      codTitulo: input.codTitulo,
      parcela: input.parcela,
      vencimento: input.vencimento,
      valor: input.valor,
      tipoTitulo: input.tipoTitulo,
      observacoes: input.observacoes,
    });

    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: parcela.id,
      acao: "CRIACAO",
      detalhes: { matriculaId: parcela.matriculaId, codTitulo: parcela.codTitulo },
    });

    return parcela;
  },

  async atualizar(id: string, input: AtualizarParcelaInput, usuarioId: string) {
    const atual = await this.buscarPorId(id);

    const dados: Prisma.ParcelaUpdateInput = { ...input };

    // Pagamento exige data/valor pago — usa padrão (agora / valor cheio) quando
    // não informado explicitamente.
    if (input.status === "PAGO") {
      dados.dataPagamento = input.dataPagamento ?? atual.dataPagamento ?? new Date();
      dados.valorPago = input.valorPago ?? atual.valorPago ?? atual.valor;
    }

    const parcela = await financeiroRepository.update(id, dados);

    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: parcela.id,
      acao: "ATUALIZACAO",
      detalhes: { camposAlterados: Object.keys(input) },
    });

    return parcela;
  },
};
