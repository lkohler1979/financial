import { describe, expect, it } from "vitest";
import { gerarDocumentoProtesto } from "../../src/modules/relatorios/documento-protesto.generator";

describe("gerarDocumentoProtesto", () => {
  it("gera um buffer .docx válido (assinatura de arquivo ZIP, formato do OOXML)", async () => {
    const buffer = await gerarDocumentoProtesto({
      alunoNome: "Maria Silva",
      alunoCpf: "39053344705",
      cursoNome: "Ethos Digital/Engenharia",
      parcelas: [
        { vencimento: new Date("2026-05-10"), valorBruto: 100, diasAtraso: 30 },
        { vencimento: new Date("2026-06-10"), valorBruto: 100, diasAtraso: 10 },
      ],
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    // Arquivos .docx são ZIPs (assinatura "PK").
    expect(buffer.subarray(0, 2).toString("ascii")).toBe("PK");
    expect(buffer.length).toBeGreaterThan(0);
  });
});
