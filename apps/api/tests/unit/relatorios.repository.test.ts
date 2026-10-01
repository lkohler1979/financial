import { describe, expect, it } from "vitest";
import { filtroTipoTitulo } from "../../src/modules/relatorios/relatorios.repository";

describe("filtroTipoTitulo", () => {
  it("não restringe quando AMBOS", () => {
    expect(filtroTipoTitulo("AMBOS")).toBeUndefined();
  });

  it("aceita a forma com acento gravada por tipoTituloDaDescricao/tipotituloNome para RENEGOCIACAO", () => {
    const filtro = filtroTipoTitulo("RENEGOCIACAO");
    expect(filtro?.in).toContain("Renegociação");
  });

  it("aceita também a forma sem acento para RENEGOCIACAO (bug corrigido em 2026-09-17)", () => {
    const filtro = filtroTipoTitulo("RENEGOCIACAO");
    expect(filtro?.in).toContain("Renegociacao");
    expect(filtro?.in).toContain("RENEGOCIACAO");
  });

  it("aceita a forma gravada para MENSALIDADE", () => {
    const filtro = filtroTipoTitulo("MENSALIDADE");
    expect(filtro?.in).toContain("Mensalidade");
  });

  it("usa mode insensitive para não depender de caixa", () => {
    expect(filtroTipoTitulo("MENSALIDADE")?.mode).toBe("insensitive");
    expect(filtroTipoTitulo("RENEGOCIACAO")?.mode).toBe("insensitive");
  });
});
