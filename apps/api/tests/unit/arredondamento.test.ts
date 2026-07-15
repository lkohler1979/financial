import { describe, expect, it } from "vitest";
import { arredondarAbnt } from "../../src/shared/utils/arredondamento";

describe("arredondarAbnt (NBR 5891)", () => {
  it("arredonda para baixo quando o algarismo eliminado é menor que 5", () => {
    expect(arredondarAbnt(2.344)).toBe(2.34);
  });

  it("arredonda para cima quando o algarismo eliminado é maior que 5", () => {
    expect(arredondarAbnt(2.346)).toBe(2.35);
  });

  it("na metade exata (terminando em 5), arredonda para o par mais próximo", () => {
    // 2.345 -> descartando o 5, o algarismo anterior é 4 (par) -> mantém 2.34
    expect(arredondarAbnt(2.345)).toBe(2.34);
    // 2.335 -> descartando o 5, o algarismo anterior é 3 (ímpar) -> sobe para 2.34
    expect(arredondarAbnt(2.335)).toBe(2.34);
  });

  it("na metade exata, arredonda sempre para o algarismo par, mesmo em sequência", () => {
    expect(arredondarAbnt(0.125, 2)).toBe(0.12);
    expect(arredondarAbnt(0.135, 2)).toBe(0.14);
  });

  it("quando há algo além do 5 (não é exatamente a metade), arredonda normalmente para cima", () => {
    expect(arredondarAbnt(2.3451)).toBe(2.35);
  });

  it("funciona com casas decimais diferentes de 2", () => {
    expect(arredondarAbnt(1.25, 1)).toBe(1.2);
    expect(arredondarAbnt(1.35, 1)).toBe(1.4);
  });

  it("não altera valores já exatos", () => {
    expect(arredondarAbnt(10)).toBe(10);
    expect(arredondarAbnt(0)).toBe(0);
  });
});
