import { describe, expect, it } from "vitest";
import { nomesNoZip, type DocumentoParaLote } from "../../src/modules/documentos/documentos-lote";
import { downloadLoteSchema } from "../../src/modules/documentos/documentos.schema";

function doc(id: string, extra: Partial<DocumentoParaLote> = {}): DocumentoParaLote {
  return {
    id,
    arquivoNome: "rg.pdf",
    arquivoChave: "x",
    tipo: { nome: "RG" },
    aluno: { nome: "Maria da Silva", codigo: "202600001" },
    matricula: { numeroMatricula: "202600027" },
    ...extra,
  };
}

describe("nomesNoZip", () => {
  it("organiza por aluno e matrícula; documento de aluno fica na pasta do aluno", () => {
    const nomes = nomesNoZip([doc("1"), doc("2", { matricula: null, tipo: { nome: "CPF" } })]);
    expect(nomes.get("1")).toBe("202600001 - Maria da Silva/Matrícula 202600027/RG - rg.pdf");
    expect(nomes.get("2")).toBe("202600001 - Maria da Silva/CPF - rg.pdf");
  });

  it("evita nomes repetidos", () => {
    const nomes = nomesNoZip([doc("1"), doc("2"), doc("3")]);
    expect(new Set(nomes.values()).size).toBe(3);
    expect(nomes.get("2")).toContain("(2).pdf");
    expect(nomes.get("3")).toContain("(3).pdf");
  });

  it("remove caracteres que o sistema de arquivos não aceita", () => {
    const nomes = nomesNoZip([
      doc("1", { aluno: { nome: 'Zé: "O/Barra"?', codigo: null }, arquivoNome: "a*b.png" }),
    ]);
    expect(nomes.get("1")).toBe("Zé O Barra/Matrícula 202600027/RG - a b.png");
  });
});

describe("downloadLoteSchema", () => {
  const uuid = "5f0f3e6e-8f6e-4f0e-9b0e-2f0c7b2a1d11";

  it("aceita ids ou filtros, mas exige um dos dois", () => {
    expect(downloadLoteSchema.safeParse({ ids: [uuid] }).success).toBe(true);
    expect(downloadLoteSchema.safeParse({ filtros: { situacao: "DEFERIDO" } }).success).toBe(true);
    expect(downloadLoteSchema.safeParse({}).success).toBe(false);
    expect(downloadLoteSchema.safeParse({ ids: [] }).success).toBe(false);
  });

  it("valida datas e ids", () => {
    expect(downloadLoteSchema.safeParse({ filtros: { de: "21/10/2026" } }).success).toBe(false);
    expect(downloadLoteSchema.safeParse({ ids: ["abc"] }).success).toBe(false);
  });
});
