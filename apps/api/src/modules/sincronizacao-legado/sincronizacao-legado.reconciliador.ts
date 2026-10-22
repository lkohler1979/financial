import { StatusParcela, StatusSincronizacaoLegado } from "@prisma/client";
import { financeiroRepository } from "../financeiro/financeiro.repository";
import { parseDataLegadoQualquer, type LegadoTituloDetalhe } from "./legado-client";

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
export function statusLegadoParaEthos(
  detalhe: Pick<LegadoTituloDetalhe, "tituloEstado" | "tituloDataPagamento" | "tituloDataBaixa">,
): StatusParcela | null {
  // O "Estado" do título é quem diz a situação (um título pago com cupom, por exemplo, vem
  // "Pago" sem data de pagamento). Valores vistos ao vivo em 2026-10-22, em 2.646 títulos: Pago,
  // Aberto, Cancelado, Alteracao, Pagamento Múltiplo e Estorno.
  const estado = normalizarEstado(detalhe.tituloEstado);
  if (estado in ESTADO_PARA_STATUS) return ESTADO_PARA_STATUS[estado];
  // Estado desconhecido ou vazio: cai nas regras antigas (data de pagamento, texto do estado).
  if (detalhe.tituloDataPagamento || detalhe.tituloDataBaixa) return "PAGO";
  if (estado.includes("cancel")) return "CANCELADO";
  if (estado.includes("alteracao")) return "RENEGOCIADO";
  return null;
}

/** Sem acento, caixa ou espaços repetidos — "Pagamento Múltiplo" e "pagamento multiplo" casam. */
function normalizarEstado(estado: string): string {
  return estado
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Estado do legado → situação da parcela. `null` = não altera o que o Ethos já controla:
 *  - "Aberto" não rebaixa um status avançado (ex.: PROTESTADO);
 * "Pagamento Múltiplo" (título quitado junto com outros) conta como PAGO e "Estorno" (pagamento
 * devolvido) volta a parcela para EM_ABERTO — decisões do usuário, 2026-10-22. Parcela em
 * protesto não é reaberta por um Estorno (ver `aplicarDetalheNaParcela`).
 */
const ESTADO_PARA_STATUS: Record<string, StatusParcela | null> = {
  pago: "PAGO",
  "pagamento multiplo": "PAGO",
  cancelado: "CANCELADO",
  alteracao: "RENEGOCIADO",
  aberto: null,
  estorno: "EM_ABERTO",
};

/**
 * Classifica o tipo do título a partir de `tituloDescricao` (ex.:
 * "Mensalidade - 8 / 12", "Renegociação - 3 / 13") — mesma heurística já
 * usada no crawler de referência (`classificarTipoTitulo` em
 * `gerarRelatorioWord.js`). Decisão do usuário, 2026-09-11: sincronizar
 * `Parcela.tipoTitulo` a partir desse campo (é dado estrutural do legado,
 * não gestão interna de cobrança — mesmo espírito da seção "O que
 * sincronizar" registrada em PENDENCIAS.md).
 */
export function tipoTituloDaDescricao(descricao: string): string | undefined {
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
/**
 * Deriva o tipo de título normalizado ("Mensalidade"/"Renegociação") a
 * partir do detalhe do legado. Decisão do usuário, 2026-09-17: `tipotituloId`/
 * `tipotituloNome` (campo estruturado, confirmado ao vivo contra
 * `titulo-informacoes/{id}`) é a fonte preferida — só cai para a heurística
 * sobre `tituloDescricao` quando o legado não traz `tipotituloNome`.
 */
export function tipoTituloDoDetalhe(
  detalhe: Pick<LegadoTituloDetalhe, "tipoTituloNome" | "tituloDescricao">,
): string | undefined {
  return detalhe.tipoTituloNome ?? tipoTituloDaDescricao(detalhe.tituloDescricao);
}

/**
 * Data de pagamento que o Ethos usa: Data Pagto, ou a Data Baixa quando só ela existe. Só vale
 * para parcela paga (ou de estado ainda sem regra): em título cancelado, renegociado ou estornado
 * a baixa não é um pagamento, então não há data de pagamento.
 */
export function dataPagamentoEfetiva(
  status: StatusParcela | null,
  dataPagto: Date | null,
  dataBaixa: Date | null,
): Date | null {
  if (status !== null && status !== "PAGO") return null;
  return dataPagto ?? dataBaixa;
}

export function aplicarDetalheNaParcela(
  parcela: {
    status: StatusParcela;
    valorPago: unknown;
    dataPagamento: Date | null;
    tipoTitulo: string | null;
    tipoTituloIdLegado: unknown;
    tituloObservacoesLegado: string | null;
    estadoLegado?: string | null;
    boletoLegadoId?: string | null;
    boletoLegadoHash?: string | null;
    remessaLegadoId?: string | null;
    dataPagamentoLegado?: Date | null;
    dataBaixaLegado?: Date | null;
    multaLegado: unknown;
    jurosLegado: unknown;
    totalLegado: unknown;
    descontoLegado?: unknown;
  },
  // `descontoCalc` ausente = o título veio da busca em lote (sem desconto): não mexe no que há.
  detalhe: Omit<LegadoTituloDetalhe, "descontoCalc"> & { descontoCalc?: number },
): {
  status?: StatusParcela;
  valorPago: number;
  dataPagamento: Date | null;
  tipoTitulo?: string;
  tipoTituloIdLegado: number | null;
  tituloObservacoesLegado: string | null;
  estadoLegado: string | null;
  boletoLegadoId?: string | null;
  boletoLegadoHash?: string | null;
  remessaLegadoId?: string | null;
  dataPagamentoLegado: Date | null;
  dataBaixaLegado: Date | null;
  multaLegado: number;
  jurosLegado: number;
  totalLegado: number;
  descontoLegado?: number;
} | null {
  const novoStatus = statusLegadoParaEthos(detalhe);
  const valorPagoLegado = detalhe.tituloValorPago;
  // Data efetiva do Ethos: Data Pagto, ou a Data Baixa quando só ela existe. As duas datas, como
  // o legado traz, também são guardadas (aceita "DD/MM/AAAA" e "AAAA-MM-DD").
  const dataPagto = parseDataLegadoQualquer(detalhe.tituloDataPagamento);
  const dataBaixa = parseDataLegadoQualquer(detalhe.tituloDataBaixa);
  const dataPagamentoLegado = dataPagamentoEfetiva(novoStatus, dataPagto, dataBaixa);
  const tipoTituloLegado = tipoTituloDoDetalhe(detalhe);

  // Um Estorno reabre a parcela, mas não tira do protesto uma parcela que já foi para lá.
  const emProtesto = parcela.status === "PROTESTO_ENVIADO" || parcela.status === "PROTESTADO";
  const statusAplicavel = novoStatus === "EM_ABERTO" && emProtesto ? null : novoStatus;
  const mudouStatus = statusAplicavel !== null && statusAplicavel !== parcela.status;
  const mudouValor = Number(parcela.valorPago ?? 0) !== valorPagoLegado;
  const mudouData =
    (dataPagamentoLegado?.getTime() ?? null) !== (parcela.dataPagamento?.getTime() ?? null);
  const mudouTipo = tipoTituloLegado !== undefined && parcela.tipoTitulo !== tipoTituloLegado;
  const mudouTipoId = (parcela.tipoTituloIdLegado as number | null) !== detalhe.tipoTituloId;
  const mudouObservacoesLegado = parcela.tituloObservacoesLegado !== detalhe.tituloObservacoes;
  const mudouDatasLegado =
    (parcela.dataPagamentoLegado?.getTime() ?? null) !== (dataPagto?.getTime() ?? null) ||
    (parcela.dataBaixaLegado?.getTime() ?? null) !== (dataBaixa?.getTime() ?? null);
  const estadoLegado = detalhe.tituloEstado.trim() || null;
  const mudouEstado = (parcela.estadoLegado ?? null) !== estadoLegado;
  // Boleto/remessa só vêm do detalhe do título: `undefined` = não consultado, não apaga o que há.
  const trouxeBoleto = detalhe.boletoId !== undefined;
  const mudouBoleto =
    trouxeBoleto &&
    ((parcela.boletoLegadoId ?? null) !== (detalhe.boletoId ?? null) ||
      (parcela.boletoLegadoHash ?? null) !== (detalhe.boletoHash ?? null) ||
      (parcela.remessaLegadoId ?? null) !== (detalhe.remessaId ?? null));
  // NaN quando a Parcela ainda não tem valor gravado (null) — força "mudou"
  // na primeira sincronização, já que qualquer número é diferente de NaN.
  const mudouMultaJuros =
    Number(parcela.multaLegado ?? NaN) !== detalhe.multaCalc ||
    Number(parcela.jurosLegado ?? NaN) !== detalhe.jurosCalc ||
    Number(parcela.totalLegado ?? NaN) !== detalhe.totalCalc ||
    (detalhe.descontoCalc !== undefined &&
      Number(parcela.descontoLegado ?? NaN) !== detalhe.descontoCalc);

  if (
    !mudouStatus &&
    !mudouValor &&
    !mudouData &&
    !mudouTipo &&
    !mudouTipoId &&
    !mudouObservacoesLegado &&
    !mudouDatasLegado &&
    !mudouEstado &&
    !mudouBoleto &&
    !mudouMultaJuros
  ) {
    return null;
  }

  return {
    ...(statusAplicavel ? { status: statusAplicavel } : {}),
    // O legado é sempre a fonte de verdade para valor pago/data de pagamento
    // (decisão do usuário, 2026-09-14) — inclusive voltando a 0/null se o
    // legado deixar de mostrar o pagamento que antes mostrava.
    valorPago: valorPagoLegado,
    dataPagamento: dataPagamentoLegado,
    ...(mudouTipo ? { tipoTitulo: tipoTituloLegado } : {}),
    tipoTituloIdLegado: detalhe.tipoTituloId,
    tituloObservacoesLegado: detalhe.tituloObservacoes,
    estadoLegado,
    dataPagamentoLegado: dataPagto,
    dataBaixaLegado: dataBaixa,
    ...(trouxeBoleto
      ? {
          boletoLegadoId: detalhe.boletoId ?? null,
          boletoLegadoHash: detalhe.boletoHash ?? null,
          remessaLegadoId: detalhe.remessaId ?? null,
        }
      : {}),
    // Idem para multa/juros/total — decisão do usuário, 2026-09-15: Parcela
    // sincronizada com o legado nunca tem multa/juros calculados pelo Ethos,
    // sempre reflete o valor que o próprio legado calculou.
    multaLegado: detalhe.multaCalc,
    jurosLegado: detalhe.jurosCalc,
    totalLegado: detalhe.totalCalc,
    ...(detalhe.descontoCalc !== undefined ? { descontoLegado: detalhe.descontoCalc } : {}),
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
