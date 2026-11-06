import { describe, expect, it } from "vitest";
import {
  matriculasParaProtesto,
  opcoesDeMatricula,
  pertenceAMatricula,
  SEM_MATRICULA,
  titulosParaCobranca,
} from "../../../web/src/app/features/alunos/aluno-financeiro";

const hoje = new Date(2026, 10, 6); // 06/11/2026

const mat = (id: string, curso: string, numero: string | null = null) => ({
  id,
  numeroMatricula: numero,
  curso: { id: `c-${id}`, codigo: id, nome: curso },
});

type T = Parameters<typeof titulosParaCobranca>[0][number] & { id: string };
const t = (id: string, extra: Partial<T> = {}): T => ({
  id,
  origem: "MATRICULA",
  matricula: mat("m1", "Pedagogia", "100"),
  status: "EM_ABERTO",
  vencimento: "2026-09-10T00:00:00.000Z", // vencida
  asaasPaymentId: null,
  ...extra,
});
const ids = (l: { id: string }[]) => l.map((x) => x.id);

const titulos: T[] = [
  t("1"), // m1 vencida
  t("2", { vencimento: "2027-01-10T00:00:00.000Z" }), // m1 a vencer
  t("3", { status: "PAGO" }), // m1 paga
  t("4", { matricula: mat("m2", "Gestão") }), // m2 vencida
  t("5", { matricula: mat("m2", "Gestão"), asaasPaymentId: "pay_1" }), // m2 vencida já com cobrança
  t("6", { status: "PROTESTADO", matricula: mat("m2", "Gestão") }), // m2 protestada (vencida)
  t("7", { origem: "SEM_MATRICULA", matricula: null }), // legado sem matrícula
];

describe("opções de matrícula/curso", () => {
  it("agrupa por matrícula, ordena por nome e põe 'sem matrícula' por último", () => {
    const o = opcoesDeMatricula(titulos);
    expect(o.map((x) => [x.id, x.rotulo, x.titulos])).toEqual([
      ["m2", "Gestão", 3],
      ["m1", "Pedagogia · 100", 3],
      [SEM_MATRICULA, "Sem matrícula (só no legado)", 1],
    ]);
  });

  it("filtra por matrícula, por 'sem matrícula' e por todas", () => {
    expect(ids(titulos.filter((x) => pertenceAMatricula(x, "m1")))).toEqual(["1", "2", "3"]);
    expect(ids(titulos.filter((x) => pertenceAMatricula(x, SEM_MATRICULA)))).toEqual(["7"]);
    expect(titulos.filter((x) => pertenceAMatricula(x, ""))).toHaveLength(7);
  });
});

describe("títulos para gerar cobrança", () => {
  it("só vencidos: em aberto, vencidos e sem cobrança já gerada", () => {
    expect(ids(titulosParaCobranca(titulos, "", "VENCIDOS", hoje))).toEqual(["1", "4"]);
  });

  it("todos em aberto inclui os a vencer, mas nunca pagos, protestados ou já cobrados", () => {
    expect(ids(titulosParaCobranca(titulos, "", "TODOS", hoje))).toEqual(["1", "2", "4"]);
  });

  it("respeita a matrícula escolhida e ignora o que não tem matrícula", () => {
    expect(ids(titulosParaCobranca(titulos, "m1", "TODOS", hoje))).toEqual(["1", "2"]);
    expect(titulosParaCobranca(titulos, SEM_MATRICULA, "TODOS", hoje)).toEqual([]);
  });
});

describe("matrículas para gerar protesto", () => {
  it("são as que têm título devedor vencido (em aberto ou protestado)", () => {
    expect(matriculasParaProtesto(titulos, "", hoje).map((o) => o.id)).toEqual(["m2", "m1"]);
    expect(matriculasParaProtesto(titulos, "m1", hoje).map((o) => o.id)).toEqual(["m1"]);
  });

  it("matrícula só com título a vencer ou pago fica de fora", () => {
    const so = [t("a", { vencimento: "2027-01-10T00:00:00.000Z" }), t("b", { status: "PAGO" })];
    expect(matriculasParaProtesto(so, "", hoje)).toEqual([]);
  });
});
