import { StatusLoteTitulos } from "@prisma/client";
import { titulosLegadoLoteQueue } from "../../jobs/queues/titulos-legado-lote.queue";
import { AppError, ConflictError, NotFoundError } from "../../shared/errors/app-error";
import { normalizarCpf } from "../../shared/utils/cpf";
import { montarClient } from "../sincronizacao-legado/sincronizacao-legado.service";
import { titulosLegadoLoteRepository as repo } from "./titulos-legado-lote.repository";
import { sincronizarTitulosDoAluno } from "./titulos-legado.service";

type ClienteLegado = Parameters<typeof sincronizarTitulosDoAluno>[1];

/** Lote sem atividade há mais que isto é considerado interrompido (worker caiu) e não bloqueia um novo. */
const LOTE_PARADO_APOS_MS = 10 * 60_000;
/** Quantos problemas ficam guardados para a tela. */
const MAX_PROBLEMAS = 50;
/** Falhas iguais seguidas, em alunos diferentes, que fazem a busca parar (não se repetiriam diferente). */
const FALHAS_SEGUIDAS_PARA_PARAR = 3;

const MOTIVO_SEM_ATIVIDADE =
  "A busca ficou parada (o servidor foi reiniciado ou o processo caiu). Rode novamente: o que já foi importado não é duplicado.";
const MOTIVO_REINICIO =
  "O servidor foi reiniciado durante a busca. Rode novamente: o que já foi importado não é duplicado.";

export interface ProblemaTitulos {
  alunoNome: string;
  cpf: string;
  motivo: string;
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

export const titulosLegadoLoteService = {
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

  /** Cria o lote (todos os alunos com CPF) e o enfileira; a consulta ao legado roda no worker. */
  async iniciar(usuarioId: string) {
    await this.liberarInterrompidos();
    const ativo = await repo.emAndamento(new Date(Date.now() - LOTE_PARADO_APOS_MS));
    if (ativo) {
      throw new ConflictError("Já existe uma busca de títulos em andamento — aguarde terminar");
    }
    const alunos = (await repo.alunosParaBusca()).filter((a) => normalizarCpf(a.cpf).length === 11);
    if (alunos.length === 0) throw new NotFoundError("Não há alunos com CPF para consultar");

    const lote = await repo.criar(usuarioId, alunos.length);
    await titulosLegadoLoteQueue.add("buscar-titulos", { loteId: lote.id });
    return lote;
  },

  /** Último lote (para a tela). */
  async ultimo() {
    await this.liberarInterrompidos();
    return repo.ultimo();
  },

  /**
   * Roda no worker: para cada aluno, consulta o legado e grava os títulos que faltam (parcela da
   * matrícula ou título sem matrícula). Aluno com erro não derruba o lote; se o legado falhar, o
   * cliente espera 1 minuto e repete a mesma consulta, seguindo do aluno em que parou.
   * `somenteAlunoIds` existe só para testes (restringe a busca a esses alunos).
   */
  async executar(loteId: string, cliente?: ClienteLegado, somenteAlunoIds?: string[]) {
    const lote = await repo.findById(loteId);
    if (!lote || lote.status !== StatusLoteTitulos.EM_ANDAMENTO) return;

    let legado: ClienteLegado;
    try {
      legado =
        cliente ??
        (await montarClient({
          aoEsperar: () => repo.atualizar(loteId, { atualizadoEm: new Date() }),
        }));
    } catch (erro) {
      await repo.atualizar(loteId, {
        status: StatusLoteTitulos.FALHOU,
        finalizadoEm: new Date(),
        mensagemFalha: `Não foi possível conectar ao sistema legado: ${mensagemDe(erro)}`,
      });
      return;
    }

    const alunos = (await repo.alunosParaBusca()).filter(
      (a) =>
        normalizarCpf(a.cpf).length === 11 && (!somenteAlunoIds || somenteAlunoIds.includes(a.id)),
    );
    const problemas: ProblemaTitulos[] = [];
    let falhasSeguidas = 0;
    let ultimaFalha = "";

    for (const aluno of alunos) {
      let atualizacao = {};
      try {
        const r = await sincronizarTitulosDoAluno(aluno, legado, lote.usuarioId);
        falhasSeguidas = 0;
        atualizacao = {
          parcelasNovas: { increment: r.parcelasNovas },
          titulosSemMatricula: { increment: r.titulosSemMatricula },
          jaImportados: { increment: r.jaImportados },
          ignorados: { increment: r.ignorados },
          alunosNaoEncontrados: { increment: r.encontradoNoLegado ? 0 : 1 },
        };
      } catch (erro) {
        const motivo = mensagemDe(erro);
        if (problemas.length < MAX_PROBLEMAS) {
          problemas.push({ alunoNome: aluno.nome, cpf: aluno.cpf, motivo });
        }
        atualizacao = { alunosComErro: { increment: 1 }, problemas };

        // Erro do próprio aluno é normal. Já uma falha que não é dele e se repete (login recusado,
        // legado fora do ar mesmo depois das esperas) só se repetiria nos demais: para a busca.
        if (erro instanceof AppError) {
          falhasSeguidas = 0;
        } else {
          falhasSeguidas = motivo === ultimaFalha ? falhasSeguidas + 1 : 1;
          ultimaFalha = motivo;
          if (falhasSeguidas >= FALHAS_SEGUIDAS_PARA_PARAR) {
            await repo.atualizar(loteId, {
              ...atualizacao,
              processados: { increment: 1 },
              status: StatusLoteTitulos.FALHOU,
              finalizadoEm: new Date(),
              mensagemFalha: `A busca parou porque o sistema legado falhou ${falhasSeguidas} vezes seguidas: ${motivo}. Os alunos restantes não foram consultados.`,
            });
            return;
          }
        }
      }
      await repo.atualizar(loteId, { ...atualizacao, processados: { increment: 1 } });
    }

    await repo.concluir(loteId);
  },
};
