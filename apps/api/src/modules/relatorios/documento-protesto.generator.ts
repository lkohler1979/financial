import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

export interface ParcelaDocumento {
  codTitulo: string;
  parcela: string;
  vencimento: Date;
  valor: number;
}

export interface DadosDocumentoProtesto {
  alunoNome: string;
  alunoCpf: string;
  cursoNome: string;
  parcelas: ParcelaDocumento[];
  totalConsolidado: number;
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(data: Date): string {
  return data.toLocaleDateString("pt-BR");
}

function formatarCpf(cpf: string): string {
  return cpf.length === 11 ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : cpf;
}

function paragrafoRotulo(rotulo: string, valor: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `${rotulo}: `, bold: true }), new TextRun({ text: valor })],
  });
}

function celula(texto: string): TableCell {
  return new TableCell({ children: [new Paragraph(texto)] });
}

function celulaCabecalho(texto: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: texto, bold: true })] })],
  });
}

/**
 * Gera o documento Word de protesto (PRD seção 16: credor, CNPJ, devedor,
 * CPF, curso, tabela de parcelas, total consolidado, data de emissão,
 * assinatura).
 *
 * Layout PROVISÓRIO: ainda não recebemos o modelo jurídico validado pela
 * instituição (ver docs/PENDENCIAS.md, seção "Documento de Protesto"). Não
 * alterar este layout sem confirmação quando o modelo real for fornecido
 * (CLAUDE.md seção 8). Nome/CNPJ do credor vêm de env (`INSTITUICAO_NOME`/
 * `INSTITUICAO_CNPJ`) por não existirem ainda em `Configuracao`.
 */
export function gerarDocumentoProtesto(dados: DadosDocumentoProtesto): Promise<Buffer> {
  const credor = process.env.INSTITUICAO_NOME ?? "[Nome da Instituição]";
  const cnpjCredor = process.env.INSTITUICAO_CNPJ ?? "[CNPJ da Instituição]";

  const linhasTabela = dados.parcelas.map(
    (parcela) =>
      new TableRow({
        children: [
          celula(parcela.codTitulo),
          celula(parcela.parcela),
          celula(formatarData(parcela.vencimento)),
          celula(formatarMoeda(parcela.valor)),
        ],
      }),
  );

  const documento = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: "Planilha para Protesto de Contrato",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ text: "" }),
          paragrafoRotulo("Credor", credor),
          paragrafoRotulo("CNPJ", cnpjCredor),
          new Paragraph({ text: "" }),
          paragrafoRotulo("Devedor", dados.alunoNome),
          paragrafoRotulo("CPF", formatarCpf(dados.alunoCpf)),
          paragrafoRotulo("Curso", dados.cursoNome),
          new Paragraph({ text: "" }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  celulaCabecalho("Código do título"),
                  celulaCabecalho("Parcela"),
                  celulaCabecalho("Vencimento"),
                  celulaCabecalho("Valor"),
                ],
              }),
              ...linhasTabela,
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            children: [
              new TextRun({ text: "Total consolidado: ", bold: true }),
              new TextRun({ text: formatarMoeda(dados.totalConsolidado), bold: true }),
            ],
          }),
          new Paragraph({ text: "" }),
          paragrafoRotulo("Data de emissão", formatarData(new Date())),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "" }),
          new Paragraph({
            text: "_______________________________________",
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ text: "Assinatura", alignment: AlignmentType.CENTER }),
        ],
      },
    ],
  });

  return Packer.toBuffer(documento);
}
