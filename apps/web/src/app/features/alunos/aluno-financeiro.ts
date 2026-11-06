import type { TituloAluno } from "../../core/models/titulo-aluno.model";
import { ehDevedora, estaVencida } from "../cobranca/ficha-totais";

/**
 * Regras da aba Financeiro do aluno que não dependem de tela (filtro por matrícula/curso e quais
 * títulos entram em "gerar cobrança" e "gerar protesto"). Sem Angular, para poder ser testada
 * (apps/api/tests/unit/aluno-financeiro.test.ts).
 */

/** Valor do filtro para os títulos do legado que não têm matrícula no Ethos. */
export const SEM_MATRICULA = "__sem_matricula__";

/** Abrangência: só os vencidos ou todos os que estão em aberto. */
export type AbrangenciaCobranca = "VENCIDOS" | "TODOS";

export interface OpcaoMatricula {
  /** Id da matrícula, ou SEM_MATRICULA. */
  id: string;
  rotulo: string;
  titulos: number;
}

type TituloDeMatricula = Pick<TituloAluno, "origem" | "matricula">;

/** Matrículas (por curso) que existem nos títulos do aluno, e "Sem matrícula" se houver. */
export function opcoesDeMatricula(titulos: TituloDeMatricula[]): OpcaoMatricula[] {
  const porId = new Map<string, OpcaoMatricula>();
  let semMatricula = 0;
  for (const t of titulos) {
    if (t.origem !== "MATRICULA" || !t.matricula) {
      semMatricula++;
      continue;
    }
    const atual = porId.get(t.matricula.id);
    if (atual) atual.titulos++;
    else {
      const numero = t.matricula.numeroMatricula ? ` · ${t.matricula.numeroMatricula}` : "";
      porId.set(t.matricula.id, {
        id: t.matricula.id,
        rotulo: `${t.matricula.curso.nome}${numero}`,
        titulos: 1,
      });
    }
  }
  const opcoes = [...porId.values()].sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  if (semMatricula > 0) {
    opcoes.push({
      id: SEM_MATRICULA,
      rotulo: "Sem matrícula (só no legado)",
      titulos: semMatricula,
    });
  }
  return opcoes;
}

/** "" = todas; SEM_MATRICULA = os títulos sem matrícula; senão, o id da matrícula. */
export function pertenceAMatricula(t: TituloDeMatricula, matriculaId: string): boolean {
  if (!matriculaId) return true;
  if (matriculaId === SEM_MATRICULA) return t.origem !== "MATRICULA" || !t.matricula;
  return t.origem === "MATRICULA" && t.matricula?.id === matriculaId;
}

type TituloParaCobranca = Pick<
  TituloAluno,
  "origem" | "matricula" | "status" | "vencimento" | "asaasPaymentId"
>;

/**
 * Títulos que entram em "gerar cobrança": parcelas de matrícula em aberto que ainda não têm
 * cobrança gerada, da matrícula escolhida (ou de todas), só as vencidas ou todas.
 */
export function titulosParaCobranca<T extends TituloParaCobranca>(
  titulos: T[],
  matriculaId: string,
  abrangencia: AbrangenciaCobranca,
  hoje: Date,
): T[] {
  return titulos.filter(
    (t) =>
      t.origem === "MATRICULA" &&
      t.status === "EM_ABERTO" &&
      !t.asaasPaymentId &&
      pertenceAMatricula(t, matriculaId) &&
      (abrangencia === "TODOS" || estaVencida(t, hoje)),
  );
}

type TituloParaProtesto = Pick<TituloAluno, "origem" | "matricula" | "status" | "vencimento">;

/** Matrículas da escolha (ou todas) que têm ao menos um título devedor vencido: as que podem ir a protesto. */
export function matriculasParaProtesto(
  titulos: TituloParaProtesto[],
  matriculaId: string,
  hoje: Date,
): OpcaoMatricula[] {
  const vencidos = titulos.filter(
    (t) =>
      t.origem === "MATRICULA" &&
      ehDevedora(t) &&
      estaVencida(t, hoje) &&
      pertenceAMatricula(t, matriculaId),
  );
  return opcoesDeMatricula(vencidos);
}
