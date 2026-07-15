import fs from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { Job, Worker } from "bullmq";
import { redisConnection } from "../redis-connection";
import {
  IMPORTACAO_QUEUE_NAME,
  ImportacaoJobData,
  ImportacaoJobResultado,
} from "../queues/importacao.queue";
import { parsePlanilhaImportacao } from "../../modules/importacao/importacao.parser";
import { processarLinhasImportacao } from "../../modules/importacao/importacao.processor";
import { importacaoRepository } from "../../modules/importacao/importacao.repository";
import { registrarAuditoria } from "../../modules/auditoria/auditoria.service";

async function processarJob(job: Job<ImportacaoJobData>): Promise<ImportacaoJobResultado> {
  const { caminhoArquivo, nomeOriginal, usuarioId } = job.data;

  const buffer = await fs.readFile(caminhoArquivo);
  const { validas, erros: errosParse } = parsePlanilhaImportacao(buffer);

  const resultado = await processarLinhasImportacao(validas, usuarioId, (percentual) =>
    job.updateProgress(percentual),
  );

  const erros = [...errosParse, ...resultado.erros].sort((a, b) => a.linha - b.linha);
  const totalRegistros = validas.length + errosParse.length;

  const registro = await importacaoRepository.create({
    usuario: { connect: { id: usuarioId } },
    arquivo: nomeOriginal,
    totalRegistros,
    novosAlunos: resultado.novosAlunos,
    alunosAtualizados: resultado.alunosAtualizados,
    parcelasNovas: resultado.parcelasNovas,
    parcelasAtualizadas: resultado.parcelasAtualizadas,
    erros: erros.length > 0 ? (erros as unknown as Prisma.InputJsonValue) : undefined,
  });

  // Auditoria em nível de lote (não por registro individual) — decisão
  // registrada em docs/PENDENCIAS.md: o próprio registro de Importacao já
  // consolida o que mudou; auditar cada Aluno/Matrícula/Parcela tocado por uma
  // planilha de milhares de linhas geraria um volume de Auditoria desproporcional.
  await registrarAuditoria({
    usuarioId,
    entidade: "Importacao",
    entidadeId: registro.id,
    acao: "CRIACAO",
    detalhes: { arquivo: nomeOriginal, totalRegistros, erros: erros.length },
  });

  await fs.unlink(caminhoArquivo).catch(() => undefined);

  return {
    importacaoId: registro.id,
    totalRegistros,
    novosAlunos: resultado.novosAlunos,
    alunosAtualizados: resultado.alunosAtualizados,
    parcelasNovas: resultado.parcelasNovas,
    parcelasAtualizadas: resultado.parcelasAtualizadas,
    erros,
  };
}

export const importacaoWorker = new Worker<ImportacaoJobData, ImportacaoJobResultado>(
  IMPORTACAO_QUEUE_NAME,
  processarJob,
  { connection: redisConnection, concurrency: 1 },
);

importacaoWorker.on("completed", (job) => {
  console.log(`[worker:importacao] job ${job.id} concluído`);
});

importacaoWorker.on("failed", (job, err) => {
  console.error(`[worker:importacao] job ${job?.id} falhou`, err);
});
