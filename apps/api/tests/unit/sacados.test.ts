import { beforeEach, describe, expect, it, vi } from "vitest";
import { validarCnpj } from "../../src/shared/utils/cpf";
import { sacadoDadosSchema } from "../../src/modules/sacados/sacados.schema";
import { sacadosService } from "../../src/modules/sacados/sacados.service";
import { sacadosRepository } from "../../src/modules/sacados/sacados.repository";
import { ValidationError } from "../../src/shared/errors/app-error";

vi.mock("../../src/modules/sacados/sacados.repository", () => ({
  sacadosRepository: { findById: vi.fn(), findByCpfCnpj: vi.fn(), buscar: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock("../../src/modules/auditoria/auditoria.service", () => ({ registrarAuditoria: vi.fn() }));

const repo = vi.mocked(sacadosRepository);
beforeEach(() => vi.clearAllMocks());

describe("validarCnpj", () => {
  it("aceita CNPJ válido (com e sem máscara) e recusa inválidos", () => {
    expect(validarCnpj("11.222.333/0001-81")).toBe(true);
    expect(validarCnpj("11222333000181")).toBe(true);
    expect(validarCnpj("11222333000182")).toBe(false);
    expect(validarCnpj("00000000000000")).toBe(false);
    expect(validarCnpj("123")).toBe(false);
  });
});

describe("sacadoDadosSchema", () => {
  it("valida CPF para pessoa física e CNPJ para jurídica, e normaliza o documento", () => {
    expect(sacadoDadosSchema.parse({ tipoPessoa: "FISICA", cpfCnpj: "529.982.247-25", nome: "Mãe" }).cpfCnpj).toBe("52998224725");
    expect(sacadoDadosSchema.parse({ tipoPessoa: "JURIDICA", cpfCnpj: "11.222.333/0001-81", nome: "Empresa" }).cpfCnpj).toBe("11222333000181");
    expect(sacadoDadosSchema.safeParse({ tipoPessoa: "JURIDICA", cpfCnpj: "52998224725", nome: "X" }).success).toBe(false);
    expect(sacadoDadosSchema.safeParse({ tipoPessoa: "FISICA", cpfCnpj: "11222333000181", nome: "X" }).success).toBe(false);
  });
});

describe("sacadosService.obterOuCriar", () => {
  const dados = sacadoDadosSchema.parse({ tipoPessoa: "JURIDICA", cpfCnpj: "11222333000181", nome: "Empresa", email: "", telefone: "" });

  it("reaproveita o sacado existente sem sobrescrever", async () => {
    repo.findByCpfCnpj.mockResolvedValue({ id: "s1", tipoPessoa: "JURIDICA" } as never);
    const r = await sacadosService.obterOuCriar(dados, "u");
    expect(r.id).toBe("s1");
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("cria quando não existe; e-mail/telefone vazios viram nulo; PJ não guarda nascimento", async () => {
    repo.findByCpfCnpj.mockResolvedValue(null);
    repo.create.mockResolvedValue({ id: "s2", cpfCnpj: "11222333000181", tipoPessoa: "JURIDICA" } as never);
    await sacadosService.obterOuCriar(dados, "u");
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ email: null, telefone: null, dataNascimento: null }));
  });

  it("recusa documento já usado por outro tipo de pessoa", async () => {
    repo.findByCpfCnpj.mockResolvedValue({ id: "s1", tipoPessoa: "FISICA" } as never);
    await expect(sacadosService.obterOuCriar(dados, "u")).rejects.toBeInstanceOf(ValidationError);
  });
});
