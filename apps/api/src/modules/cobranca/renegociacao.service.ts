import { NotFoundError, ValidationError } from "../../shared/errors/app-error";
import { registrarAuditoria } from "../auditoria/auditoria.service";
import { configuracoesRepository } from "../configuracoes/configuracoes.repository";
import { matriculasRepository } from "../matriculas/matriculas.repository";
import {
  planejarRenegociacao,
  type ParcelaParaRenegociar,
  type PlanoRenegociacao,
} from "./renegociacao";
import { renegociacaoRepository } from "./renegociacao.repository";
import type { RenegociarInput } from "./renegociacao.schema";

const numero = (v: unknown): number | null => (v == null ? null : Number(v));

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");

async function planejar(matriculaId: string, input: RenegociarInput): Promise<PlanoRenegociacao> {
  const matricula = await matriculasRepository.findById(matriculaId);
  if (!matricula) throw new NotFoundError("Matrícula não encontrada");

  const encontradas = await renegociacaoRepository.buscarParcelas(matriculaId, input.parcelaIds);
  if (encontradas.length !== input.parcelaIds.length) {
    throw new ValidationError("Há parcela selecionada que não pertence a esta matrícula");
  }

  const config = await configuracoesRepository.obterOuCriar();
  const parcelas: ParcelaParaRenegociar[] = encontradas.map((p) => ({
    id: p.id,
    parcela: p.parcela,
    codTitulo: p.codTitulo,
    status: p.status,
    valor: Number(p.valor),
    vencimento: p.vencimento,
    multaLegado: numero(p.multaLegado),
    jurosLegado: numero(p.jurosLegado),
    totalLegado: numero(p.totalLegado),
    multaProtesto: numero(p.multaProtesto),
    jurosProtesto: numero(p.jurosProtesto),
    totalProtesto: numero(p.totalProtesto),
  }));

  return planejarRenegociacao(
    // Na ordem do vencimento, não na da seleção.
    parcelas.sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime()),
    input,
    {
      multaPercentual: Number(config.multaPercentual),
      jurosDiarioPercentual: Number(config.jurosDiarioPercentual),
      jurosContarDiaGeracao: config.jurosContarDiaGeracao,
    },
    new Date(),
  );
}

export const renegociacaoService = {
  /** Mostra o que a renegociação faria (totais e novas parcelas), sem gravar nada. */
  simular(matriculaId: string, input: RenegociarInput) {
    return planejar(matriculaId, input);
  },

  async renegociar(matriculaId: string, input: RenegociarInput, usuarioId: string) {
    const plano = await planejar(matriculaId, input);
    const primeiroVencimento = plano.novasParcelas[0].vencimento;
    const titulos = plano.parcelas.map((p) => p.codTitulo).join(", ");

    const renegociacao = await renegociacaoRepository.efetivar({
      matriculaId,
      usuarioId,
      plano,
      numeroParcelas: input.numeroParcelas,
      primeiroVencimento,
      historico: (n) =>
        `Renegociação R${n}: ${plano.parcelas.length} parcela(s) (título ${titulos}) quitadas por renegociação. ` +
        `Total devido ${moeda(plano.totalDevido)}, desconto ${moeda(plano.desconto)}, ` +
        `${moeda(plano.valorNegociado)} em ${input.numeroParcelas}x a partir de ${dataBr(primeiroVencimento)}`,
    });

    await registrarAuditoria({
      usuarioId,
      entidade: "Renegociacao",
      entidadeId: renegociacao.id,
      acao: "CRIACAO",
      detalhes: {
        matriculaId,
        numero: renegociacao.numero,
        parcelasOriginais: plano.parcelas.map((p) => p.id),
        totalDevido: plano.totalDevido,
        desconto: plano.desconto,
        valorNegociado: plano.valorNegociado,
        numeroParcelas: input.numeroParcelas,
      },
    });

    return renegociacao;
  },
};
