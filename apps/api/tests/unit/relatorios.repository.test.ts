import { describe, expect, it } from "vitest";
import { filtroTipoTitulo } from "../../src/modules/relatorios/relatorios.repository";

describe("filtroTipoTitulo", () => {
  it("não restringe quando AMBOS e nenhum tipo está fora do protesto", () => {
    expect(filtroTipoTitulo("AMBOS")).toBeUndefined();
  });

  it("AMBOS tira os tipos fora do protesto (ex.: Taxa de matrícula) e mantém parcelas sem tipo", () => {
    const filtro = filtroTipoTitulo("AMBOS", ["Taxa de matrícula"]);
    expect(filtro).toEqual({
      OR: [
        { tipoTitulo: null },
        { NOT: { tipoTitulo: { in: ["Taxa de matrícula"], mode: "insensitive" } } },
      ],
    });
  });

  it("aceita a forma com acento gravada por tipoTituloDaDescricao/tipotituloNome para RENEGOCIACAO", () => {
    const filtro = filtroTipoTitulo("RENEGOCIACAO");
    expect(filtro?.tipoTitulo).toMatchObject({ in: expect.arrayContaining(["Renegociação"]) });
  });

  it("aceita também a forma sem acento para RENEGOCIACAO (bug corrigido em 2026-09-17)", () => {
    const filtro = filtroTipoTitulo("RENEGOCIACAO");
    expect(filtro?.tipoTitulo).toMatchObject({
      in: expect.arrayContaining(["Renegociacao", "RENEGOCIACAO"]),
    });
  });

  it("aceita a forma gravada para MENSALIDADE", () => {
    const filtro = filtroTipoTitulo("MENSALIDADE");
    expect(filtro?.tipoTitulo).toMatchObject({ in: expect.arrayContaining(["Mensalidade"]) });
  });

  it("usa mode insensitive para não depender de caixa", () => {
    expect(filtroTipoTitulo("MENSALIDADE")?.tipoTitulo).toMatchObject({ mode: "insensitive" });
    expect(filtroTipoTitulo("RENEGOCIACAO")?.tipoTitulo).toMatchObject({ mode: "insensitive" });
  });
});
