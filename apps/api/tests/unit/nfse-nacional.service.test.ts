import { beforeEach, describe, expect, it, vi } from "vitest";
import { configuracoesRepository } from "../../src/modules/configuracoes/configuracoes.repository";
import {
  nfseNacionalService,
  pendenciasDaConfiguracao,
} from "../../src/modules/nfse/nacional/nfse-nacional.service";
import {
  gunzipBase64,
  gzipBase64,
  NfseRejeitadaError,
  SefinClient,
  type Transporte,
} from "../../src/modules/nfse/nacional/sefin-client";
import { lerCertificadoA1 } from "../../src/modules/nfse/nacional/certificado";
import { nfseRepository } from "../../src/modules/nfse/nfse.repository";
import { competenciaPadrao, nfseService } from "../../src/modules/nfse/nfse.service";
import { criptografar } from "../../src/shared/utils/criptografia";
import { gerarPfxTeste } from "./helpers/certificado-teste";

vi.mock("../../src/modules/nfse/nfse.repository", () => ({
  TIPOS_COM_NFSE: ["Mensalidade", "Renegociação", "Renegociacao"],
  nfseRepository: {
    listarPendentes: vi.fn(),
    contarPendentes: vi.fn(),
    listarNotasDaCompetencia: vi.fn(),
    listarAgendadas: vi.fn(),
    buscarPagas: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock("../../src/modules/configuracoes/configuracoes.repository", () => ({
  configuracoesRepository: { obterOuCriar: vi.fn(), atualizar: vi.fn(), reservarNumeroDps: vi.fn() },
}));
vi.mock("../../src/modules/asaas/asaas.service", () => ({
  asaasService: { obterOuCriarClienteAluno: vi.fn(), obterOuCriarClienteSacado: vi.fn() },
  obterClienteAsaas: vi.fn(),
}));
vi.mock("../../src/modules/auditoria/auditoria.service", () => ({ registrarAuditoria: vi.fn() }));

const repo = vi.mocked(nfseRepository);
const config = vi.mocked(configuracoesRepository);

process.env.LEGADO_CREDENCIAIS_SECRET = "segredo-de-teste";

const { pfx, senha } = gerarPfxTeste();
const certificado = lerCertificadoA1(pfx, senha);

const CONFIG = {
  id: "c1",
  nfseProvedor: "NACIONAL",
  nfseAmbiente: "HOMOLOGACAO",
  nfseServicoCodigo: "08.01.01",
  nfseServicoDescricao: "PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS",
  nfseCertificadoCriptografado: criptografar(pfx.toString("base64")),
  nfseCertificadoSenhaCriptografada: criptografar(senha),
  nfseCertificadoCnpj: "39279631000127",
  nfseCertificadoValidoAte: certificado.validoAte,
  nfsePrestadorCnpj: "39279631000127",
  nfsePrestadorInscricaoMunicipal: null,
  nfsePrestadorTelefone: null,
  nfsePrestadorEmail: null,
  nfseMunicipioIbge: "3205309",
  nfseOpcaoSimples: 3,
  nfseRegimeApuracaoSn: 1,
  nfseRegimeEspecial: 0,
  nfseAliquotaSimples: "0",
  nfseCodigoTributacaoMunicipal: null,
  nfseSerieDps: 1,
  nfseProximoNumeroDps: 1036,
};

const aluno = { id: "a1", nome: "Anderson Sousa", cpf: "52998224725", email: null, cep: "58200062", endereco: "Rua X", numero: "172", complemento: null, bairro: "Centro" };

function parcela(extra: Record<string, unknown> = {}) {
  return {
    id: "p1",
    parcela: "3/12",
    tipoTitulo: "Mensalidade",
    status: "PAGO",
    valor: "251.49",
    valorPago: "251.49",
    dataPagamento: new Date(2026, 6, 15),
    nfseAsaasId: null,
    nfseStatus: null,
    nfseErro: null,
    nfseChaveAcesso: null,
    nfseNumeroDps: null,
    nfseSerieDps: null,
    matricula: { id: "m1", numeroMatricula: "M1", curso: { nome: "Curso X" }, aluno, sacado: null },
    ...extra,
  } as never;
}

const CHAVE = "32053092239279631000127000000000078526087220072277";
const XML_NFSE = `<NFSe><infNFSe Id="NFS${CHAVE}"><nNFSe>785</nNFSe></infNFSe></NFSe>`;

function resposta(status: number, json: unknown) {
  return { status, corpo: Buffer.from(JSON.stringify(json)) };
}

function clienteCom(transporte: Transporte) {
  return new SefinClient(certificado, "HOMOLOGACAO", transporte);
}

beforeEach(() => {
  vi.resetAllMocks();
  // Nenhum teste sai para a internet (ViaCEP): CEP "não encontrado".
  vi.stubGlobal("fetch", async () => ({ json: async () => ({ erro: true }) }));
  config.obterOuCriar.mockResolvedValue(CONFIG as never);
  config.reservarNumeroDps.mockResolvedValue({ serie: 1, numero: 1036 });
});

describe("SefinClient", () => {
  it("emitir: envia a DPS em gzip+base64 por mTLS e devolve chave e XML da nota", async () => {
    const transporte = vi.fn<Parameters<Transporte>, ReturnType<Transporte>>().mockResolvedValue(
      resposta(201, { chaveAcesso: CHAVE, idDps: "DPS1", nfseXmlGZipB64: gzipBase64(XML_NFSE) }),
    );
    const nota = await clienteCom(transporte).emitir("<DPS/>");

    expect(nota).toEqual({ chaveAcesso: CHAVE, idDps: "DPS1", xml: XML_NFSE });
    const req = transporte.mock.calls[0][0];
    expect(req.url).toBe("https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse");
    expect(req.metodo).toBe("POST");
    expect(req.certificado).toBe(certificado);
    expect(gunzipBase64(JSON.parse(req.corpo as string).dpsXmlGZipB64)).toBe("<DPS/>");
  });

  it("usa os endereços de produção quando o ambiente é produção", async () => {
    const transporte = vi.fn<Parameters<Transporte>, ReturnType<Transporte>>().mockResolvedValue(resposta(404, {}));
    await new SefinClient(certificado, "PRODUCAO", transporte).consultarDps("DPS1");
    expect(transporte.mock.calls[0][0].url).toBe("https://sefin.nfse.gov.br/SefinNacional/dps/DPS1");
  });

  it("rejeição da SEFIN vira erro 422 com código e descrição (aceita maiúsculas e array)", async () => {
    const cliente = clienteCom(async () => resposta(400, { erros: [{ Codigo: "E0014", Descricao: "Duplicidade de DPS", complemento: "nDPS 1036" }, { codigo: "E1", descricao: "outro" }] }));
    const erro = await cliente.emitir("<DPS/>").catch((e) => e);
    expect(erro).toBeInstanceOf(NfseRejeitadaError);
    expect(erro.message).toBe("Rejeição da SEFIN [E0014]: Duplicidade de DPS — nDPS 1036 (+1)");
    expect(erro.statusCode).toBe(422);
  });

  it("certificado recusado (401) e queda de rede têm mensagens próprias", async () => {
    await expect(clienteCom(async () => ({ status: 401, corpo: Buffer.alloc(0) })).emitir("<DPS/>")).rejects.toMatchObject({ codigo: "NFSE_CERTIFICADO_RECUSADO" });
    await expect(
      clienteCom(async () => {
        throw new Error("ECONNRESET");
      }).emitir("<DPS/>"),
    ).rejects.toMatchObject({ codigo: "NFSE_SEM_COMUNICACAO", statusCode: 502 });
  });

  it("consultarDps: 404 = sem nota; 200 = chave", async () => {
    expect(await clienteCom(async () => resposta(404, {})).consultarDps("DPS1")).toBeNull();
    expect(await clienteCom(async () => resposta(200, { chaveAcesso: CHAVE })).consultarDps("DPS1")).toBe(CHAVE);
  });

  it("DANFSe: devolve o PDF; resposta que não é PDF vira erro", async () => {
    const pdf = Buffer.from("%PDF-1.4 conteudo");
    const transporte = vi.fn<Parameters<Transporte>, ReturnType<Transporte>>().mockResolvedValue({ status: 200, corpo: pdf });
    expect(await clienteCom(transporte).baixarDanfse(CHAVE)).toEqual(pdf);
    expect(transporte.mock.calls[0][0].url).toBe(`https://adn.producaorestrita.nfse.gov.br/danfse/${CHAVE}`);
    await expect(clienteCom(async () => resposta(200, { x: 1 })).baixarDanfse(CHAVE)).rejects.toMatchObject({ codigo: "NFSE_RESPOSTA_INESPERADA" });
  });
});

describe("pendenciasDaConfiguracao", () => {
  it("lista o que falta para emitir direto", () => {
    expect(pendenciasDaConfiguracao(CONFIG as never)).toEqual([]);
    const vazio = { ...CONFIG, nfseCertificadoCriptografado: null, nfsePrestadorCnpj: null, nfseCertificadoCnpj: null, nfseMunicipioIbge: null, nfseServicoCodigo: "x" };
    expect(pendenciasDaConfiguracao(vazio as never)).toEqual([
      "certificado digital A1 não cadastrado",
      "CNPJ do prestador",
      "código IBGE do município (7 dígitos)",
      "código do serviço (ex.: 08.01.01)",
    ]);
    expect(pendenciasDaConfiguracao({ ...CONFIG, nfseCertificadoValidoAte: new Date(2020, 1, 1) } as never)).toEqual(["certificado digital vencido"]);
  });
});

describe("nfseNacionalService.emitir", () => {
  const tomador = { origem: "ALUNO", id: "a1", nome: "Anderson Sousa", documento: "52998224725", email: null, cep: "58200062", endereco: "Rua X", numero: "172", complemento: null, bairro: "Centro" } as never;

  it("reserva o número, assina e envia a DPS, e grava a nota autorizada na parcela", async () => {
    const enviar = vi.fn().mockResolvedValue({ chaveAcesso: CHAVE, idDps: null, xml: XML_NFSE });
    const cliente = { emitir: enviar, consultarDps: vi.fn() } as unknown as SefinClient;

    const status = await nfseNacionalService.emitir(parcela(), tomador, "2026-07-31", CONFIG as never, cliente, {
      consultarMunicipio: async () => "2506301",
      agora: new Date("2026-08-11T21:19:17Z"),
    });

    expect(status).toBe("AUTORIZADA");
    expect(repo.update).toHaveBeenNthCalledWith(1, "p1", { nfseNumeroDps: 1036, nfseSerieDps: 1 });
    const xml: string = enviar.mock.calls[0][0];
    expect(xml).toContain('<infDPS Id="DPS320530923927963100012700001000000000001036">');
    expect(xml).toContain("<dCompet>2026-07-31</dCompet>");
    expect(xml).toContain("<toma><CPF>52998224725</CPF>");
    expect(xml).toContain("<cMun>2506301</cMun>");
    expect(xml).toContain("<vServ>251.49</vServ>");
    expect(xml).toContain("<Signature");
    expect(cliente.consultarDps).not.toHaveBeenCalled(); // primeira tentativa: nada a recuperar
    expect(repo.update).toHaveBeenLastCalledWith(
      "p1",
      expect.objectContaining({ nfseChaveAcesso: CHAVE, nfseStatus: "AUTORIZADA", nfseNumero: "785", nfseXml: XML_NFSE, nfseErro: null }),
    );
  });

  it("sem município do tomador (ViaCEP fora) envia sem endereço em vez de falhar", async () => {
    const enviar = vi.fn().mockResolvedValue({ chaveAcesso: CHAVE, idDps: null, xml: XML_NFSE });
    await nfseNacionalService.emitir(parcela(), tomador, "2026-07-31", CONFIG as never, { emitir: enviar } as never, {
      consultarMunicipio: async () => null,
    });
    expect(enviar.mock.calls[0][0]).not.toContain("<end>");
  });

  it("rejeição da SEFIN grava o erro na parcela, mantém o número da DPS e relança", async () => {
    const rejeicao = new NfseRejeitadaError([{ codigo: "E0600", descricao: "Município inativo" }]);
    const cliente = { emitir: vi.fn().mockRejectedValue(rejeicao) } as unknown as SefinClient;
    const p = parcela();

    await expect(nfseNacionalService.emitir(p, tomador, "2026-07-31", CONFIG as never, cliente, { consultarMunicipio: async () => null })).rejects.toBe(rejeicao);
    expect(repo.update).toHaveBeenLastCalledWith("p1", { nfseStatus: "ERRO", nfseErro: "Rejeição da SEFIN [E0600]: Município inativo" });
    expect(repo.update).not.toHaveBeenCalledWith("p1", expect.objectContaining({ nfseChaveAcesso: expect.anything() }));
  });

  it("nova tentativa com número já reservado recupera a nota que a SEFIN chegou a gerar, sem reemitir", async () => {
    const cliente = {
      consultarDps: vi.fn().mockResolvedValue(CHAVE),
      consultarNfse: vi.fn().mockResolvedValue(XML_NFSE),
      emitir: vi.fn(),
    } as unknown as SefinClient;
    const p = parcela({ nfseStatus: "ERRO", nfseNumeroDps: 1036, nfseSerieDps: 1 });

    const status = await nfseNacionalService.emitir(p, tomador, "2026-07-31", CONFIG as never, cliente);
    expect(status).toBe("AUTORIZADA");
    expect(config.reservarNumeroDps).not.toHaveBeenCalled();
    expect(cliente.consultarDps).toHaveBeenCalledWith("DPS320530923927963100012700001000000000001036");
    expect(cliente.emitir).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenLastCalledWith("p1", expect.objectContaining({ nfseChaveAcesso: CHAVE, nfseStatus: "AUTORIZADA" }));
  });
});

describe("nota individual (nfseService.emitirParaParcela)", () => {
  const hoje = new Date(2026, 9, 7); // 07/10/2026

  it("competenciaPadrao: último dia do mês do pagamento, sem passar de hoje", () => {
    expect(competenciaPadrao(new Date(2026, 6, 15), hoje)).toBe("2026-07-31");
    expect(competenciaPadrao(new Date(2026, 9, 2), hoje)).toBe("2026-10-07");
  });

  it("emite pelo provedor nacional com a competência padrão e devolve a parcela atualizada", async () => {
    const enviar = vi.fn().mockResolvedValue({ chaveAcesso: CHAVE, idDps: null, xml: XML_NFSE });
    const espiao = vi.spyOn(nfseService, "contexto").mockResolvedValue({ nacional: { emitir: enviar } as never });
    repo.findById.mockResolvedValue(parcela());

    await nfseService.emitirParaParcela("p1", "u1", { hoje });

    expect(enviar.mock.calls[0][0]).toContain("<dCompet>2026-07-31</dCompet>");
    espiao.mockRestore();
  });

  it("aceita competência escolhida e recusa data futura", async () => {
    repo.findById.mockResolvedValue(parcela());
    await expect(nfseService.emitirParaParcela("p1", "u1", { competencia: "2026-10-08", hoje })).rejects.toThrow(/futura/);
  });

  it("só parcelas pagas e ainda sem nota autorizada", async () => {
    repo.findById.mockResolvedValue(parcela({ status: "EM_ABERTO" }));
    await expect(nfseService.emitirParaParcela("p1", "u1", { hoje })).rejects.toThrow(/parcela paga/);
    repo.findById.mockResolvedValue(parcela({ nfseStatus: "AUTORIZADA" }));
    await expect(nfseService.emitirParaParcela("p1", "u1", { hoje })).rejects.toThrow(/já foi emitida/);
    repo.findById.mockResolvedValue(null);
    await expect(nfseService.emitirParaParcela("zz", "u1", { hoje })).rejects.toThrow(/não encontrada/);
  });

  it("buscarPagamentos marca se o tipo gera nota automática e mostra a competência sugerida", async () => {
    repo.buscarPagas.mockResolvedValue([parcela(), parcela({ id: "p2", tipoTitulo: "Taxa de matrícula" })]);
    const lista = await nfseService.buscarPagamentos({ busca: "anderson" });
    expect(lista.map((i) => [i.parcelaId, i.geraNotaAutomatica])).toEqual([["p1", true], ["p2", false]]);
    expect(lista[0].competenciaPadrao).toBe("2026-07-31");
  });
});
