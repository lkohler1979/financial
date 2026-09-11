import { Request, Response } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { paramString, usuarioAtual } from "../../shared/utils/http";
import { sincronizacaoLegadoQueue } from "../../jobs/queues/sincronizacao-legado.queue";
import { sincronizacaoLegadoService } from "./sincronizacao-legado.service";
import { listarExecucoesSchema } from "./sincronizacao-legado.schema";

export const sincronizacaoLegadoController = {
  /** Botão manual na ficha de cobrança/matrícula — consulta síncrona (1 CPF). */
  sincronizarMatricula: asyncHandler(async (req: Request, res: Response) => {
    const resultado = await sincronizacaoLegadoService.sincronizarMatricula(
      paramString(req, "matriculaId"),
      usuarioAtual(req),
    );
    res.json(resultado);
  }),

  /** Dispara a execução em lote (mesma rotina do job agendado) sob demanda, via fila. */
  dispararLote: asyncHandler(async (req: Request, res: Response) => {
    const job = await sincronizacaoLegadoQueue.add("sincronizar-lote", {
      tipo: "MANUAL",
      usuarioId: usuarioAtual(req),
    });
    res.status(202).json({ jobId: job.id });
  }),

  statusJob: asyncHandler(async (req: Request, res: Response) => {
    const job = await sincronizacaoLegadoQueue.getJob(paramString(req, "jobId"));
    if (!job) return res.status(404).json({ mensagem: "Job não encontrado" });

    const estado = await job.getState();
    res.json({
      jobId: job.id,
      estado,
      resultado: estado === "completed" ? job.returnvalue : undefined,
      erro: estado === "failed" ? job.failedReason : undefined,
    });
  }),

  listarExecucoes: asyncHandler(async (req: Request, res: Response) => {
    const input = listarExecucoesSchema.parse(req.query);
    const resultado = await sincronizacaoLegadoService.listarExecucoes(input);
    res.json(resultado);
  }),
};
