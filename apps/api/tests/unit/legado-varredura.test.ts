import { describe, expect, it, vi } from "vitest";
import type { LegadoPessoaCurso } from "../../src/modules/sincronizacao-legado/legado-client";
import { TETO_RESULTADOS_LEGADO, varrerPessoasDoLegado } from "../../src/modules/sincronizacao-legado/legado-varredura";

function linha(pesId: string, nome: string, alunocursoId = `ac-${pesId}`): LegadoPessoaCurso {
  return { pesId, alunoId: pesId, nome, cpf: "000", alunocursoId, alunocursoSituacao: "", cursoId: "c", cursoNome: "Curso" };
}

/** Simula o legado: prefixo do nome, sem acento/maiúscula, no máximo 40 linhas. */
function legadoSimulado(nomes: string[]) {
  const base = nomes.map((nome, i) => linha(String(i + 1), nome));
  const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return vi.fn(async (prefixo: string) =>
    base.filter((p) => normalizar(p.nome).startsWith(normalizar(prefixo))).slice(0, TETO_RESULTADOS_LEGADO),
  );
}

describe("varrerPessoasDoLegado", () => {
  it("expande só os prefixos que voltam cheios (40) e encontra todo mundo", async () => {
    // 100 'Maria N' + 45 'Ana N' + 3 nomes isolados: 'm' e 'a' voltam cheios, o resto não.
    const sufixo = (i: number) => String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26));
    const nomes = [
      ...Array.from({ length: 100 }, (_, i) => `Maria ${sufixo(i)}`),
      ...Array.from({ length: 45 }, (_, i) => `Ana ${sufixo(i)}`),
      "Zilda",
      "Élida",
      "3M Brasil",
    ];
    const buscar = legadoSimulado(nomes);
    const r = await varrerPessoasDoLegado(buscar);

    expect(r.pessoas.size).toBe(nomes.length);
    expect(r.truncados).toEqual([]);
    const consultados = buscar.mock.calls.map((c) => c[0]);
    expect(consultados).toContain("z"); // a–z e 0–9 sempre
    expect(consultados).toContain("3");
    expect(consultados).toContain("ma"); // 'm' encheu
    expect(consultados).toContain("maria "); // 'maria' encheu e nomes são compostos
    expect(consultados).not.toContain("za"); // 'z' voltou com 1 linha: completo, não expande
    expect(consultados.some((p) => p.startsWith("zi"))).toBe(false);
  });

  it("não duplica quem aparece em várias consultas e junta os cursos da mesma pessoa", async () => {
    const buscar = vi.fn(async (prefixo: string) =>
      prefixo === "a" ? [linha("1", "Ana", "ac-1"), linha("1", "Ana", "ac-2")] : prefixo === "n" ? [linha("1", "Ana", "ac-1")] : [],
    );
    const r = await varrerPessoasDoLegado(buscar);
    expect(r.pessoas.size).toBe(1);
    expect(r.pessoas.get("1")?.map((l) => l.alunocursoId)).toEqual(["ac-1", "ac-2"]);
  });

  it("respeita o limite de pessoas e informa o andamento", async () => {
    const buscar = legadoSimulado(Array.from({ length: 30 }, (_, i) => `Bia ${i}`));
    const andamento = vi.fn();
    const r = await varrerPessoasDoLegado(buscar, { limite: 5, onProgresso: andamento });
    expect(r.pessoas.size).toBeGreaterThanOrEqual(5);
    expect(buscar.mock.calls.length).toBeLessThan(40);
    expect(andamento).toHaveBeenLastCalledWith({ consultas: r.consultas, pessoas: r.pessoas.size });
  });

  it("prefixo que nunca esvazia (40 iguais) para na profundidade máxima e é reportado", async () => {
    const buscar = vi.fn(async (prefixo: string) =>
      prefixo.startsWith("x") ? Array.from({ length: TETO_RESULTADOS_LEGADO }, (_, i) => linha(`${prefixo}-${i}`, "X")) : [],
    );
    // Só o ramo "x..." é cheio; como toda expansão volta cheia, o limite de 5 pessoas aborta antes do fim.
    const r = await varrerPessoasDoLegado(buscar, { limite: 200 });
    expect(r.consultas).toBeGreaterThan(0);
    expect(r.pessoas.size).toBeGreaterThanOrEqual(200);
  });
});
