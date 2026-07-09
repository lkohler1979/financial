import { beforeEach, describe, expect, it, vi } from "vitest";
import { processarLinhasImportacao } from "../../src/modules/importacao/importacao.processor";
import { alunosRepository } from "../../src/modules/alunos/alunos.repository";
import { cursosRepository } from "../../src/modules/cursos/cursos.repository";
import { matriculasRepository } from "../../src/modules/matriculas/matriculas.repository";
import { financeiroRepository } from "../../src/modules/financeiro/financeiro.repository";
import { mapeamentoImportacaoRepository } from "../../src/modules/mapeamento-importacao/mapeamento-importacao.repository";
import { MAPEAMENTOS_PADRAO } from "../../src/modules/mapeamento-importacao/mapeamento-importacao.constants";
import type { LinhaImportacaoValida } from "../../src/modules/importacao/importacao.parser";

vi.mock("../../src/modules/alunos/alunos.repository", () => ({
  alunosRepository: { findByCpf: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock("../../src/modules/cursos/cursos.repository", () => ({
  cursosRepository: { findByNome: vi.fn(), findByCodigo: vi.fn(), create: vi.fn() },
}));
vi.mock("../../src/modules/matriculas/matriculas.repository", () => ({
  matriculasRepository: { findByAlunoECurso: vi.fn(), create: vi.fn() },
}));
vi.mock("../../src/modules/financeiro/financeiro.repository", () => ({
  financeiroRepository: { findByChaveNatural: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock("../../src/modules/mapeamento-importacao/mapeamento-importacao.repository", () => ({
  mapeamentoImportacaoRepository: { listarAtivos: vi.fn() },
}));

const alunos = vi.mocked(alunosRepository);
const cursos = vi.mocked(cursosRepository);
const matriculas = vi.mocked(matriculasRepository);
const financeiro = vi.mocked(financeiroRepository);
const mapeamentos = vi.mocked(mapeamentoImportacaoRepository);

function linha(dados: Partial<Record<string, unknown>>, numeroLinha = 2): LinhaImportacaoValida {
  return {
    linha: numeroLinha,
    dados: {
      CNPJ_CPF: "39053344705",
      NOME: "Maria Silva",
      COD_TITULO: "TIT-1",
      PARCELA: "1/3",
      DT_VENCIMENTO: "10/08/2026",
      VALOR: "150,00",
      CURSO: "Engenharia",
      ...dados,
    } as never,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mapeamentos.listarAtivos.mockResolvedValue(MAPEAMENTOS_PADRAO as never);
});

describe("processarLinhasImportacao", () => {
  it("cria aluno, curso, matrícula e parcela quando nada existe ainda", async () => {
    alunos.findByCpf.mockResolvedValue(null);
    alunos.create.mockResolvedValue({ id: "aluno-1" } as never);
    cursos.findByNome.mockResolvedValue(null);
    cursos.create.mockResolvedValue({ id: "curso-1" } as never);
    matriculas.findByAlunoECurso.mockResolvedValue(null);
    matriculas.create.mockResolvedValue({ id: "matricula-1" } as never);
    financeiro.findByChaveNatural.mockResolvedValue(null);
    financeiro.create.mockResolvedValue({ id: "parcela-1" } as never);

    const resultado = await processarLinhasImportacao([linha({})]);

    expect(resultado.novosAlunos).toBe(1);
    expect(resultado.alunosAtualizados).toBe(0);
    expect(resultado.parcelasNovas).toBe(1);
    expect(resultado.erros).toHaveLength(0);
    expect(alunos.create).toHaveBeenCalledOnce();
    expect(cursos.create).toHaveBeenCalledOnce();
    expect(matriculas.create).toHaveBeenCalledOnce();
    expect(financeiro.create).toHaveBeenCalledOnce();
  });

  it("reutiliza aluno, curso e matrícula existentes e atualiza a parcela existente", async () => {
    alunos.findByCpf.mockResolvedValue({ id: "aluno-1" } as never);
    alunos.update.mockResolvedValue({ id: "aluno-1" } as never);
    cursos.findByNome.mockResolvedValue({ id: "curso-1" } as never);
    matriculas.findByAlunoECurso.mockResolvedValue({ id: "matricula-1" } as never);
    financeiro.findByChaveNatural.mockResolvedValue({ id: "parcela-1" } as never);
    financeiro.update.mockResolvedValue({ id: "parcela-1" } as never);

    const resultado = await processarLinhasImportacao([linha({})]);

    expect(resultado.novosAlunos).toBe(0);
    expect(resultado.alunosAtualizados).toBe(1);
    expect(resultado.parcelasAtualizadas).toBe(1);
    expect(cursos.create).not.toHaveBeenCalled();
    expect(matriculas.create).not.toHaveBeenCalled();
    expect(financeiro.create).not.toHaveBeenCalled();
  });

  it("mapeia endereço detalhado e os dois telefones da planilha para o aluno", async () => {
    alunos.findByCpf.mockResolvedValue(null);
    alunos.create.mockResolvedValue({ id: "aluno-1" } as never);
    cursos.findByNome.mockResolvedValue({ id: "curso-1" } as never);
    matriculas.findByAlunoECurso.mockResolvedValue({ id: "matricula-1" } as never);
    financeiro.findByChaveNatural.mockResolvedValue(null);
    financeiro.create.mockResolvedValue({ id: "parcela-1" } as never);

    await processarLinhasImportacao([
      linha({
        ENDERECO: "Rua das Flores",
        NUMERO: "123",
        BAIRRO: "Centro",
        COMPLEMENTO: "Apto 45",
        CEP: "01310-100",
        CIDADE: "São Paulo",
        ESTADO: "SP",
        FONE_1: "11999998888",
        FONE_2: "1133334444",
      }),
    ]);

    expect(alunos.create).toHaveBeenCalledWith(
      expect.objectContaining({
        endereco: "Rua das Flores",
        numero: "123",
        bairro: "Centro",
        complemento: "Apto 45",
        cep: "01310-100",
        cidade: "São Paulo",
        estado: "SP",
        telefone1: "11999998888",
        telefone2: "1133334444",
      }),
    );
  });

  it("registra erro de linha e continua processando as demais quando o CPF é inválido", async () => {
    alunos.findByCpf.mockResolvedValue(null);
    alunos.create.mockResolvedValue({ id: "aluno-2" } as never);
    cursos.findByNome.mockResolvedValue({ id: "curso-1" } as never);
    matriculas.findByAlunoECurso.mockResolvedValue({ id: "matricula-1" } as never);
    financeiro.findByChaveNatural.mockResolvedValue(null);
    financeiro.create.mockResolvedValue({ id: "parcela-2" } as never);

    const linhaInvalida = linha({ CNPJ_CPF: "11111111111" }, 2);
    const linhaOk = linha({ CNPJ_CPF: "39053344705" }, 3);

    const resultado = await processarLinhasImportacao([linhaInvalida, linhaOk]);

    expect(resultado.erros).toHaveLength(1);
    expect(resultado.erros[0].linha).toBe(2);
    expect(resultado.parcelasNovas).toBe(1);
  });

  it("reporta erro de linha quando a data de vencimento é inválida, sem interromper o lote", async () => {
    alunos.findByCpf.mockResolvedValue({ id: "aluno-1" } as never);
    alunos.update.mockResolvedValue({ id: "aluno-1" } as never);
    cursos.findByNome.mockResolvedValue({ id: "curso-1" } as never);
    matriculas.findByAlunoECurso.mockResolvedValue({ id: "matricula-1" } as never);

    const resultado = await processarLinhasImportacao([linha({ DT_VENCIMENTO: "não é uma data" })]);

    expect(resultado.erros).toHaveLength(1);
    expect(financeiro.create).not.toHaveBeenCalled();
  });

  it("chama o callback de progresso após cada linha", async () => {
    alunos.findByCpf.mockResolvedValue({ id: "aluno-1" } as never);
    alunos.update.mockResolvedValue({ id: "aluno-1" } as never);
    cursos.findByNome.mockResolvedValue({ id: "curso-1" } as never);
    matriculas.findByAlunoECurso.mockResolvedValue({ id: "matricula-1" } as never);
    financeiro.findByChaveNatural.mockResolvedValue({ id: "parcela-1" } as never);
    financeiro.update.mockResolvedValue({ id: "parcela-1" } as never);

    const aoProgredir = vi.fn();
    await processarLinhasImportacao([linha({}, 2), linha({}, 3)], aoProgredir);

    expect(aoProgredir).toHaveBeenNthCalledWith(1, 50);
    expect(aoProgredir).toHaveBeenNthCalledWith(2, 100);
  });

  describe("ID_CURSO (planilha real, 2026-07-09)", () => {
    it("localiza o curso pelo ID_CURSO (codigo) em vez de pelo nome, quando presente", async () => {
      alunos.findByCpf.mockResolvedValue({ id: "aluno-1" } as never);
      alunos.update.mockResolvedValue({ id: "aluno-1" } as never);
      cursos.findByCodigo.mockResolvedValue({ id: "curso-1" } as never);
      matriculas.findByAlunoECurso.mockResolvedValue({ id: "matricula-1" } as never);
      financeiro.findByChaveNatural.mockResolvedValue(null);
      financeiro.create.mockResolvedValue({ id: "parcela-1" } as never);

      await processarLinhasImportacao([linha({ ID_CURSO: "CURSO-EXTERNO-42" })]);

      expect(cursos.findByCodigo).toHaveBeenCalledWith("CURSO-EXTERNO-42");
      expect(cursos.findByNome).not.toHaveBeenCalled();
      expect(cursos.create).not.toHaveBeenCalled();
    });

    it("cria o curso usando ID_CURSO como codigo quando não encontra por codigo nem por nome", async () => {
      alunos.findByCpf.mockResolvedValue({ id: "aluno-1" } as never);
      alunos.update.mockResolvedValue({ id: "aluno-1" } as never);
      cursos.findByCodigo.mockResolvedValue(null);
      cursos.findByNome.mockResolvedValue(null);
      cursos.create.mockResolvedValue({ id: "curso-novo" } as never);
      matriculas.findByAlunoECurso.mockResolvedValue({ id: "matricula-1" } as never);
      financeiro.findByChaveNatural.mockResolvedValue(null);
      financeiro.create.mockResolvedValue({ id: "parcela-1" } as never);

      await processarLinhasImportacao([linha({ ID_CURSO: "CURSO-EXTERNO-99" })]);

      expect(cursos.create).toHaveBeenCalledWith(
        expect.objectContaining({ codigo: "CURSO-EXTERNO-99" }),
      );
    });

    it("cai para a busca por nome quando a linha não traz ID_CURSO", async () => {
      alunos.findByCpf.mockResolvedValue({ id: "aluno-1" } as never);
      alunos.update.mockResolvedValue({ id: "aluno-1" } as never);
      cursos.findByNome.mockResolvedValue({ id: "curso-1" } as never);
      matriculas.findByAlunoECurso.mockResolvedValue({ id: "matricula-1" } as never);
      financeiro.findByChaveNatural.mockResolvedValue(null);
      financeiro.create.mockResolvedValue({ id: "parcela-1" } as never);

      await processarLinhasImportacao([linha({})]);

      expect(cursos.findByCodigo).not.toHaveBeenCalled();
      expect(cursos.findByNome).toHaveBeenCalledWith("Engenharia");
    });
  });

  describe("TITULO_VALOR_JUROS_E_MULTA (planilha real, 2026-07-09)", () => {
    it("mapeia para Parcela.valorOrigemComJurosEMulta, só como referência", async () => {
      alunos.findByCpf.mockResolvedValue({ id: "aluno-1" } as never);
      alunos.update.mockResolvedValue({ id: "aluno-1" } as never);
      cursos.findByNome.mockResolvedValue({ id: "curso-1" } as never);
      matriculas.findByAlunoECurso.mockResolvedValue({ id: "matricula-1" } as never);
      financeiro.findByChaveNatural.mockResolvedValue(null);
      financeiro.create.mockResolvedValue({ id: "parcela-1" } as never);

      await processarLinhasImportacao([linha({ TITULO_VALOR_JUROS_E_MULTA: "160,50" })]);

      expect(financeiro.create).toHaveBeenCalledWith(
        expect.objectContaining({ valorOrigemComJurosEMulta: 160.5 }),
      );
    });

    it("não grava o campo quando a coluna vem vazia (NAO_IMPORTAR)", async () => {
      alunos.findByCpf.mockResolvedValue({ id: "aluno-1" } as never);
      alunos.update.mockResolvedValue({ id: "aluno-1" } as never);
      cursos.findByNome.mockResolvedValue({ id: "curso-1" } as never);
      matriculas.findByAlunoECurso.mockResolvedValue({ id: "matricula-1" } as never);
      financeiro.findByChaveNatural.mockResolvedValue(null);
      financeiro.create.mockResolvedValue({ id: "parcela-1" } as never);

      await processarLinhasImportacao([linha({})]);

      const dadosCriados = financeiro.create.mock.calls[0][0] as Record<string, unknown>;
      expect(dadosCriados.valorOrigemComJurosEMulta).toBeUndefined();
    });
  });
});
