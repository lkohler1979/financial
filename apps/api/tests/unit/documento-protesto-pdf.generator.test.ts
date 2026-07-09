import { describe, expect, it } from "vitest";
import { gerarDocumentoProtestoPdf } from "../../src/modules/relatorios/documento-protesto-pdf.generator";

describe("gerarDocumentoProtestoPdf", () => {
  it("gera um buffer .pdf válido (assinatura %PDF)", async () => {
    const buffer = await gerarDocumentoProtestoPdf({
      alunoNome: "Maria Silva",
      alunoCpf: "39053344705",
      cursoNome: "Ethos Digital/Engenharia",
      parcelas: [
        { vencimento: new Date("2026-05-10"), valorBruto: 100, multa: 2, juros: 1, total: 103 },
        { vencimento: new Date("2026-06-10"), valorBruto: 100, multa: 2, juros: 0.5, total: 102.5 },
      ],
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("embute a fonte (arquivo autocontido, sem depender de fontes do sistema)", async () => {
    const buffer = await gerarDocumentoProtestoPdf({
      alunoNome: "José Ávila",
      alunoCpf: "39053344705",
      cursoNome: "São José",
      parcelas: [
        { vencimento: new Date("2026-05-10"), valorBruto: 100, multa: 2, juros: 1, total: 103 },
      ],
    });

    // FontFile2 é o marcador de fonte TrueType embutida no PDF (ver
    // ISO 32000-1 §9.9) — confirma que não estamos usando as fontes
    // "padrão" do visualizador (Times-Roman etc.), que dependeriam do que
    // estiver instalado no ambiente de quem abre o arquivo.
    expect(buffer.toString("latin1")).toContain("FontFile2");
  });
});
