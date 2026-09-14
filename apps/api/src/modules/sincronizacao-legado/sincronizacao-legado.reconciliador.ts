import { StatusParcela, StatusSincronizacaoLegado } from "@prisma/client";
import { financeiroRepository } from "../financeiro/financeiro.repository";
import { parseDataLegado, type LegadoTituloDetalhe } from "./legado-client";

export interface ResultadoReconciliacaoMatricula {
  tituloConsultados: number;
  parcelasAtualizadas: number;
  naoEncontradosNoLegado: number;
}

/** Estados vistos no sistema legado que indicam parcela paga/renegociada.
 * "Alteracao" (decisão do usuário, 2026-09-11: mapear para RENEGOCIADO) é o
 * estado do título de origem quando ele foi substituído por um novo título
 * numa renegociação (`vinculos.origem[].titulo_estado_origem` no endpoint
 * `titulo-informacoes`) — é um estado terminal do lado do legado (esse
 * título específico não é mais cobrável), então sempre se aplica, como
 * PAGO/CANCELADO. PENDÊNCIA: valores exatos de `tituloEstado` para
 * pago/cancelado ainda não confirmados (ver PENDENCIAS.md). */
function statusLegadoParaEthos(detalhe: LegadoTituloDetalhe): StatusParcela | null {
  if (detalhe.tituloDataPagamento || detalhe.tituloDataBaixa) return "PAGO";
  if (detalhe.tituloEstado.toLowerCase().includes("cancel")) return "CANCELADO";
  if (detalhe.tituloEstado.toLowerCase().includes("alteracao")) return "RENEGOCIADO";
  return null; // "Aberto" ou equivalente: não altera um status já controlado pelo Ethos (protesto).
}

/**
 * Classifica o tipo do título a partir de `tituloDescricao` (ex.:
 * "Mensalidade - 8 / 12", "Renegociação - 3 / 13") — mesma heurística já
 * usada no crawler de referência (`classificarTipoTitulo` em
 * `gerarRelatorioWord.js`). Decisão do usuário, 2026-09-11: sincronizar
 * `Parcela.tipoTitulo` a partir desse campo (é dado estrutural do legado,
 * não gestão interna de cobrança — mesmo espírito da seção "O que
 * sincronizar" registrada em PENDENCIAS.md).
 */
function tipoTituloDaDescricao(descricao: string): string | undefined {
  const texto = descricao.toLowerCase();
  if (texto.includes("renegocia")) return "Renegociação";
  if (texto.includes("mensalidade")) return "Mensalidade";
  return undefined;
}

/**
 * Aplica o detalhe vindo do legado sobre uma Parcela já existente no Ethos.
 *
 * Decisão do usuário (grilling, 2026-09-11): o legado é fonte de verdade só
 * para o que ele controla nativamente (título aberto/baixado, valor pago,
 * data de pagamento) — nunca sobrescreve campos de gestão interna do Ethos
 * (situação de cobrança, TAG, observações), nem rebaixa um status já
 * avançado no fluxo de cobrança (ex.: PROTESTADO) de volta para EM_ABERTO só
 * porque o legado ainda mostra "Aberto".
 */
function aplicarDetalheNaParcela(
  parcela: {
    status: StatusParcela;
    valorPago: unknown;
    dataPagamento: Date | null;
    tipoTitulo: string | null;
  },
  detalhe: LegadoTituloDetalhe,
): { status?: StatusParcela; valorPago: number; dataPagamento: Date | null; tipoTitulo?: string } | null {
  const novoStatus = statusLegadoParaEthos(detalhe);
  const valorPagoLegado = detalhe.tituloValorPago;
  const dataPagamentoLegado = parseDataLegado(detalhe.tituloDataPagamento ?? detalhe.tituloDataBaixa);
  const tipoTituloLegado = tipoTituloDaDescricao(detalhe.tituloDescricao);

  const mudouStatus = novoStatus !== null && novoStatus !== parcela.status;
  const mudouValor = Number(parcela.valorPago ?? 0) !== valorPagoLegado;
  const mudouData =
    (dataPagamentoLegado?.getTime() ?? null) !== (parcela.dataPagamento?.getTime() ?? null);
  const mudouTipo = tipoTituloLegado !== undefined && parcela.tipoTitulo !== tipoTituloLegado;

  if (!mudouStatus && !mudouValor && !mudouData && !mudouTipo) return null;

  return {
    ...(novoStatus ? { status: novoStatus } : {}),
    // O legado é sempre a fonte de verdade para valor pago/data de pagamento
    // (decisão do usuário, 2026-09-14) — inclusive voltando a 0/null se o
    // legado deixar de mostrar o pagamento que antes mostrava.
    valorPago: valorPagoLegado,
    dataPagamento: dataPagamentoLegado,
    ...(mudouTipo ? { tipoTitulo: tipoTituloLegado } : {}),
  };
}

/**
 * Reconcilia todas as Parcelas de uma Matrícula contra o sistema legado,
 * consultando 1 título por vez (`buscarInformacoesTitulo`) pelo mesmo
 * `codTitulo` já gravado desde a importação da planilha — não depende de
 * buscar por CPF/curso, então não cria ambiguidade nem exige que o aluno
 * exista no legado com o mesmo nome de curso.
 */
export async function reconciliarMatricula(
  matriculaId: string,
  buscarInformacoesTitulo: (tituloId: string) => Promise<LegadoTituloDetalhe | null>,
): Promise<ResultadoReconciliacaoMatricula> {
  const parcelas = await financeiroRepository.listarTodasPorMatricula(matriculaId);

  let tituloConsultados = 0;
  let parcelasAtualizadas = 0;
  let naoEncontradosNoLegado = 0;

  for (const parcela of parcelas) {
    if (!parcela.codTitulo) continue;
    tituloConsultados++;

    const detalhe = await buscarInformacoesTitulo(parcela.codTitulo);
    if (!detalhe) {
      naoEncontradosNoLegado++;
      continue;
    }

    const alteracoes = aplicarDetalheNaParcela(parcela, detalhe);
    // Sempre grava, mesmo sem alteração de valor/status — é o que marca a
    // Parcela como conferida contra o legado (statusSincronizacaoLegado).
    await financeiroRepository.update(parcela.id, {
      ...(alteracoes ?? {}),
      statusSincronizacaoLegado: StatusSincronizacaoLegado.SINCRONIZADO,
    });
    if (alteracoes) parcelasAtualizadas++;
  }

  return { tituloConsultados, parcelasAtualizadas, naoEncontradosNoLegado };
}
