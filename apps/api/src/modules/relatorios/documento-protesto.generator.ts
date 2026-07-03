import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
const FONTE = "Times New Roman";
const TAMANHO = 28; // half-points = 14pt, igual ao modelo real

export interface ParcelaDocumento {
  vencimento: Date;
  valorBruto: number;
  multa: number;
  juros: number;
  total: number;
}

export interface DadosDocumentoProtesto {
  alunoNome: string;
  alunoCpf: string;
  cursoNome: string;
  parcelas: ParcelaDocumento[];
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

function texto(conteudo: string, negrito = false): TextRun {
  return new TextRun({ text: conteudo, bold: negrito, font: FONTE, size: TAMANHO });
}

function paragrafoRotulo(rotulo: string, valor: string): Paragraph {
  return new Paragraph({ children: [texto(`${rotulo}: `, true), texto(valor)] });
}

function celula(conteudo: string, negrito = true): TableCell {
  return new TableCell({ children: [new Paragraph({ children: [texto(conteudo, negrito)] })] });
}

/**
 * Gera o documento Word de protesto replicando o modelo real fornecido pela
 * Ethos em 2026-07-03 (ver docs/PENDENCIAS.md): título, credor, devedor,
 * curso, tabela de parcelas (Vencimento/Valor Bruto/Multa/Juros/Total), total
 * consolidado (só na última coluna da linha "Total" — as demais colunas dessa
 * linha ficam com pontilhado, igual ao modelo) e assinatura.
 *
 * Multa/juros já vêm calculados em `parcelas` (ver `calculo-financeiro.ts`
 * e `Configuracao.multaPercentual`/`jurosDiarioPercentual`) — este módulo só
 * formata e desenha o documento.
 */
export async function gerarDocumentoProtesto(dados: DadosDocumentoProtesto): Promise<Buffer> {
  const credor = process.env.INSTITUICAO_NOME ?? "[Nome da Instituição]";
  const cnpjCredor = process.env.INSTITUICAO_CNPJ ?? "[CNPJ da Instituição]";

  const totalConsolidado = dados.parcelas.reduce((soma, p) => soma + p.total, 0);

  const linhasTabela = dados.parcelas.map(
    (parcela) =>
      new TableRow({
        children: [
          celula(formatarData(parcela.vencimento)),
          celula(formatarMoeda(parcela.valorBruto)),
          celula(formatarMoeda(parcela.multa)),
          celula(formatarMoeda(parcela.juros)),
          celula(formatarMoeda(parcela.total)),
        ],
      }),
  );

  const linhaTotal = new TableRow({
    children: [
      celula("Total"),
      celula("......................"),
      celula("......................"),
      celula("......................"),
      celula(formatarMoeda(totalConsolidado)),
    ],
  });

  const cabecalho = new TableRow({
    children: ["Vencimento", "Valor Bruto", "Multa", "Juros", "Total"].map((rotulo) =>
      celula(rotulo),
    ),
  });

  const documento = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: [
          new Paragraph({
            spacing: { after: 300 },
            children: [texto("PLANILHA PARA PROTESTO DE CONTRATO", true)],
          }),
          new Paragraph({ children: [texto("NOME DO CREDOR: ", true), texto(credor)] }),
          new Paragraph({ children: [texto(`CNPJ/CPF: ${cnpjCredor}`)] }),
          new Paragraph({ children: [] }),
          paragrafoRotulo("NOME DO DEVEDOR", dados.alunoNome),
          paragrafoRotulo("CNPJ/CPF", formatarCpf(dados.alunoCpf)),
          paragrafoRotulo("CAMPUS/CURSO", dados.cursoNome),
          new Paragraph({ children: [] }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [cabecalho, ...linhasTabela, linhaTotal],
          }),
          new Paragraph({ spacing: { before: 200 }, children: [] }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [texto(`Vitória-ES, ${formatarData(new Date())}.`)],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [texto("________________________________________")],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(documento);
}
