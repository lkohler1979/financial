import fs from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { Job, Worker } from "bullmq";
import { redisConnection } from "../redis-connection";
import { GERACAO_WORD_QUEUE_NAME, GeracaoWordJobData } from "../queues/geracao-word.queue";
import { configuracoesRepository } from "../../modules/configuracoes/configuracoes.repository";
import { relatoriosRepository } from "../../modules/relatorios/relatorios.repository";
import { gerarDocumentoProtesto } from "../../modules/relatorios/documento-protesto.generator";
import { gerarDocumentoProtestoPdf } from "../../modules/relatorios/documento-protesto-pdf.generator";
import {
  calcularDiasAtraso,
  calcularMultaJuros,
} from "../../modules/relatorios/calculo-financeiro";
import { situacoesRepository } from "../../modules/cobranca/situacoes.repository";
import { tagsRepository } from "../../modules/cobranca/tags.repository";
import { fichaService } from "../../modules/cobranca/ficha.service";
import { financeiroService } from "../../modules/financeiro/financeiro.service";
import { financeiroRepository } from "../../modules/financeiro/financeiro.repository";

// Nomes usados no PRD (seção 23.1) para a situação de cobrança pós-protesto.
// Se ainda não existirem (ambiente novo, sem cadastro manual), são criados
// automaticamente com um padrão razoável na primeira geração.
const SITUACAO_ENVIADO_PARA_PROTESTO = "PROTESTO ENVIADO";
// Matrícula tem parcelas vencidas enviadas a protesto, mas ainda tem outras
// parcelas em aberto (ainda não vencidas) — protesto parcial, decisão do
// usuário em 2026-07-06: fica "Pendente" em vez de "PROTESTO ENVIADO",
// com uma TAG avisando que parte da dívida já foi protestada.
const SITUACAO_PENDENTE = "Pendente";
const TAG_TITULOS_ENVIADOS_PARA_PROTESTO = "Existem títulos enviados para protesto";

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
  caminhoDocumentoPdf?: string | null;
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

  // "Enviado para Protesto" (PENDENCIAS.md): toda matrícula com documento
  // gerado com sucesso tem a situação de cobrança atualizada automaticamente
  // — mas só quando TODAS as parcelas em aberto já foram protestadas; se
  // ainda restar alguma parcela em aberto (ainda não vencida), a matrícula
  // fica "Pendente" com a TAG de aviso em vez de "Enviado para Protesto".
  const [situacaoProtesto, situacaoPendente, tagProtestoParcial] = await Promise.all([
    situacoesRepository.obterOuCriarPorNome(SITUACAO_ENVIADO_PARA_PROTESTO, {
      cor: "#C0392B",
      ordem: 92,
      ativa: true,
      participaNovosRelatorios: false,
    }),
    situacoesRepository.obterOuCriarPorNome(SITUACAO_PENDENTE, {
      cor: "#FAEEDA",
      ordem: 10,
      ativa: true,
      participaNovosRelatorios: true,
    }),
    tagsRepository.obterOuCriarPorNome(TAG_TITULOS_ENVIADOS_PARA_PROTESTO),
  ]);

  const itens = Array.isArray(relatorio.itens)
    ? (relatorio.itens as unknown as ItemRelatorio[])
    : [];
  let totalDocumentosGerados = 0;
  const erros: Array<{ matriculaId: string; mensagem: string }> = [];

  for (let indice = 0; indice < itens.length; indice++) {
    const item = itens[indice];
    try {
      // Por padrão, só entram no documento as parcelas vencidas há mais de
      // `relatorio.diasAtraso` dias; quando `incluirParcelasVencidasRecentes`
      // está marcado, inclui também as parcelas só "vencidas" da mesma
      // matrícula (decisão do usuário, 2026-07-07) — passar 0 remove o
      // filtro de dias mínimos em `buscarParcelasVencidasDaMatricula`.
      const parcelas = await relatoriosRepository.buscarParcelasVencidasDaMatricula(
        item.matriculaId,
        relatorio.incluirParcelasVencidasRecentes ? 0 : relatorio.diasAtraso ?? 0,
      );

      const dadosDocumento = {
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
      };

      const buffer = await gerarDocumentoProtesto(dadosDocumento);
      const nomeArquivo = montarNomeArquivo(configuracao.padraoNomeArquivo, item);
      const caminhoCompleto = path.join(pastaSaida, nomeArquivo);
      await fs.writeFile(caminhoCompleto, buffer);

      // PDF gerado junto (mesmo conteúdo, layout equivalente) — ver
      // documento-protesto-pdf.generator.ts. Sem conversão externa: falha ao
      // gerar o PDF não invalida o .docx já salvo (melhor esforço).
      let caminhoDocumentoPdf: string | null = null;
      try {
        const bufferPdf = await gerarDocumentoProtestoPdf(dadosDocumento);
        caminhoDocumentoPdf = caminhoCompleto.replace(/\.docx$/i, ".pdf");
        await fs.writeFile(caminhoDocumentoPdf, bufferPdf);
      } catch (erroPdf) {
        console.error(
          `[worker:geracao-word] falha ao gerar PDF da matrícula ${item.matriculaId}`,
          erroPdf,
        );
      }

      itens[indice] = {
        ...item,
        documentoGerado: true,
        caminhoDocumento: caminhoCompleto,
        caminhoDocumentoPdf,
      };
      totalDocumentosGerados++;

      // A partir daqui é melhor esforço: o documento já foi gerado com
      // sucesso independente disto dar certo ou não — só registramos o
      // problema sem marcar erro no item.

      // As parcelas incluídas no documento passam para PROTESTO_ENVIADO — essa
      // é a base da situação "Vencida e enviada para protesto" na tela. Junto,
      // gravamos o multa/juros/total efetivamente usados no documento
      // (mesmo cálculo de `dadosDocumento.parcelas` acima) para a Ficha de
      // Cobrança nunca divergir do documento já gerado (decisão do usuário,
      // 2026-07-09).
      for (const parcela of parcelas) {
        try {
          const diasAtrasoParcela = calcularDiasAtraso(
            parcela.vencimento,
            hoje,
            configFinanceira.jurosContarDiaGeracao,
          );
          const { multa, juros, total } = calcularMultaJuros(
            Number(parcela.valor),
            diasAtrasoParcela,
            configFinanceira,
          );

          await financeiroService.atualizar(
            parcela.id,
            {
              status: "PROTESTO_ENVIADO",
              multaProtesto: multa,
              jurosProtesto: juros,
              totalProtesto: total,
            },
            relatorio.usuarioId,
          );
        } catch (erroParcela) {
          console.error(
            `[worker:geracao-word] falha ao marcar parcela ${parcela.id} como PROTESTO_ENVIADO`,
            erroParcela,
          );
        }
      }

      // Só depois de atualizar as parcelas dá pra saber se restou alguma
      // ainda em aberto (ex.: parcela futura, ainda não vencida) — se
      // restar, o protesto é parcial: matrícula fica "Pendente" + TAG de
      // aviso, em vez de "Enviado para Protesto".
      const restantesEmAberto = await financeiroRepository.contarEmAbertoPorMatricula(
        item.matriculaId,
      );
      const protestoCompleto = restantesEmAberto === 0;
      const situacaoDestino = protestoCompleto ? situacaoProtesto : situacaoPendente;

      try {
        await fichaService.mudarSituacao(item.matriculaId, situacaoDestino.id, relatorio.usuarioId);
      } catch (erroSituacao) {
        console.error(
          `[worker:geracao-word] falha ao mudar situação da matrícula ${item.matriculaId} para "${situacaoDestino.nome}"`,
          erroSituacao,
        );
      }

      if (!protestoCompleto) {
        try {
          const jaPossuiTag = await tagsRepository.findAssociacao(
            item.matriculaId,
            tagProtestoParcial.id,
          );
          if (!jaPossuiTag) {
            await fichaService.adicionarTag(
              item.matriculaId,
              tagProtestoParcial.id,
              relatorio.usuarioId,
            );
          }
        } catch (erroTag) {
          console.error(
            `[worker:geracao-word] falha ao marcar TAG "${TAG_TITULOS_ENVIADOS_PARA_PROTESTO}" na matrícula ${item.matriculaId}`,
            erroTag,
          );
        }
      }
    } catch (err) {
      erros.push({
        matriculaId: item.matriculaId,
        mensagem: err instanceof Error ? err.message : "Erro desconhecido ao gerar documento",
      });
    }

    await job.updateProgress(Math.round(((indice + 1) / itens.length) * 100));
  }

  await relatoriosRepository.update(relatorio.id, {
    itens: itens as unknown as Prisma.InputJsonValue,
    totalDocumentosGerados,
    erros: erros.length > 0 ? (erros as unknown as Prisma.InputJsonValue) : undefined,
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
