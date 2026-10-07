import { SignedXml } from "xml-crypto";
import { describe, expect, it } from "vitest";
import { assinarDps } from "../../src/modules/nfse/nacional/assinatura";
import { lerCertificadoA1 } from "../../src/modules/nfse/nacional/certificado";
import { montarDpsXml, montarIdDps, type DadosDps } from "../../src/modules/nfse/nacional/dps";
import { gerarPfxTeste } from "./helpers/certificado-teste";

const DADOS: DadosDps = {
  tipoAmbiente: 2,
  serie: 1,
  numero: 1036,
  emitidaEm: new Date("2026-08-11T21:18:17Z"), // 18:18:17 em Brasília
  competencia: "2026-07-31",
  prestador: {
    cnpj: "39279631000127",
    inscricaoMunicipal: null,
    telefone: "(27) 99827-6190",
    email: "contato@ethos.com.br",
    opcaoSimples: 3,
    regimeApuracaoSn: 1,
    regimeEspecial: 0,
    municipioIbge: "3205309",
  },
  tomador: {
    documento: "100.521.534-01",
    nome: "Anderson Oliveira de Sousa & Filhos",
    email: null,
    endereco: { municipioIbge: "2506301", cep: "58200-062", logradouro: "Deodoro da Fonseca", numero: "172", complemento: "Primeiro Andar", bairro: "CENTRO" },
  },
  servico: {
    codigoTributacaoNacional: "080101",
    descricao: "PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS",
    informacoesComplementares: "Parcela 3/12 (Mensalidade) — Curso X.",
  },
  valor: 251.49,
  aliquotaSimples: 0,
};

describe("montarIdDps", () => {
  it("compõe DPS + município + tipo + CNPJ + série(5) + número(15) = 45 caracteres", () => {
    const id = montarIdDps({ serie: 1, numero: 1035, municipioIbge: "3205309", cnpj: "39.279.631/0001-27" });
    expect(id).toBe("DPS320530923927963100012700001000000000001035");
    expect(id).toHaveLength(45);
  });
});

describe("montarDpsXml", () => {
  it("gera o DPS na ordem do leiaute 1.01, no fuso de Brasília, sem nome/endereço do prestador", () => {
    const xml = montarDpsXml(DADOS);
    expect(xml).toContain('<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">');
    expect(xml).toContain('<infDPS Id="DPS320530923927963100012700001000000000001036">');
    expect(xml).toContain("<dhEmi>2026-08-11T18:18:17-03:00</dhEmi>");
    expect(xml).toContain("<dCompet>2026-07-31</dCompet><tpEmit>1</tpEmit><cLocEmi>3205309</cLocEmi>");
    expect(xml).toContain("<nDPS>1036</nDPS>");
    // prestador: só CNPJ, contato e regime
    expect(xml).toContain("<prest><CNPJ>39279631000127</CNPJ><fone>27998276190</fone><email>contato@ethos.com.br</email>");
    expect(xml).toContain("<regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib></regTrib>");
    expect(xml).not.toContain("<xNome>INSTITUTO");
    // tomador pessoa física, com endereço nacional e nome escapado
    expect(xml).toContain("<toma><CPF>10052153401</CPF><xNome>Anderson Oliveira de Sousa &amp; Filhos</xNome>");
    expect(xml).toContain("<end><endNac><cMun>2506301</cMun><CEP>58200062</CEP></endNac><xLgr>Deodoro da Fonseca</xLgr><nro>172</nro><xCpl>Primeiro Andar</xCpl><xBairro>CENTRO</xBairro></end>");
    // serviço e valores
    expect(xml).toContain("<serv><locPrest><cLocPrestacao>3205309</cLocPrestacao></locPrest><cServ><cTribNac>080101</cTribNac><xDescServ>PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS</xDescServ></cServ>");
    expect(xml).toContain("<infoCompl><xInfComp>Parcela 3/12 (Mensalidade) — Curso X.</xInfComp></infoCompl></serv>");
    expect(xml).toContain("<vServPrest><vServ>251.49</vServ></vServPrest>");
    expect(xml).toContain("<tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><totTrib><pTotTribSN>0.00</pTotTribSN></totTrib>");
    // ordem dos grupos
    const ordem = ["<tpAmb>", "<dhEmi>", "<verAplic>", "<serie>", "<nDPS>", "<dCompet>", "<tpEmit>", "<cLocEmi>", "<prest>", "<toma>", "<serv>", "<valores>"];
    const posicoes = ordem.map((t) => xml.indexOf(t));
    expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
    expect(posicoes.every((p) => p > 0)).toBe(true);
  });

  it("tomador CNPJ, sem endereço quando não há município, MEI usa indTotTrib", () => {
    const xml = montarDpsXml({
      ...DADOS,
      prestador: { ...DADOS.prestador, opcaoSimples: 2 },
      tomador: { documento: "11.222.333/0001-81", nome: "Empresa Ltda", endereco: null },
    });
    expect(xml).toContain("<toma><CNPJ>11222333000181</CNPJ><xNome>Empresa Ltda</xNome></toma>");
    expect(xml).not.toContain("<end>");
    expect(xml).toContain("<totTrib><indTotTrib>0</indTotTrib></totTrib>");
    expect(xml).not.toContain("regApTribSN");
  });

  it("rejeita o que a SEFIN recusaria: competência futura, valor zero, código do serviço", () => {
    expect(() => montarDpsXml({ ...DADOS, competencia: "2026-08-12" })).toThrow(/posterior/);
    expect(() => montarDpsXml({ ...DADOS, valor: 0 })).toThrow(/Valor/);
    expect(() => montarDpsXml({ ...DADOS, servico: { ...DADOS.servico, codigoTributacaoNacional: "0801" } })).toThrow(/6 dígitos/);
    expect(() => montarDpsXml({ ...DADOS, prestador: { ...DADOS.prestador, municipioIbge: "123" } })).toThrow(/IBGE/);
  });
});

describe("certificado A1 e assinatura", () => {
  it("abre o .pfx, lê titular/CNPJ/validade e recusa senha errada ou vencido", () => {
    const { pfx, senha } = gerarPfxTeste();
    const cert = lerCertificadoA1(pfx, senha);
    expect(cert.titular).toBe("EMPRESA TESTE LTDA:39279631000127");
    expect(cert.cnpj).toBe("39279631000127");
    expect(cert.validoAte.getTime()).toBeGreaterThan(Date.now());
    expect(cert.keyPem).toContain("PRIVATE KEY");

    expect(() => lerCertificadoA1(pfx, "errada")).toThrow(/senha/);
    expect(() => lerCertificadoA1(Buffer.from("não é um pfx"), senha)).toThrow(/abrir o certificado/);
    const vencido = gerarPfxTeste({ inicio: new Date(Date.now() - 400 * 86_400_000), diasDeValidade: 30 });
    expect(() => lerCertificadoA1(vencido.pfx, vencido.senha)).toThrow(/vencido/);
  });

  it("assina o infDPS (RSA-SHA256, c14n exclusiva) com a Signature no fim do DPS e a assinatura confere", () => {
    const { pfx, senha, certPem } = gerarPfxTeste();
    const certificado = lerCertificadoA1(pfx, senha);
    const assinado = assinarDps(montarDpsXml(DADOS), certificado);

    expect(assinado).toMatch(/<\/infDPS><Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#">/);
    expect(assinado.endsWith("</Signature></DPS>")).toBe(true);
    expect(assinado).toContain('URI="#DPS320530923927963100012700001000000000001036"');
    expect(assinado).toContain("http://www.w3.org/2001/04/xmldsig-more#rsa-sha256");
    expect(assinado).toContain("<X509Certificate>");

    const verificador = new SignedXml({ publicCert: certPem });
    const assinatura = /<Signature[\s\S]*<\/Signature>/.exec(assinado)?.[0] as string;
    verificador.loadSignature(assinatura);
    expect(verificador.checkSignature(assinado)).toBe(true);
    // alterar o conteúdo depois de assinar invalida a assinatura
    const adulterado = new SignedXml({ publicCert: certPem });
    adulterado.loadSignature(assinatura);
    expect(adulterado.checkSignature(assinado.replace("251.49", "999.99"))).toBe(false);
  });
});
