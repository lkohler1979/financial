import { describe, expect, it } from "vitest";
import { formatarCpf, normalizarCpf, validarCpf } from "../../src/shared/utils/cpf";

describe("validarCpf", () => {
  it("aceita CPFs válidos (com e sem máscara)", () => {
    expect(validarCpf("390.533.447-05")).toBe(true);
    expect(validarCpf("39053344705")).toBe(true);
  });

  it("rejeita dígitos verificadores incorretos", () => {
    expect(validarCpf("39053344700")).toBe(false);
  });

  it("rejeita sequências repetidas e tamanhos inválidos", () => {
    expect(validarCpf("11111111111")).toBe(false);
    expect(validarCpf("123")).toBe(false);
    expect(validarCpf("")).toBe(false);
  });
});

describe("normalizarCpf / formatarCpf", () => {
  it("remove máscara e reaplica corretamente", () => {
    expect(normalizarCpf("390.533.447-05")).toBe("39053344705");
    expect(formatarCpf("39053344705")).toBe("390.533.447-05");
  });
});
