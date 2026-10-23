import type { StatusParcela } from "@prisma/client";
import { ValidationError } from "../../shared/errors/app-error";
import { arredondarAbnt } from "../../shared/utils/arredondamento";
import {
  calcularMultaJurosParcela,
  type ConfiguracaoFinanceira,
} from "../relatorios/calculo-financeiro";

/**
 * Regras da renegociação de dívida, sem banco: quais parcelas entram, quanto se deve (com multa e
 * juros), o desconto e como o valor negociado vira novas parcelas mensais.
 */

/** Parcelas ainda não pagas (nem renegociadas, nem canceladas): as únicas que podem ser renegociadas. */
export const STATUS_RENEGOCIAVEIS: readonly StatusParcela[] = [
  "EM_ABERTO",
  "PROTESTO_ENVIADO",
  "PROTESTADO",
];

export const MAX_PARCELAS_RENEGOCIACAO = 60;
export const TIPO_TITULO_RENEGOCIACAO = "Renegociação";

export interface ParcelaParaRenegociar {
  id: string;
  parcela: string;
  codTitulo: string;
  status: StatusParcela;
  valor: number;
  vencimento: Date;
  multaLegado?: number | null;
  jurosLegado?: number | null;
  totalLegado?: number | null;
  multaProtesto?: number | null;
  jurosProtesto?: number | null;
  totalProtesto?: number | null;
}

export interface EntradaRenegociacao {
  desconto: number;
  numeroParcelas: number;
  /** AAAA-MM-DD. As demais parcelas vencem no mesmo dia dos meses seguintes. */
  primeiroVencimento: string;
}

export interface ParcelaDoPlano {
  id: string;
  parcela: string;
  codTitulo: string;
  valor: number;
  multa: number;
  juros: number;
  total: number;
}

export interface NovaParcelaDoPlano {
  numero: number;
  vencimento: Date;
  valor: number;
}

export interface PlanoRenegociacao {
  parcelas: ParcelaDoPlano[];
  /** Soma dos valores das parcelas, sem multa e juros. */
  valorOriginal: number;
  multa: number;
  juros: number;
  /** Valor original + multa + juros. */
  totalDevido: number;
  desconto: number;
  /** Total devido − desconto: o que as novas parcelas somam. */
  valorNegociado: number;
  novasParcelas: NovaParcelaDoPlano[];
}

const emCentavos = (valor: number): number => Math.round(valor * 100);
const emReais = (centavos: number): number => centavos / 100;

/** Dia de hoje (AAAA-MM-DD) no fuso do servidor. */
function diaDe(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/** Vencimento de uma data (guardada à meia-noite UTC) como AAAA-MM-DD, sem depender do fuso. */
function diaDoVencimento(vencimento: Date): string {
  return vencimento.toISOString().slice(0, 10);
}

/**
 * Multa, juros e total de uma parcela hoje. Mesma precedência da Ficha de Cobrança: valores
 * congelados no protesto, depois os do legado, depois o cálculo do sistema; parcela que ainda não
 * venceu não tem multa nem juros.
 */
export function encargosDaParcela(
  parcela: ParcelaParaRenegociar,
  hoje: Date,
  config: ConfiguracaoFinanceira,
): { multa: number; juros: number; total: number } {
  if (parcela.totalProtesto != null) {
    return {
      multa: arredondarAbnt(parcela.multaProtesto ?? 0),
      juros: arredondarAbnt(parcela.jurosProtesto ?? 0),
      total: arredondarAbnt(parcela.totalProtesto),
    };
  }
  if (parcela.totalLegado != null) {
    return {
      multa: arredondarAbnt(parcela.multaLegado ?? 0),
      juros: arredondarAbnt(parcela.jurosLegado ?? 0),
      total: arredondarAbnt(parcela.totalLegado),
    };
  }
  if (diaDoVencimento(parcela.vencimento) >= diaDe(hoje)) {
    return { multa: 0, juros: 0, total: arredondarAbnt(parcela.valor) };
  }
  // O cálculo usa a data local: monta a data do vencimento a partir dos componentes UTC.
  const venc = parcela.vencimento;
  const vencimentoLocal = new Date(venc.getUTCFullYear(), venc.getUTCMonth(), venc.getUTCDate());
  const c = calcularMultaJurosParcela(
    { valor: parcela.valor, vencimento: vencimentoLocal },
    hoje,
    config,
  );
  return { multa: c.multa, juros: c.juros, total: c.total };
}

/** Vencimento da parcela `indice` (0 = a primeira): mesmo dia dos meses seguintes, limitado ao fim do mês. */
export function vencimentoDaNovaParcela(primeiroVencimento: string, indice: number): Date {
  const [ano, mes, dia] = primeiroVencimento.split("-").map(Number);
  const mesesDesdeZero = mes - 1 + indice;
  const anoAlvo = ano + Math.floor(mesesDesdeZero / 12);
  const mesAlvo = mesesDesdeZero % 12;
  const ultimoDia = new Date(Date.UTC(anoAlvo, mesAlvo + 1, 0)).getUTCDate();
  return new Date(Date.UTC(anoAlvo, mesAlvo, Math.min(dia, ultimoDia)));
}

/** Divide em centavos: parcelas iguais, a última absorve a diferença de arredondamento. */
export function dividirEmParcelas(valor: number, quantidade: number): number[] {
  const total = emCentavos(valor);
  const base = Math.floor(total / quantidade);
  const valores = Array<number>(quantidade).fill(base);
  valores[quantidade - 1] = total - base * (quantidade - 1);
  return valores.map(emReais);
}

export function planejarRenegociacao(
  parcelas: ParcelaParaRenegociar[],
  entrada: EntradaRenegociacao,
  config: ConfiguracaoFinanceira,
  hoje: Date,
): PlanoRenegociacao {
  if (parcelas.length === 0) throw new ValidationError("Selecione ao menos uma parcela");

  for (const p of parcelas) {
    if (!STATUS_RENEGOCIAVEIS.includes(p.status)) {
      throw new ValidationError(
        `A parcela ${p.parcela} (título ${p.codTitulo}) não pode ser renegociada: só parcelas ainda não pagas`,
      );
    }
  }
  if (
    !Number.isInteger(entrada.numeroParcelas) ||
    entrada.numeroParcelas < 1 ||
    entrada.numeroParcelas > MAX_PARCELAS_RENEGOCIACAO
  ) {
    throw new ValidationError(`O número de parcelas deve ser de 1 a ${MAX_PARCELAS_RENEGOCIACAO}`);
  }
  if (entrada.primeiroVencimento < diaDe(hoje)) {
    throw new ValidationError("A data da primeira parcela não pode estar no passado");
  }
  if (!Number.isFinite(entrada.desconto) || entrada.desconto < 0) {
    throw new ValidationError("O desconto não pode ser negativo");
  }

  const doPlano: ParcelaDoPlano[] = parcelas.map((p) => ({
    id: p.id,
    parcela: p.parcela,
    codTitulo: p.codTitulo,
    valor: arredondarAbnt(p.valor),
    ...encargosDaParcela(p, hoje, config),
  }));
  const somar = (f: (p: ParcelaDoPlano) => number) =>
    emReais(doPlano.reduce((soma, p) => soma + emCentavos(f(p)), 0));

  const valorOriginal = somar((p) => p.valor);
  const multa = somar((p) => p.multa);
  const juros = somar((p) => p.juros);
  const totalDevido = somar((p) => p.total);
  const desconto = emReais(emCentavos(entrada.desconto));
  const valorNegociado = emReais(emCentavos(totalDevido) - emCentavos(desconto));
  if (valorNegociado < 0.01) {
    throw new ValidationError("O desconto não pode ser igual ou maior que o total devido");
  }

  const valores = dividirEmParcelas(valorNegociado, entrada.numeroParcelas);
  return {
    parcelas: doPlano,
    valorOriginal,
    multa,
    juros,
    totalDevido,
    desconto,
    valorNegociado,
    novasParcelas: valores.map((valor, i) => ({
      numero: i + 1,
      vencimento: vencimentoDaNovaParcela(entrada.primeiroVencimento, i),
      valor,
    })),
  };
}
