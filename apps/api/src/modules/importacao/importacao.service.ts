import { NotFoundError } from "../../shared/errors/app-error";
import { importacaoQueue, ImportacaoJobResultado } from "../../jobs/queues/importacao.queue";
import { importacaoRepository } from "./importacao.repository";
import type { ListarImportacoesInput } from "./importacao.schema";

export const importacaoService = {
  async enfileirar(caminhoArquivo: string, nomeOriginal: string, usuarioId: string) {
    const job = await importacaoQueue.add("processar-planilha", {
      caminhoArquivo,
      nomeOriginal,
      usuarioId,
    });
    return { jobId: job.id as string };
  },

  async statusJob(jobId: string) {
    const job = await importacaoQueue.getJob(jobId);
    if (!job) throw new NotFoundError("Job de importação não encontrado");

    const estado = await job.getState();

    return {
      jobId: job.id,
      estado,
      progresso: typeof job.progress === "number" ? job.progress : 0,
      resultado: estado === "completed" ? (job.returnvalue as ImportacaoJobResultado) : undefined,
      erro: estado === "failed" ? job.failedReason : undefined,
    };
  },

  async listar(params: ListarImportacoesInput) {
    const { page, pageSize } = params;
    const { data, total } = await importacaoRepository.list({
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { data, total, page, pageSize };
  },

  async buscarPorId(id: string) {
    const importacao = await importacaoRepository.findById(id);
    if (!importacao) throw new NotFoundError("Importação não encontrada");
    return importacao;
  },
};
