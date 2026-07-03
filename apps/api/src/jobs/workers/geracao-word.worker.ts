import fs from "node:fs/promises";
import path from "node:path";
import { Job, Worker } from "bullmq";
import { redisConnection } from "../redis-connection";
import { GERACAO_WORD_QUEUE_NAME, GeracaoWordJobData } from "../queues/geracao-word.queue";
import { configuracoesRepository } from "../../modules/configuracoes/configuracoes.repository";
import { relatoriosRepository } from "../../modules/relatorios/relatorios.repository";
import { gerarDocumentoProtesto } from "../../modules/relatorios/documento-protesto.generator";
import {
  calcularDiasAtraso,
  calcularMultaJuros,
} from "../../modules/relatorios/calculo-financeiro";

interface ItemRelatorio {
  matriculaId: string;
  alunoId: string;
  alunoNome: string;
  alunoCpf: string;
  cursoId: string;
  cursoNome: string;
  quantidadeParcelasVencidas: number;
  diasAtrasoMaximo: number;
  valorTotal: number;
  documentoGerado?: boolean;
  caminhoDocumento?: string | null;
}

function sanitizarNomeArquivo(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function montarNomeArquivo(padrao: string, item: ItemRelatorio): string {
  const nomeArquivo = padrao
    .replace("{NOME}", sanitizarNomeArquivo(item.alunoNome))
    .replace("{CPF}", item.alunoCpf)
    .replace("{CURSO}", sanitizarNomeArquivo(item.cursoNome));
  return nomeArquivo.endsWith(".docx") ? nomeArquivo : `${nomeArquivo}.docx`;
}

async function processarJob(job: Job<GeracaoWordJobData>): Promise<void> {
  const relatorio = await relatoriosRepository.findById(job.data.relatorioId);
  if (!relatorio) throw new Error(`Relatório ${job.data.relatorioId} não encontrado`);

  const configuracao = await configuracoesRepository.obterOuCriar();
  const pastaSaida = path.resolve(configuracao.pastaSaidaDocumentos);
  await fs.mkdir(pastaSaida, { recursive: true });

  const configFinanceira = {
    multaPercentual: Number(configuracao.multaPercentual),
    jurosDiarioPercentual: Number(configuracao.jurosDiarioPercentual),
    jurosContarDiaGeracao: configuracao.jurosContarDiaGeracao,
  };
  const hoje = new Date();

  const itens = Array.isArray(relatorio.itens)
    ? (relatorio.itens as unknown as ItemRelatorio[])
    : [];
  let totalDocumentosGerados = 0;
  const erros: Array<{ matriculaId: string; mensagem: string }> = [];

  for (let indice = 0; indice < itens.length; indice++) {
    const item = itens[indice];
    try {
      const parcelas = await relatoriosRepository.buscarParcelasVencidasDaMatricula(
        item.matriculaId,
      );

      const buffer = await gerarDocumentoProtesto({
        alunoNome: item.alunoNome,
        alunoCpf: item.alunoCpf,
        cursoNome: item.cursoNome,
        parcelas: parcelas.map((p) => {
          const diasAtraso = calcularDiasAtraso(
            p.vencimento,
            hoje,
            configFinanceira.jurosContarDiaGeracao,
          );
          return {
            vencimento: p.vencimento,
            ...calcularMultaJuros(Number(p.valor), diasAtraso, configFinanceira),
          };
        }),
      });

      const nomeArquivo = montarNomeArquivo(configuracao.padraoNomeArquivo, item);
      const caminhoCompleto = path.join(pastaSaida, nomeArquivo);
      await fs.writeFile(caminhoCompleto, buffer);

      itens[indice] = { ...item, documentoGerado: true, caminhoDocumento: caminhoCompleto };
      totalDocumentosGerados++;
    } catch (err) {
      erros.push({
        matriculaId: item.matriculaId,
        mensagem: err instanceof Error ? err.message : "Erro desconhecido ao gerar documento",
      });
    }

    await job.updateProgress(Math.round(((indice + 1) / itens.length) * 100));
  }

  await relatoriosRepository.update(relatorio.id, {
    itens,
    totalDocumentosGerados,
    erros: erros.length > 0 ? erros : undefined,
  });
}

export const geracaoWordWorker = new Worker<GeracaoWordJobData>(
  GERACAO_WORD_QUEUE_NAME,
  processarJob,
  { connection: redisConnection, concurrency: 1 },
);

geracaoWordWorker.on("completed", (job) => {
  console.log(`[worker:geracao-word] job ${job.id} concluído`);
});

geracaoWordWorker.on("failed", (job, err) => {
  console.error(`[worker:geracao-word] job ${job?.id} falhou`, err);
});
