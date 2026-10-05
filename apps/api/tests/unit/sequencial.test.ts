import { describe, expect, it, vi } from "vitest";
import { proximoCodigoSequencial } from "../../src/shared/utils/sequencial";

vi.mock("../../src/database/prisma", () => ({ prisma: {} }));

describe("proximoCodigoSequencial", () => {
  it("monta ano + 5 dígitos com zeros à esquerda", async () => {
    const upsert = vi.fn().mockResolvedValue({ valor: 7 });
    const codigo = await proximoCodigoSequencial("ALUNO", new Date(2026, 5, 1), {
      sequencial: { upsert },
    } as never);
    expect(codigo).toBe("202600007");
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { chave: "ALUNO-2026" } }));
  });

  it("reinicia por ano (chave diferente) e usa chave por tipo", async () => {
    const upsert = vi.fn().mockResolvedValue({ valor: 1 });
    const codigo = await proximoCodigoSequencial("MATRICULA", new Date(2027, 0, 2), {
      sequencial: { upsert },
    } as never);
    expect(codigo).toBe("202700001");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { chave: "MATRICULA-2027" } }),
    );
  });
});
