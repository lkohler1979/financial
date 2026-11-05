import type { Parcela } from "../../core/models/parcela.model";
import { situacaoAutomatica } from "./ficha-totais";

/**
 * Filtros da tabela de parcelas da Ficha de Cobrança (estado da parcela, tipo de título e
 * situação), sem Angular, para poder ser testados (apps/api/tests/unit/ficha-filtros.test.ts).
 */

export const SEM_TIPO = "Sem tipo de título";
export const SEM_SITUACAO = "Sem situação";

/** Texto exato escolhido em cada filtro; vazio = não filtra. */
export interface FiltrosFicha {
  estado: string;
  tipo: string;
  situacao: string;
}

export const SEM_FILTROS: FiltrosFicha = { estado: "", tipo: "", situacao: "" };

export type ParcelaFiltravel = Pick<
  Parcela,
  "status" | "vencimento" | "tipoTitulo" | "situacaoCobranca"
>;

export interface OpcoesDosFiltros {
  estados: string[];
  tipos: string[];
  situacoes: string[];
}

export function temFiltro(f: FiltrosFicha): boolean {
  return f.estado !== "" || f.tipo !== "" || f.situacao !== "";
}

export function tipoDaParcela(p: Pick<Parcela, "tipoTitulo">): string {
  return p.tipoTitulo?.trim() || SEM_TIPO;
}

/**
 * A situação que a ficha mostra: a automática (pelo estado) ou, nos casos sem automática
 * (protestos), a escolhida à mão; sem nenhuma das duas, "Sem situação".
 */
export function situacaoDaParcela(p: ParcelaFiltravel, hoje: Date): string {
  return situacaoAutomatica(p, hoje) ?? p.situacaoCobranca?.nome ?? SEM_SITUACAO;
}

const ordenar = (valores: Iterable<string>): string[] =>
  [...new Set(valores)].sort((a, b) => a.localeCompare(b, "pt-BR"));

/** Só as opções que existem nas parcelas da matrícula (não adianta filtrar por algo que não há). */
export function opcoesDosFiltros<P extends ParcelaFiltravel>(
  parcelas: P[],
  estadoDe: (p: P) => string,
  hoje: Date,
): OpcoesDosFiltros {
  return {
    estados: ordenar(parcelas.map(estadoDe)),
    tipos: ordenar(parcelas.map(tipoDaParcela)),
    situacoes: ordenar(parcelas.map((p) => situacaoDaParcela(p, hoje))),
  };
}

/** Parcelas que atendem aos três filtros ao mesmo tempo (os vazios não restringem). */
export function filtrarParcelas<P extends ParcelaFiltravel>(
  parcelas: P[],
  filtros: FiltrosFicha,
  estadoDe: (p: P) => string,
  hoje: Date,
): P[] {
  if (!temFiltro(filtros)) return parcelas;
  return parcelas.filter(
    (p) =>
      (!filtros.estado || estadoDe(p) === filtros.estado) &&
      (!filtros.tipo || tipoDaParcela(p) === filtros.tipo) &&
      (!filtros.situacao || situacaoDaParcela(p, hoje) === filtros.situacao),
  );
}
