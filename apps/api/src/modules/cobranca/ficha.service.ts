import { ConflictError, NotFoundError } from "../../shared/errors/app-error";
import { matriculasRepository } from "../matriculas/matriculas.repository";
import type { AplicarLoteInput } from "./ficha.schema";
import { historicoRepository } from "./historico.repository";
import { observacoesRepository } from "./observacoes.repository";
import { situacoesRepository } from "./situacoes.repository";
import { tagsRepository } from "./tags.repository";

async function garantirMatriculaExiste(matriculaId: string) {
  const matricula = await matriculasRepository.findById(matriculaId);
  if (!matricula) throw new NotFoundError("Matrícula não encontrada");
  return matricula;
}

export const fichaService = {
  /** Ficha de cobrança consolidada da matrícula (wireframe 05_ficha_cobranca.html). */
  async obterFicha(matriculaId: string) {
    const matricula = await garantirMatriculaExiste(matriculaId);
    const [tagsAssociadas, observacoes, historico] = await Promise.all([
      tagsRepository.listarTagsDaMatricula(matriculaId),
      observacoesRepository.listarPorMatricula(matriculaId),
      historicoRepository.listarPorMatricula(matriculaId),
    ]);

    return {
      matricula,
      tags: tagsAssociadas.map((associacao) => associacao.tag),
      observacoes,
      historico,
    };
  },

  async mudarSituacao(matriculaId: string, situacaoCobrancaId: string, usuarioId: string) {
    await garantirMatriculaExiste(matriculaId);
    const situacao = await situacoesRepository.findById(situacaoCobrancaId);
    if (!situacao) throw new NotFoundError("Situação de cobrança não encontrada");

    const atualizada = await matriculasRepository.update(matriculaId, {
      situacaoCobranca: { connect: { id: situacaoCobrancaId } },
    });

    await historicoRepository.registrar(
      matriculaId,
      usuarioId,
      `Situação alterada para "${situacao.nome}"`,
    );

    return atualizada;
  },

  async adicionarTag(matriculaId: string, tagId: string, usuarioId: string) {
    await garantirMatriculaExiste(matriculaId);
    const tag = await tagsRepository.findById(tagId);
    if (!tag) throw new NotFoundError("TAG não encontrada");

    const existente = await tagsRepository.findAssociacao(matriculaId, tagId);
    if (existente) throw new ConflictError("Matrícula já possui esta TAG");

    await tagsRepository.associar(matriculaId, tagId);
    await historicoRepository.registrar(matriculaId, usuarioId, `Inserida tag "${tag.nome}"`);
  },

  async removerTag(matriculaId: string, tagId: string, usuarioId: string) {
    await garantirMatriculaExiste(matriculaId);
    const tag = await tagsRepository.findById(tagId);
    if (!tag) throw new NotFoundError("TAG não encontrada");

    const existente = await tagsRepository.findAssociacao(matriculaId, tagId);
    if (!existente) throw new NotFoundError("Matrícula não possui esta TAG");

    await tagsRepository.desassociar(matriculaId, tagId);
    await historicoRepository.registrar(matriculaId, usuarioId, `Removida tag "${tag.nome}"`);
  },

  async adicionarObservacao(matriculaId: string, texto: string, usuarioId: string) {
    await garantirMatriculaExiste(matriculaId);
    const observacao = await observacoesRepository.criar(matriculaId, texto);
    await historicoRepository.registrar(matriculaId, usuarioId, "Observação adicionada");
    return observacao;
  },

  /**
   * Ação em lote a partir da seleção de um relatório de inadimplência
   * (wireframe 04_relatorio_inadimplencia.html). Cada matrícula é processada
   * de forma independente — uma falha isolada não interrompe o lote.
   */
  async aplicarEmLote(input: AplicarLoteInput, usuarioId: string) {
    const erros: Array<{ matriculaId: string; mensagem: string }> = [];
    let sucesso = 0;

    for (const matriculaId of input.matriculaIds) {
      try {
        if (input.situacaoCobrancaId) {
          await this.mudarSituacao(matriculaId, input.situacaoCobrancaId, usuarioId);
        }

        if (input.tagIds) {
          for (const tagId of input.tagIds) {
            const jaPossui = await tagsRepository.findAssociacao(matriculaId, tagId);
            if (!jaPossui) await this.adicionarTag(matriculaId, tagId, usuarioId);
          }
        }

        if (input.observacao) {
          await this.adicionarObservacao(matriculaId, input.observacao, usuarioId);
        }

        sucesso++;
      } catch (err) {
        erros.push({
          matriculaId,
          mensagem: err instanceof Error ? err.message : "Erro desconhecido",
        });
      }
    }

    return { total: input.matriculaIds.length, sucesso, erros };
  },
};
