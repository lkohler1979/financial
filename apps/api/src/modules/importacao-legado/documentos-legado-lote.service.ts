import { StatusLoteDocumentos } from "@prisma/client";
import { documentosLegadoLoteQueue } from "../../jobs/queues/documentos-legado-lote.queue";
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/app-error";
import { matriculasRepository, type FiltrosMatriculas } from "../matriculas/matriculas.repository";
import { montarClient } from "../sincronizacao-legado/sincronizacao-legado.service";
import { documentosLegadoService } from "./documentos-legado.service";
import { documentosLegadoLoteRepository as repo } from "./documentos-legado-lote.repository";
import { montarRelatorioDocumentos } from "./documentos-legado-lote.relatorio";

type ClienteLegado = Parameters<typeof documentosLegadoService.importarDoAluno>[2];

/** Máximo de alunos por busca em lote (cada aluno gera várias consultas ao sistema legado). */
export const MAX_ALUNOS_LOTE = 1000;
/** Lote sem atividade há mais que isto é considerado interrompido (worker caiu) e não bloqueia um novo. */
const LOTE_PARADO_APOS_MS = 10 * 60_000;
/** Quantos alunos com problema a tela mostra (o relatório traz todos). */
const PROBLEMAS_NA_TELA = 50;

/** Falhas de conexão iguais seguidas, em alunos diferentes, que fazem a busca parar. */
const FALHAS_SEGUIDAS_PARA_PARAR = 3;

const MOTIVO_SEM_ATIVIDADE =
  "A busca ficou parada (o servidor foi reiniciado ou o processo caiu). Rode novamente: o que já foi baixado não é duplicado.";
const MOTIVO_REINICIO =
  "O servidor foi reiniciado durante a busca. Rode novamente: o que já foi baixado não é duplicado.";

export interface SelecaoDocumentosLote {
  matriculaIds?: string[];
  filtros?: FiltrosMatriculas;
}

export const documentosLegadoLoteService = {
  /** Libera lotes que ficaram "em andamento" sem nenhum worker rodando (ex.: deploy no meio). */
  liberarInterrompidos(): Promise<number> {
    return repo.marcarInterrompidos(
      MOTIVO_SEM_ATIVIDADE,
      new Date(Date.now() - LOTE_PARADO_APOS_MS),
    );
  },

  /** Chamado quando o worker sobe ou recebe sinal de parada: nenhum lote pode continuar "rodando". */
  marcarInterrompidosPorReinicio(): Promise<number> {
    return repo.marcarInterrompidos(MOTIVO_REINICIO);
  },

  /**
   * Cria o lote com os alunos das matrículas escolhidas (marcadas na tela, ou todas as do filtro)
   * e o enfileira; a busca no legado roda no worker.
   */
  async iniciar(usuarioId: string, selecao: SelecaoDocumentosLote) {
    await this.liberarInterrompidos();
    const ativo = await repo.emAndamento(new Date(Date.now() - LOTE_PARADO_APOS_MS));
    if (ativo) {
      throw new ConflictError(
        "Já existe uma busca de documentos em lote em andamento — aguarde terminar",
      );
    }

    const alunos = await matriculasRepository.alunosDasMatriculas(
      { ids: selecao.matriculaIds, filtros: selecao.filtros },
      MAX_ALUNOS_LOTE,
    );
    if (alunos.length === 0) throw new NotFoundError("Nenhuma matrícula encontrada para a busca");
    if (alunos.length > MAX_ALUNOS_LOTE) {
      throw new ValidationError(
        `A busca em lote aceita até ${MAX_ALUNOS_LOTE} alunos por vez. Refine o filtro (curso, situação, período).`,
      );
    }

    const lote = await repo.criar(usuarioId, alunos);
    await documentosLegadoLoteQueue.add("buscar-documentos", { loteId: lote.id });
    return lote;
  },

  /** Último lote, com os primeiros alunos que tiveram problema (para a tela). */
  async ultimo() {
    await this.liberarInterrompidos();
    const lote = await repo.ultimo();
    if (!lote) return null;
    return { ...lote, problemas: await repo.itensComProblema(lote.id, PROBLEMAS_NA_TELA) };
  },

  /** Interrompe a busca: o aluno em andamento termina e o resto não é processado. */
  async cancelar(loteId: string) {
    const lote = await repo.findById(loteId);
    if (!lote) throw new NotFoundError("Busca em lote não encontrada");
    if (lote.status !== StatusLoteDocumentos.EM_ANDAMENTO) return lote;
    return repo.atualizar(loteId, {
      status: StatusLoteDocumentos.CANCELADO,
      finalizadoEm: new Date(),
    });
  },

  /** Planilha (.xlsx) com o resumo e o resultado de cada aluno. `atual` = o último lote. */
  async relatorio(loteId: string) {
    const lote = loteId === "atual" ? await repo.ultimo() : await repo.findById(loteId);
    if (!lote) throw new NotFoundError("Nenhuma busca em lote encontrada");
    return {
      arquivo: montarRelatorioDocumentos(lote, await repo.itens(lote.id)),
      nome: `documentos-legado-${lote.id.slice(0, 8)}.xlsx`,
    };
  },

  /**
   * Roda no worker: para cada aluno pendente do lote, baixa os documentos do legado (mesma rotina
   * do botão "Buscar no legado" de um aluno, que também atualiza a situação da documentação).
   * Um aluno com erro não derruba o lote; cancelar ou reiniciar o servidor interrompe entre alunos.
   */
  async executar(loteId: string, cliente?: ClienteLegado) {
    const lote = await repo.findById(loteId);
    if (!lote || lote.status !== StatusLoteDocumentos.EM_ANDAMENTO) return;

    let legado: ClienteLegado;
    try {
      legado = cliente ?? (await montarClient());
    } catch (erro) {
      await repo.atualizar(loteId, {
        status: StatusLoteDocumentos.FALHOU,
        finalizadoEm: new Date(),
        mensagemFalha: `Não foi possível conectar ao sistema legado: ${mensagemDe(erro)}`,
      });
      return;
    }

    let falhasSeguidas = 0;
    let ultimaFalha = "";
    for (;;) {
      // Relê a situação a cada aluno: pode ter sido cancelado ou marcado como interrompido.
      const atual = await repo.findById(loteId);
      if (!atual || atual.status !== StatusLoteDocumentos.EM_ANDAMENTO) return;
      const item = await repo.proximoPendente(loteId);
      if (!item) break;

      try {
        const r = await documentosLegadoService.importarDoAluno(
          item.alunoId,
          lote.usuarioId,
          legado,
        );
        await repo.atualizarItem(item.id, {
          resultado: "CONCLUIDO",
          baixados: r.baixados,
          jaImportados: r.jaImportados,
          mantidos: r.mantidos,
          semDocumento: r.semDocumento,
          erros: r.erros,
          mensagem: r.erros > 0 ? r.itens.find((i) => i.resultado === "ERRO")?.detalhe : null,
          processadoEm: new Date(),
        });
        falhasSeguidas = 0;
        await repo.atualizar(loteId, {
          processados: { increment: 1 },
          baixados: { increment: r.baixados },
          jaImportados: { increment: r.jaImportados },
          mantidos: { increment: r.mantidos },
          semDocumento: { increment: r.semDocumento },
          errosDocumentos: { increment: r.erros },
        });
      } catch (erro) {
        await repo.atualizarItem(item.id, {
          resultado: "ERRO",
          mensagem: mensagemDe(erro),
          processadoEm: new Date(),
        });
        await repo.atualizar(loteId, {
          processados: { increment: 1 },
          alunosComErro: { increment: 1 },
        });

        // Erro do próprio aluno (não está no legado, CPF inválido…) é normal. Já uma falha que
        // não é dele e se repete (login recusado, legado fora do ar) só se repetiria nos demais:
        // para a busca e deixa o restante pendente, em vez de tentar centenas de alunos.
        if (erro instanceof AppError) {
          falhasSeguidas = 0;
        } else {
          const mensagem = mensagemDe(erro);
          falhasSeguidas = mensagem === ultimaFalha ? falhasSeguidas + 1 : 1;
          ultimaFalha = mensagem;
          if (falhasSeguidas >= FALHAS_SEGUIDAS_PARA_PARAR) {
            await repo.atualizar(loteId, {
              status: StatusLoteDocumentos.FALHOU,
              finalizadoEm: new Date(),
              mensagemFalha: `A busca parou porque o sistema legado falhou ${falhasSeguidas} vezes seguidas: ${mensagem}. Os alunos restantes não foram processados.`,
            });
            return;
          }
        }
      }
    }

    // Só conclui se ninguém cancelou/interrompeu enquanto o último aluno rodava.
    await repo.concluir(loteId);
  },
};

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}
