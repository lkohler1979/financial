import { describe, expect, it } from "vitest";
import {
  pillSituacaoMatricula,
  rotuloSituacaoMatricula,
} from "../../../web/src/app/core/models/matricula.model";

describe("pílula da situação da matrícula", () => {
  it("ativa e concluída são verdes; aguardando pagamento é laranja; indeferida e cancelada são vermelhas", () => {
    expect(pillSituacaoMatricula("ATIVA")).toBe("ef-pill ef-pill-ok");
    expect(pillSituacaoMatricula("CONCLUIDA")).toBe("ef-pill ef-pill-ok");
    expect(pillSituacaoMatricula("AGUARDANDO_PAGAMENTO")).toBe("ef-pill ef-pill-warn");
    expect(pillSituacaoMatricula("INDEFERIDA")).toBe("ef-pill ef-pill-bad");
    expect(pillSituacaoMatricula("CANCELADA")).toBe("ef-pill ef-pill-bad");
  });

  it("as demais (trancada, transferência…) ficam neutras", () => {
    expect(pillSituacaoMatricula("TRANCADA")).toBe("ef-pill");
    expect(pillSituacaoMatricula("TRANSFERENCIA")).toBe("ef-pill");
  });

  it("todo código conhecido tem rótulo em português", () => {
    expect(rotuloSituacaoMatricula("AGUARDANDO_PAGAMENTO")).toBe("Aguardando pagamento");
    expect(rotuloSituacaoMatricula("ATIVA")).toBe("Ativa");
    expect(rotuloSituacaoMatricula(null)).toBe("—");
  });
});
