import fs from "node:fs/promises";
import path from "node:path";
import { Prisma, TipoTituloProtesto } from "@prisma/client";
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
  ConfiguracaoFinanceira,
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

// Rótulo usado no NOME DO ARQUIVO quando o relatório separa os documentos
// por tipo (pedido do usuário) — nota: "NEGOCIACAO" no arquivo, mesmo o
// enum/valor interno sendo RENEGOCIACAO (Parcela.tipoTitulo).
const SUFIXO_ARQUIVO_POR_TIPO: Record<"MENSALIDADE" | "RENEGOCIACAO", string> = {
  MENSALIDADE: "MENSALIDADE",
  RENEGOCIACAO: "NEGOCIACAO",
};

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
  /** Presente só quando o relatório usa "separar por tipo" (Ambos +
   * separarDocumentosPorTipo) — indica a qual subconjunto de parcelas este
   * item/documento se refere. */
  tipoTituloDocumento?: "MENSALIDADE" | "RENEGOCIACAO";
}

function sanitizarNomeArquivo(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function montarNomeArquivo(
  padrao: string,
  item: ItemRelatorio,
  sufixoTipo?: "MENSALIDADE" | "RENEGOCIACAO",
): string {
  const base = padrao
    .replace("{NOME}", sanitizarNomeArquivo(item.alunoNome))
    .replace("{CPF}", item.alunoCpf)
    .replace("{CURSO}", sanitizarNomeArquivo(item.cursoNome));
  const comExtensao = base.endsWith(".docx") ? base : `${base}.docx`;
  if (!sufixoTipo) return comExtensao;
  return comExtensao.replace(/\.docx$/i, `_${SUFIXO_ARQUIVO_POR_TIPO[sufixoTipo]}.docx`);
}

interface ContextoGeracao {
  pastaSaida: string;
  padraoNomeArquivo: string;
  configFinanceira: ConfiguracaoFinanceira;
  diasAtrasoMinimo: number;
  hoje: Date;
  usuarioId: string;
}

/**
 * Gera o documento de protesto (docx + pdf) para uma matrícula, restrito às
 * parcelas do `tipoFiltro` informado (ou sem restrição, quando omitido).
 * Retorna `null` quando não há parcela nesse subconjunto (matrícula elegível
 * só pelo outro tipo, no modo "separar por tipo") — nesse caso não gera
 * nenhum arquivo. As parcelas incluídas passam para PROTESTO_ENVIADO.
 */
async function gerarDocumentoParaGrupo(
  item: ItemRelatorio,
  ctx: ContextoGeracao,
  tipoFiltro?: TipoTituloProtesto,
  sufixoArquivo?: "MENSALIDADE" | "RENEGOCIACAO",
): Promise<ItemRelatorio | null> {
  const parcelas = await relatoriosRepository.buscarParcelasVencidasDaMatricula(
    item.matriculaId,
    ctx.diasAtrasoMinimo,
    tipoFiltro,
  );
  if (parcelas.length === 0) return null;

  const calculosParcelas = parcelas.map((p) => {
    const diasAtraso = calcularDiasAtraso(p.vencimento, ctx.hoje, ctx.configFinanceira.jurosContarDiaGeracao);
    return { vencimento: p.vencimento, ...calcularMultaJuros(Number(p.valor), diasAtraso, ctx.configFinanceira) };
  });

  const dadosDocumento = {
    alunoNome: item.alunoNome,
    alunoCpf: item.alunoCpf,
    cursoNome: item.cursoNome,
    parcelas: calculosParcelas,
  };

  const buffer = await gerarDocumentoProtesto(dadosDocumento);
  const nomeArquivo = montarNomeArquivo(ctx.padraoNomeArquivo, item, sufixoArquivo);
  const caminhoCompleto = path.join(ctx.pastaSaida, nomeArquivo);
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
    console.error(`[worker:geracao-word] falha ao gerar PDF da matrícula ${item.matriculaId}`, erroPdf);
  }

  const valorTotal = calculosParcelas.reduce((soma, c) => soma + c.total, 0);

  // As parcelas incluídas no documento passam para PROTESTO_ENVIADO — essa é
  // a base da situação "Vencida e enviada para protesto" na tela. Junto,
  // gravamos o multa/juros/total efetivamente usados no documento (mesmo
  // cálculo acima) para a Ficha de Cobrança nunca divergir do documento já
  // gerado (decisão do usuário, 2026-07-09).
  for (let i = 0; i < parcelas.length; i++) {
    const parcela = parcelas[i];
    const { multa, juros, total } = calculosParcelas[i];
    try {
      await financeiroService.atualizar(
        parcela.id,
        { status: "PROTESTO_ENVIADO", multaProtesto: multa, jurosProtesto: juros, totalProtesto: total },
        ctx.usuarioId,
      );
    } catch (erroParcela) {
      console.error(
        `[worker:geracao-word] falha ao marcar parcela ${parcela.id} como PROTESTO_ENVIADO`,
        erroParcela,
      );
    }
  }

  return {
    ...item,
    documentoGerado: true,
    caminhoDocumento: caminhoCompleto,
    caminhoDocumentoPdf,
    quantidadeParcelasVencidas: parcelas.length,
    valorTotal,
    tipoTituloDocumento: sufixoArquivo,
  };
}

async function processarJob(job: Job<GeracaoWordJobData>): Promise<void> {
  const relatorio = await relatoriosRepository.findById(job.data.relatorioId);
  if (!relatorio) throw new Error(`Relatório ${job.data.relatorioId} não encontrado`);

  const configuracao = await configuracoesRepository.obterOuCriar();
  const pastaSaida = path.resolve(configuracao.pastaSaidaDocumentos);
  await fs.mkdir(pastaSaida, { recursive: true });

  const ctx: ContextoGeracao = {
    pastaSaida,
    padraoNomeArquivo: configuracao.padraoNomeArquivo,
    configFinanceira: {
      multaPercentual: Number(configuracao.multaPercentual),
      jurosDiarioPercentual: Number(configuracao.jurosDiarioPercentual),
      jurosContarDiaGeracao: configuracao.jurosContarDiaGeracao,
    },
    diasAtrasoMinimo: relatorio.incluirParcelasVencidasRecentes ? 0 : relatorio.diasAtraso ?? 0,
    hoje: new Date(),
    usuarioId: relatorio.usuarioId,
  };

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

  const itensOriginais = Array.isArray(relatorio.itens)
    ? (relatorio.itens as unknown as ItemRelatorio[])
    : [];
  const itensFinais: ItemRelatorio[] = [];
  let totalDocumentosGerados = 0;
  const erros: Array<{ matriculaId: string; mensagem: string }> = [];

  // Só separa em dois documentos quando o relatório pediu ambos os tipos E
  // marcou a opção de separar (pedido do usuário) — do contrário, gera um
  // único documento combinado, como sempre foi.
  const separarPorTipo =
    relatorio.tipoTituloProtesto === "AMBOS" && relatorio.separarDocumentosPorTipo;

  for (let indice = 0; indice < itensOriginais.length; indice++) {
    const item = itensOriginais[indice];
    try {
      const gerados: ItemRelatorio[] = [];

      if (separarPorTipo) {
        const mensalidade = await gerarDocumentoParaGrupo(item, ctx, "MENSALIDADE", "MENSALIDADE");
        if (mensalidade) gerados.push(mensalidade);
        const renegociacao = await gerarDocumentoParaGrupo(
          item,
          ctx,
          "RENEGOCIACAO",
          "RENEGOCIACAO",
        );
        if (renegociacao) gerados.push(renegociacao);
      } else {
        const combinado = await gerarDocumentoParaGrupo(item, ctx, relatorio.tipoTituloProtesto);
        if (combinado) gerados.push(combinado);
      }

      if (gerados.length === 0) {
        // Não deveria acontecer (a matrícula só chega aqui por já ter
        // parcela elegível), mas se acontecer, preserva o item original
        // sem marcar como gerado em vez de descartar silenciosamente.
        itensFinais.push(item);
      } else {
        itensFinais.push(...gerados);
        totalDocumentosGerados += gerados.length;
      }

      // A partir daqui é melhor esforço: os documentos já foram gerados com
      // sucesso independente disto dar certo ou não — só registramos o
      // problema sem marcar erro no item. A checagem de "restam parcelas em
      // aberto" é por matrícula (não por tipo), então roda uma vez só,
      // depois de gerar os 1-2 documentos.
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
      itensFinais.push(item);
      erros.push({
        matriculaId: item.matriculaId,
        mensagem: err instanceof Error ? err.message : "Erro desconhecido ao gerar documento",
      });
    }

    await job.updateProgress(Math.round(((indice + 1) / itensOriginais.length) * 100));
  }

  await relatoriosRepository.update(relatorio.id, {
    itens: itensFinais as unknown as Prisma.InputJsonValue,
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
