import { beforeEach, describe, expect, it, vi } from "vitest";
import { reconciliarMatricula } from "../../src/modules/sincronizacao-legado/sincronizacao-legado.reconciliador";
import { financeiroRepository } from "../../src/modules/financeiro/financeiro.repository";
import type { LegadoTituloDetalhe } from "../../src/modules/sincronizacao-legado/legado-client";

vi.mock("../../src/modules/financeiro/financeiro.repository", () => ({
  financeiroRepository: { listarTodasPorMatricula: vi.fn(), update: vi.fn() },
}));

const financeiro = vi.mocked(financeiroRepository);

function detalhe(dados: Partial<LegadoTituloDetalhe> = {}): LegadoTituloDetalhe {
  return {
    tituloId: "TIT-1",
    tituloDescricao: "Mensalidade - 1/12",
    tituloParcela: "1",
    tituloEstado: "Aberto",
    tituloValor: 150,
    tituloValorPago: 0,
    tituloDataVencimento: "07/06/2026",
    tituloDataPagamento: null,
    tituloDataBaixa: null,
    diasAtraso: 10,
    ...dados,
  };
}

function parcela(
  dados: Partial<{
    id: string;
    codTitulo: string;
    status: string;
    valorPago: unknown;
    dataPagamento: Date | null;
    tipoTitulo: string | null;
  }> = {},
) {
  return {
    id: "parcela-1",
    codTitulo: "TIT-1",
    status: "EM_ABERTO",
    valorPago: null,
    dataPagamento: null,
    tipoTitulo: "Mensalidade",
    ...dados,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reconciliarMatricula", () => {
  it("atualiza status para PAGO e grava valor/data quando o legado informa pagamento", async () => {
    financeiro.listarTodasPorMatricula.mockResolvedValue([parcela()] as never);
    const buscarInformacoesTitulo = vi
      .fn()
      .mockResolvedValue(detalhe({ tituloDataPagamento: "05/06/2026", tituloValorPago: 150 }));

    const resultado = await reconciliarMatricula("matricula-1", buscarInformacoesTitulo);

    expect(resultado).toEqual({ tituloConsultados: 1, parcelasAtualizadas: 1, naoEncontradosNoLegado: 0 });
    expect(financeiro.update).toHaveBeenCalledWith("parcela-1", {
      status: "PAGO",
      valorPago: 150,
      dataPagamento: new Date(2026, 5, 5),
      statusSincronizacaoLegado: "SINCRONIZADO",
    });
  });

  it("marca statusSincronizacaoLegado sem alterar valor/status quando o legado ainda mostra 'Aberto' e já bate com o Ethos", async () => {
    financeiro.listarTodasPorMatricula.mockResolvedValue([parcela()] as never);
    const buscarInformacoesTitulo = vi.fn().mockResolvedValue(detalhe());

    const resultado = await reconciliarMatricula("matricula-1", buscarInformacoesTitulo);

    expect(resultado.parcelasAtualizadas).toBe(0);
    expect(financeiro.update).toHaveBeenCalledWith("parcela-1", {
      statusSincronizacaoLegado: "SINCRONIZADO",
    });
  });

  it("nunca rebaixa uma parcela já PROTESTADO de volta para EM_ABERTO só porque o legado mostra 'Aberto'", async () => {
    financeiro.listarTodasPorMatricula.mockResolvedValue([parcela({ status: "PROTESTADO" })] as never);
    const buscarInformacoesTitulo = vi.fn().mockResolvedValue(detalhe());

    const resultado = await reconciliarMatricula("matricula-1", buscarInformacoesTitulo);

    expect(resultado.parcelasAtualizadas).toBe(0);
    expect(financeiro.update).toHaveBeenCalledWith("parcela-1", {
      statusSincronizacaoLegado: "SINCRONIZADO",
    });
  });

  it("marca como RENEGOCIADO quando o legado mostra 'Alteracao' (título substituído por renegociação)", async () => {
    financeiro.listarTodasPorMatricula.mockResolvedValue([parcela({ status: "EM_ABERTO" })] as never);
    const buscarInformacoesTitulo = vi.fn().mockResolvedValue(detalhe({ tituloEstado: "Alteracao" }));

    const resultado = await reconciliarMatricula("matricula-1", buscarInformacoesTitulo);

    expect(resultado.parcelasAtualizadas).toBe(1);
    expect(financeiro.update).toHaveBeenCalledWith("parcela-1", {
      status: "RENEGOCIADO",
      valorPago: 0,
      dataPagamento: null,
      statusSincronizacaoLegado: "SINCRONIZADO",
    });
  });

  it("sincroniza tipoTitulo a partir da descrição do legado (Mensalidade/Renegociação)", async () => {
    financeiro.listarTodasPorMatricula.mockResolvedValue([
      parcela({ tipoTitulo: "Mensalidade" }),
    ] as never);
    const buscarInformacoesTitulo = vi
      .fn()
      .mockResolvedValue(detalhe({ tituloDescricao: "Renegociação - 3 / 13" }));

    const resultado = await reconciliarMatricula("matricula-1", buscarInformacoesTitulo);

    expect(resultado.parcelasAtualizadas).toBe(1);
    expect(financeiro.update).toHaveBeenCalledWith("parcela-1", {
      valorPago: 0,
      dataPagamento: null,
      tipoTitulo: "Renegociação",
      statusSincronizacaoLegado: "SINCRONIZADO",
    });
  });

  it("sempre sincroniza valorPago/dataPagamento com o legado, mesmo voltando a zero/null", async () => {
    financeiro.listarTodasPorMatricula.mockResolvedValue([
      parcela({ valorPago: 150, dataPagamento: new Date(2026, 5, 5) }),
    ] as never);
    // Legado deixou de mostrar o pagamento que antes mostrava.
    const buscarInformacoesTitulo = vi.fn().mockResolvedValue(detalhe({ tituloValorPago: 0 }));

    const resultado = await reconciliarMatricula("matricula-1", buscarInformacoesTitulo);

    expect(resultado.parcelasAtualizadas).toBe(1);
    expect(financeiro.update).toHaveBeenCalledWith("parcela-1", {
      valorPago: 0,
      dataPagamento: null,
      statusSincronizacaoLegado: "SINCRONIZADO",
    });
  });

  it("conta como não encontrado no legado quando buscarInformacoesTitulo devolve null", async () => {
    financeiro.listarTodasPorMatricula.mockResolvedValue([parcela()] as never);
    const buscarInformacoesTitulo = vi.fn().mockResolvedValue(null);

    const resultado = await reconciliarMatricula("matricula-1", buscarInformacoesTitulo);

    expect(resultado.naoEncontradosNoLegado).toBe(1);
    expect(resultado.parcelasAtualizadas).toBe(0);
    expect(financeiro.update).not.toHaveBeenCalled();
  });

  it("ignora parcelas sem codTitulo, sem consultar o legado para elas", async () => {
    financeiro.listarTodasPorMatricula.mockResolvedValue([parcela({ codTitulo: "" })] as never);
    const buscarInformacoesTitulo = vi.fn();

    const resultado = await reconciliarMatricula("matricula-1", buscarInformacoesTitulo);

    expect(resultado.tituloConsultados).toBe(0);
    expect(buscarInformacoesTitulo).not.toHaveBeenCalled();
  });

  it("consulta 1 título por parcela quando a matrícula tem várias", async () => {
    financeiro.listarTodasPorMatricula.mockResolvedValue([
      parcela({ id: "parcela-1", codTitulo: "TIT-1" }),
      parcela({ id: "parcela-2", codTitulo: "TIT-2" }),
    ] as never);
    const buscarInformacoesTitulo = vi.fn().mockResolvedValue(detalhe());

    const resultado = await reconciliarMatricula("matricula-1", buscarInformacoesTitulo);

    expect(resultado.tituloConsultados).toBe(2);
    expect(buscarInformacoesTitulo).toHaveBeenCalledWith("TIT-1");
    expect(buscarInformacoesTitulo).toHaveBeenCalledWith("TIT-2");
  });
});
