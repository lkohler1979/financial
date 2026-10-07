import { ValidationError } from "../../../shared/errors/app-error";

// DPS (Declaração de Prestação de Serviço) do Padrão Nacional da NFS-e — leiaute 1.01.
// A ordem dos elementos é a do XSD; qualquer troca é rejeitada pela SEFIN (E1235).

export const NAMESPACE_NFSE = "http://www.sped.fazenda.gov.br/nfse";
export const VERSAO_LAYOUT = "1.01";
const VERSAO_APLICATIVO = "EthosFinancial-1";

export interface EnderecoTomadorDps {
  municipioIbge: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
}

export interface DadosDps {
  /** 1 = produção, 2 = homologação (produção restrita). */
  tipoAmbiente: 1 | 2;
  serie: number;
  numero: number;
  emitidaEm: Date;
  /** Competência (data do fato gerador) "AAAA-MM-DD" — não pode ser posterior à emissão. */
  competencia: string;
  prestador: {
    cnpj: string;
    inscricaoMunicipal?: string | null;
    telefone?: string | null;
    email?: string | null;
    /** opSimpNac: 1 não optante, 2 MEI, 3 ME/EPP. */
    opcaoSimples: number;
    /** regApTribSN — obrigatório quando ME/EPP. */
    regimeApuracaoSn: number;
    regimeEspecial: number;
    municipioIbge: string;
  };
  tomador: {
    documento: string;
    nome: string;
    email?: string | null;
    telefone?: string | null;
    endereco?: EnderecoTomadorDps | null;
  };
  servico: {
    /** Código de tributação nacional de 6 dígitos (ex.: 080101). */
    codigoTributacaoNacional: string;
    codigoTributacaoMunicipal?: string | null;
    descricao: string;
    informacoesComplementares?: string | null;
  };
  valor: number;
  /** Alíquota aproximada do Simples (%) — totTrib/pTotTribSN, só para ME/EPP. */
  aliquotaSimples: number;
}

const apenasDigitos = (valor: string | null | undefined) => (valor ?? "").replace(/\D/g, "");

export function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(nome: string, valor: string | number | null | undefined, max?: number): string {
  if (valor === null || valor === undefined) return "";
  const texto = String(valor).replace(/\s+/g, " ").trim();
  if (!texto) return "";
  return `<${nome}>${escaparXml(max ? texto.slice(0, max) : texto)}</${nome}>`;
}

const decimal = (n: number) => n.toFixed(2);

/** Data/hora no fuso de Brasília (sem horário de verão): AAAA-MM-DDThh:mm:ss-03:00. */
export function dataHoraBrasilia(data: Date): string {
  return `${new Date(data.getTime() - 3 * 3600_000).toISOString().slice(0, 19)}-03:00`;
}

/**
 * Id da DPS: "DPS" + município emissor (7) + tipo de inscrição (1 CPF, 2 CNPJ) + CNPJ (14)
 * + série (5) + número (15) = 45 caracteres. É a chave de idempotência na SEFIN.
 */
export function montarIdDps(dados: Pick<DadosDps, "serie" | "numero"> & { municipioIbge: string; cnpj: string }): string {
  return `DPS${dados.municipioIbge}2${apenasDigitos(dados.cnpj).padStart(14, "0")}${String(dados.serie).padStart(5, "0")}${String(dados.numero).padStart(15, "0")}`;
}

/** Valida o que a SEFIN rejeitaria de cara, com mensagens em português. */
export function validarDados(dados: DadosDps): void {
  const erros: string[] = [];
  if (apenasDigitos(dados.prestador.cnpj).length !== 14) erros.push("CNPJ do prestador inválido");
  if (!/^\d{7}$/.test(dados.prestador.municipioIbge)) erros.push("Código IBGE do município do prestador deve ter 7 dígitos");
  if (!/^\d{6}$/.test(dados.servico.codigoTributacaoNacional)) {
    erros.push("Código de tributação nacional deve ter 6 dígitos (ex.: 08.01.01)");
  }
  if (![11, 14].includes(apenasDigitos(dados.tomador.documento).length)) erros.push("CPF/CNPJ do tomador inválido");
  if (!dados.tomador.nome.trim()) erros.push("Tomador sem nome");
  if (!(dados.valor > 0)) erros.push("Valor da nota inválido");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.competencia)) erros.push("Competência inválida");
  else if (dados.competencia > dataHoraBrasilia(dados.emitidaEm).slice(0, 10)) erros.push("Competência não pode ser posterior à data de emissão");
  if (!Number.isInteger(dados.numero) || dados.numero < 1) erros.push("Número da DPS inválido");
  if (!Number.isInteger(dados.serie) || dados.serie < 1 || dados.serie > 89999) erros.push("Série da DPS inválida (1 a 89999)");
  if (erros.length) throw new ValidationError(erros.join("; "));
}

function montarTomador(t: DadosDps["tomador"]): string {
  const documento = apenasDigitos(t.documento);
  const identificador = documento.length === 14 ? `<CNPJ>${documento}</CNPJ>` : `<CPF>${documento}</CPF>`;
  const e = t.endereco;
  const endereco = e
    ? `<end><endNac><cMun>${e.municipioIbge}</cMun><CEP>${apenasDigitos(e.cep)}</CEP></endNac>` +
      `${tag("xLgr", e.logradouro, 255)}${tag("nro", e.numero || "S/N", 60)}${tag("xCpl", e.complemento, 156)}${tag("xBairro", e.bairro, 60)}</end>`
    : "";
  const fone = apenasDigitos(t.telefone);
  return (
    `<toma>${identificador}${tag("xNome", t.nome, 300)}${endereco}` +
    `${fone.length >= 6 && fone.length <= 20 ? `<fone>${fone}</fone>` : ""}${tag("email", t.email, 80)}</toma>`
  );
}

/**
 * XML da DPS (sem assinatura) — emissão pelo próprio prestador (tpEmit=1): nome e endereço
 * do prestador não vão na DPS, a SEFIN os preenche do cadastro nacional.
 */
export function montarDpsXml(dados: DadosDps): string {
  validarDados(dados);
  const p = dados.prestador;
  const id = montarIdDps({ serie: dados.serie, numero: dados.numero, municipioIbge: p.municipioIbge, cnpj: p.cnpj });

  const foneP = apenasDigitos(p.telefone);
  const regTrib =
    `<regTrib><opSimpNac>${p.opcaoSimples}</opSimpNac>` +
    `${p.opcaoSimples === 3 ? `<regApTribSN>${p.regimeApuracaoSn}</regApTribSN>` : ""}` +
    `<regEspTrib>${p.regimeEspecial}</regEspTrib></regTrib>`;
  const prestador =
    `<prest><CNPJ>${apenasDigitos(p.cnpj)}</CNPJ>${tag("IM", p.inscricaoMunicipal, 15)}` +
    `${foneP.length >= 6 && foneP.length <= 20 ? `<fone>${foneP}</fone>` : ""}${tag("email", p.email, 80)}${regTrib}</prest>`;

  // Simples Nacional: ME/EPP informa a alíquota aproximada (pTotTribSN); MEI e não optante
  // têm outras regras (indTotTrib / vTotTrib) — aqui só o que a escola usa.
  const totTrib =
    p.opcaoSimples === 3
      ? `<totTrib><pTotTribSN>${decimal(dados.aliquotaSimples)}</pTotTribSN></totTrib>`
      : p.opcaoSimples === 2
        ? "<totTrib><indTotTrib>0</indTotTrib></totTrib>"
        : `<totTrib><pTotTrib><pTotTribFed>0.00</pTotTribFed><pTotTribEst>0.00</pTotTribEst><pTotTribMun>0.00</pTotTribMun></pTotTrib></totTrib>`;

  const s = dados.servico;
  const servico =
    `<serv><locPrest><cLocPrestacao>${p.municipioIbge}</cLocPrestacao></locPrest>` +
    `<cServ><cTribNac>${s.codigoTributacaoNacional}</cTribNac>${tag("cTribMun", s.codigoTributacaoMunicipal, 3)}${tag("xDescServ", s.descricao, 2000)}</cServ>` +
    `${s.informacoesComplementares ? `<infoCompl>${tag("xInfComp", s.informacoesComplementares, 2000)}</infoCompl>` : ""}</serv>`;

  const valores =
    `<valores><vServPrest><vServ>${decimal(dados.valor)}</vServ></vServPrest>` +
    `<trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun>${totTrib}</trib></valores>`;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<DPS xmlns="${NAMESPACE_NFSE}" versao="${VERSAO_LAYOUT}">` +
    `<infDPS Id="${id}"><tpAmb>${dados.tipoAmbiente}</tpAmb><dhEmi>${dataHoraBrasilia(dados.emitidaEm)}</dhEmi>` +
    `<verAplic>${VERSAO_APLICATIVO}</verAplic><serie>${dados.serie}</serie><nDPS>${dados.numero}</nDPS>` +
    `<dCompet>${dados.competencia}</dCompet><tpEmit>1</tpEmit><cLocEmi>${p.municipioIbge}</cLocEmi>` +
    `${prestador}${montarTomador(dados.tomador)}${servico}${valores}</infDPS></DPS>`
  );
}
