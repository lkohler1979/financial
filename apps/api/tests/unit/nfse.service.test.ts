import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  avisosDaNota,
  competenciaDoMes,
  limitesDoMes,
  mesAnterior,
  nfseService,
  tomadorDe,
  valorDaNota,
} from "../../src/modules/nfse/nfse.service";
import { nfseRepository } from "../../src/modules/nfse/nfse.repository";
import { configuracoesRepository } from "../../src/modules/configuracoes/configuracoes.repository";
import { asaasService } from "../../src/modules/asaas/asaas.service";

vi.mock("../../src/modules/nfse/nfse.repository", () => ({
  nfseRepository: {
    listarPendentes: vi.fn(),
    contarPendentes: vi.fn(),
    listarNotasDaCompetencia: vi.fn(),
    listarAgendadas: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock("../../src/modules/configuracoes/configuracoes.repository", () => ({
  configuracoesRepository: { obterOuCriar: vi.fn() },
}));
vi.mock("../../src/modules/asaas/asaas.service", () => ({
  asaasService: { obterOuCriarClienteAluno: vi.fn(), obterOuCriarClienteSacado: vi.fn() },
  obterClienteAsaas: vi.fn(),
}));
vi.mock("../../src/modules/auditoria/auditoria.service", () => ({ registrarAuditoria: vi.fn() }));

const repo = vi.mocked(nfseRepository);
const config = vi.mocked(configuracoesRepository);
const asaas = vi.mocked(asaasService);

const CONFIG = {
  nfseAtiva: true,
  nfseDiaLimite: 10,
  nfseServicoCodigo: "08.01.01",
  nfseServicoNome: "Ensino regular pré-escolar, fundamental e médio.",
  nfseServicoDescricao: "PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS",
  nfseMunicipalServiceId: null,
  nfseIssPercentual: "0",
};

const aluno = { id: "a1", nome: "Anderson Sousa", cpf: "52998224725", email: "a@x.com", cep: "58200062", endereco: "Rua X", numero: "172", complemento: null, bairro: "Centro" };
const sacadoPj = { id: "s1", tipoPessoa: "JURIDICA", nome: "Empresa Ltda", cpfCnpj: "11222333000181", email: null, cep: "29056922", endereco: "Av Y", numero: "595", complemento: null, bairro: "Santa Lúcia" };

function parcela(extra: Record<string, unknown> = {}, sacado: unknown = null) {
  return {
    id: "p1",
    parcela: "3/12",
    tipoTitulo: "Mensalidade",
    valor: "251.49",
    valorPago: "251.49",
    dataPagamento: new Date(2026, 6, 15),
    nfseAsaasId: null,
    nfseStatus: null,
    nfseErro: null,
    matricula: { id: "m1", numeroMatricula: "202600001", curso: { nome: "MBA em Dados" }, aluno, sacado },
    ...extra,
  } as never;
}

const cliente = {
  agendarNota: vi.fn(),
  emitirNota: vi.fn(),
  consultarNota: vi.fn(),
  atualizarCliente: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  cliente.agendarNota.mockReset();
  cliente.emitirNota.mockReset();
  cliente.consultarNota.mockReset();
  cliente.atualizarCliente.mockReset().mockResolvedValue({});
  repo.update.mockReset();
  config.obterOuCriar.mockResolvedValue(CONFIG as never);
  asaas.obterOuCriarClienteAluno.mockResolvedValue("cus_aluno");
  asaas.obterOuCriarClienteSacado.mockResolvedValue("cus_sacado");
  repo.contarPendentes.mockResolvedValue(1);
});

describe("datas da competência", () => {
  it("mês anterior, inclusive virada de ano", () => {
    expect(mesAnterior(new Date(2026, 7, 11))).toEqual({ ano: 2026, mes: 7 });
    expect(mesAnterior(new Date(2026, 0, 5))).toEqual({ ano: 2025, mes: 12 });
  });

  it("competência = último dia do mês (inclusive fevereiro e bissexto)", () => {
    expect(competenciaDoMes({ ano: 2026, mes: 7 })).toBe("2026-07-31");
    expect(competenciaDoMes({ ano: 2026, mes: 2 })).toBe("2026-02-28");
    expect(competenciaDoMes({ ano: 2028, mes: 2 })).toBe("2028-02-29");
  });

  it("limites do mês: início inclusivo e fim exclusivo (1º do mês seguinte)", () => {
    const { inicio, fim } = limitesDoMes({ ano: 2026, mes: 12 });
    expect(inicio).toEqual(new Date(2026, 11, 1));
    expect(fim).toEqual(new Date(2027, 0, 1));
  });
});

describe("tomador e valor", () => {
  it("sacado quando houver; senão o aluno", () => {
    expect(tomadorDe(parcela({}, sacadoPj))).toMatchObject({ origem: "SACADO", documento: "11222333000181", nome: "Empresa Ltda" });
    expect(tomadorDe(parcela())).toMatchObject({ origem: "ALUNO", documento: "52998224725" });
  });

  it("valor da nota é o efetivamente pago (com juros/multa), senão o valor da parcela", () => {
    expect(valorDaNota(parcela({ valorPago: "260.10" }))).toBe(260.1);
    expect(valorDaNota(parcela({ valorPago: null }))).toBe(251.49);
  });

  it("erro sem CPF/CNPJ válido ou valor; aviso sem CEP", () => {
    const semDoc = parcela();
    (semDoc as any).matricula.aluno = { ...aluno, cpf: "123" };
    expect(avisosDaNota(semDoc).erros).toContain("Tomador sem CPF/CNPJ válido");
    const semCep = parcela();
    (semCep as any).matricula.aluno = { ...aluno, cep: null };
    expect(avisosDaNota(semCep)).toMatchObject({ erros: [], avisos: [expect.stringContaining("CEP")] });
    expect(avisosDaNota(parcela({ valorPago: "0", valor: "0" })).erros).toContain("Valor da nota inválido");
  });
});

describe("nfseService.emitirPendentes", () => {
  const ref = { ano: 2026, mes: 7 };

  it("agenda e emite uma nota por parcela com os dados do exemplo (competência, serviço, sem retenções)", async () => {
    repo.listarPendentes.mockResolvedValue([parcela()]);
    cliente.agendarNota.mockResolvedValue({ id: "inv_1", status: "SCHEDULED" });
    cliente.emitirNota.mockResolvedValue({ id: "inv_1", status: "AUTHORIZED", number: "785", pdfUrl: "http://pdf" });

    const r = await nfseService.emitirPendentes(ref, "u1", { cliente: cliente as never });

    expect(cliente.agendarNota).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_aluno",
        value: 251.49,
        effectiveDate: "2026-07-31",
        externalReference: "p1",
        municipalServiceCode: "08.01.01",
        serviceDescription: "PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS",
        taxes: { retainIss: false, iss: 0, pis: 0, cofins: 0, csll: 0, inss: 0, ir: 0 },
      }),
    );
    expect(cliente.emitirNota).toHaveBeenCalledWith("inv_1");
    expect(repo.update).toHaveBeenLastCalledWith("p1", expect.objectContaining({ nfseStatus: "AUTORIZADA", nfseNumero: "785", nfsePdfUrl: "http://pdf" }));
    expect(r).toMatchObject({ emitidas: 1, agendadas: 0, erros: [], restantes: 0 });
  });

  it("com sacado, a nota sai no cliente Asaas do sacado", async () => {
    repo.listarPendentes.mockResolvedValue([parcela({}, sacadoPj)]);
    cliente.agendarNota.mockResolvedValue({ id: "inv_2", status: "SCHEDULED" });
    cliente.emitirNota.mockResolvedValue({ id: "inv_2", status: "AUTHORIZED" });
    await nfseService.emitirPendentes(ref, null, { cliente: cliente as never });
    expect(cliente.agendarNota).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_sacado" }));
    expect(asaas.obterOuCriarClienteAluno).not.toHaveBeenCalled();
    // endereço do tomador é enviado ao cliente Asaas antes da nota
    expect(cliente.atualizarCliente).toHaveBeenCalledWith("cus_sacado", expect.objectContaining({ postalCode: "29056922" }));
  });

  it("tomador inválido: marca erro na parcela sem chamar o Asaas, e as demais seguem", async () => {
    const ruim = parcela({ id: "ruim" });
    (ruim as any).matricula.aluno = { ...aluno, cpf: "" };
    repo.contarPendentes.mockResolvedValue(2);
    repo.listarPendentes.mockResolvedValue([ruim, parcela({ id: "boa" })]);
    cliente.agendarNota.mockResolvedValue({ id: "inv_3", status: "SCHEDULED" });
    cliente.emitirNota.mockResolvedValue({ id: "inv_3", status: "AUTHORIZED" });

    const r = await nfseService.emitirPendentes(ref, null, { cliente: cliente as never });

    expect(repo.update).toHaveBeenCalledWith("ruim", expect.objectContaining({ nfseStatus: "ERRO", nfseErro: expect.stringContaining("CPF/CNPJ") }));
    expect(cliente.agendarNota).toHaveBeenCalledTimes(1);
    expect(r.emitidas).toBe(1);
    expect(r.erros).toHaveLength(1);
  });

  it("Asaas recusa o agendamento: parcela fica com ERRO (reprocessável) e o erro é devolvido", async () => {
    repo.listarPendentes.mockResolvedValue([parcela()]);
    cliente.agendarNota.mockRejectedValue(new Error("Município não configurado"));
    const r = await nfseService.emitirPendentes(ref, null, { cliente: cliente as never });
    expect(repo.update).toHaveBeenLastCalledWith("p1", { nfseStatus: "ERRO", nfseErro: "Município não configurado" });
    expect(r.erros[0]).toEqual({ parcelaId: "p1", erro: "Município não configurado" });
  });

  it("falha ao emitir DEPOIS de agendar: continua AGENDADA (próxima execução só emite, sem duplicar)", async () => {
    repo.listarPendentes.mockResolvedValue([parcela()]);
    cliente.agendarNota.mockResolvedValue({ id: "inv_4", status: "SCHEDULED" });
    cliente.emitirNota.mockRejectedValue(new Error("Prefeitura fora do ar"));
    await nfseService.emitirPendentes(ref, null, { cliente: cliente as never });
    expect(repo.update).toHaveBeenLastCalledWith("p1", { nfseStatus: "AGENDADA", nfseErro: "Prefeitura fora do ar" });

    // próxima execução: a parcela já tem nfseAsaasId — não agenda de novo
    cliente.agendarNota.mockClear();
    cliente.emitirNota.mockReset().mockResolvedValue({ id: "inv_4", status: "AUTHORIZED" });
    repo.listarPendentes.mockResolvedValue([parcela({ nfseAsaasId: "inv_4", nfseStatus: "AGENDADA" })]);
    await nfseService.emitirPendentes(ref, null, { cliente: cliente as never });
    expect(cliente.agendarNota).not.toHaveBeenCalled();
    expect(cliente.emitirNota).toHaveBeenCalledWith("inv_4");
  });

  it("nota aceita mas ainda processando conta como agendada; limite por execução informa o que sobrou", async () => {
    repo.contarPendentes.mockResolvedValue(150);
    repo.listarPendentes.mockResolvedValue([parcela()]);
    cliente.agendarNota.mockResolvedValue({ id: "inv_5", status: "SCHEDULED" });
    cliente.emitirNota.mockResolvedValue({ id: "inv_5", status: "SCHEDULED" });
    const r = await nfseService.emitirPendentes(ref, null, { cliente: cliente as never, limite: 1 });
    expect(r).toMatchObject({ emitidas: 0, agendadas: 1, restantes: 149 });
    expect(repo.listarPendentes).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), 1);
  });
});

describe("nfseService.executarAutomatico (janela até o dia limite)", () => {
  beforeEach(() => {
    repo.listarAgendadas.mockResolvedValue([]);
    repo.listarPendentes.mockResolvedValue([]);
    repo.contarPendentes.mockResolvedValue(0);
  });

  it("desligada: não faz nada", async () => {
    config.obterOuCriar.mockResolvedValue({ ...CONFIG, nfseAtiva: false } as never);
    const r = await nfseService.executarAutomatico(new Date(2026, 7, 5));
    expect(r.executou).toBe(false);
    expect(repo.listarPendentes).not.toHaveBeenCalled();
  });

  it("depois do dia limite: só confere status, não emite", async () => {
    const r = await nfseService.executarAutomatico(new Date(2026, 7, 11));
    expect(r).toMatchObject({ executou: false, motivo: "Fora da janela de emissão" });
    expect(repo.listarPendentes).not.toHaveBeenCalled();
  });

  it("dentro da janela (dia 10 incluso): emite o mês anterior", async () => {
    const { obterClienteAsaas } = await import("../../src/modules/asaas/asaas.service");
    vi.mocked(obterClienteAsaas).mockResolvedValue(cliente as never);
    const r = await nfseService.executarAutomatico(new Date(2026, 7, 10));
    expect(r.executou).toBe(true);
    // Busca as pagas em julho/2026: [01/07, 01/08)
    expect(repo.listarPendentes).toHaveBeenCalledWith(new Date(2026, 6, 1), new Date(2026, 7, 1), expect.any(Number));
  });

  it("dia limite configurável (ex.: 5)", async () => {
    config.obterOuCriar.mockResolvedValue({ ...CONFIG, nfseDiaLimite: 5 } as never);
    const r = await nfseService.executarAutomatico(new Date(2026, 7, 6));
    expect(r.executou).toBe(false);
  });
});

describe("nfseService.atualizarStatus", () => {
  it("nota autorizada ganha número e PDF; recusada vira ERRO com o motivo", async () => {
    repo.listarAgendadas.mockResolvedValue([parcela({ id: "a", nfseAsaasId: "inv_a" }), parcela({ id: "b", nfseAsaasId: "inv_b" })]);
    cliente.consultarNota
      .mockResolvedValueOnce({ id: "inv_a", status: "AUTHORIZED", number: "786", pdfUrl: "http://pdf" })
      .mockResolvedValueOnce({ id: "inv_b", status: "ERROR", statusDescription: "CNPJ do tomador inválido" });
    const r = await nfseService.atualizarStatus(cliente as never);
    expect(r).toEqual({ conferidas: 2, autorizadas: 1, erros: 1 });
    expect(repo.update).toHaveBeenCalledWith("b", expect.objectContaining({ nfseStatus: "ERRO", nfseErro: "CNPJ do tomador inválido" }));
  });
});
