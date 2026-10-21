import { describe, expect, it } from "vitest";
import {
  calcularSituacaoDocumentacao,
  type DocumentoParaSituacao,
  type TipoParaSituacao,
} from "../../src/modules/documentos/situacao-documentacao";

const M = "mat-1";
const rg: TipoParaSituacao = { id: "rg", escopo: "ALUNO", obrigatorio: true };
const cpf: TipoParaSituacao = { id: "cpf", escopo: "ALUNO", obrigatorio: true };
const contrato: TipoParaSituacao = { id: "contrato", escopo: "MATRICULA", obrigatorio: true };
const foto: TipoParaSituacao = { id: "foto", escopo: "ALUNO", obrigatorio: false };

function doc(
  tipoDocumentoId: string,
  deferimento: DocumentoParaSituacao["situacaoDeferimento"],
  extra: Partial<DocumentoParaSituacao> = {},
): DocumentoParaSituacao {
  return {
    tipoDocumentoId,
    matriculaId: null,
    situacaoEntrega: "ENVIADO",
    situacaoDeferimento: deferimento,
    ...extra,
  };
}

describe("calcularSituacaoDocumentacao", () => {
  it("sem nenhum documento enviado: sem documentos", () => {
    expect(calcularSituacaoDocumentacao(M, [rg, cpf], [])).toBe("SEM_DOCUMENTOS");
    expect(
      calcularSituacaoDocumentacao(
        M,
        [rg],
        [doc("rg", "PENDENTE", { situacaoEntrega: "NAO_ENVIADO" })],
      ),
    ).toBe("SEM_DOCUMENTOS");
  });

  it("falta algum obrigatório: documentos pendentes", () => {
    expect(calcularSituacaoDocumentacao(M, [rg, cpf], [doc("rg", "DEFERIDO")])).toBe(
      "DOCUMENTOS_PENDENTES",
    );
  });

  it("enviado mas ainda não conferido conta como pendente", () => {
    expect(calcularSituacaoDocumentacao(M, [rg], [doc("rg", "PENDENTE")])).toBe(
      "DOCUMENTOS_PENDENTES",
    );
  });

  it("qualquer documento indeferido: documentos pendentes, mesmo opcional", () => {
    expect(
      calcularSituacaoDocumentacao(
        M,
        [rg, foto],
        [doc("rg", "DEFERIDO"), doc("foto", "INDEFERIDO")],
      ),
    ).toBe("DOCUMENTOS_PENDENTES");
    expect(calcularSituacaoDocumentacao(M, [rg], [doc("rg", "INDEFERIDO")])).toBe(
      "DOCUMENTOS_PENDENTES",
    );
  });

  it("todos os obrigatórios deferidos: documentação completa (opcionais não pesam)", () => {
    expect(
      calcularSituacaoDocumentacao(
        M,
        [rg, cpf, foto],
        [doc("rg", "DEFERIDO"), doc("cpf", "DEFERIDO")],
      ),
    ).toBe("DOCUMENTACAO_COMPLETA");
  });

  it("opcional pendente de conferência não impede a documentação completa", () => {
    expect(
      calcularSituacaoDocumentacao(M, [rg, foto], [doc("rg", "DEFERIDO"), doc("foto", "PENDENTE")]),
    ).toBe("DOCUMENTACAO_COMPLETA");
  });

  it("documento de matrícula só vale para a própria matrícula; o do aluno vale para todas", () => {
    const docs = [doc("rg", "DEFERIDO"), doc("contrato", "DEFERIDO", { matriculaId: "mat-1" })];
    expect(calcularSituacaoDocumentacao("mat-1", [rg, contrato], docs)).toBe(
      "DOCUMENTACAO_COMPLETA",
    );
    expect(calcularSituacaoDocumentacao("mat-2", [rg, contrato], docs)).toBe(
      "DOCUMENTOS_PENDENTES",
    );
  });

  it("documentos de tipo inativo (fora da lista de tipos) não contam", () => {
    expect(calcularSituacaoDocumentacao(M, [rg], [doc("antigo", "DEFERIDO")])).toBe(
      "SEM_DOCUMENTOS",
    );
  });

  it("sem tipos obrigatórios, com documento enviado e deferido: completa", () => {
    expect(calcularSituacaoDocumentacao(M, [foto], [doc("foto", "DEFERIDO")])).toBe(
      "DOCUMENTACAO_COMPLETA",
    );
  });
});
