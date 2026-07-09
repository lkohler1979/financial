import path from "node:path";
import PDFDocument from "pdfkit";
import type { DadosDocumentoProtesto } from "./documento-protesto.generator";

// Fonte embutida no próprio PDF (DejaVu Serif, licença Bitstream Vera —
// redistribuição livre, ver node_modules/dejavu-fonts-ttf/LICENSE), em vez
// das fontes "padrão" do PDF (Times-Roman) ou de converter o .docx via
// LibreOffice. As duas alternativas dependem de fontes do SISTEMA que a
// imagem Docker (node:20-alpine) não tem — foi exatamente isso que causou
// os caracteres quebrados/vazios reportados (ver PENDENCIAS.md). Com a
// fonte embutida via `dejavu-fonts-ttf` (dependência npm comum, resolvida
// junto com todo o resto do node_modules), o PDF fica autocontido e correto
// em qualquer visualizador, sem LibreOffice/fontconfig/pacotes de sistema.
const PASTA_FONTES = path.dirname(require.resolve("dejavu-fonts-ttf/package.json"));
const FONTE = path.join(PASTA_FONTES, "ttf", "DejaVuSerif.ttf");
const FONTE_NEGRITO = path.join(PASTA_FONTES, "ttf", "DejaVuSerif-Bold.ttf");
const TAMANHO = 10;

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(data: Date): string {
  return data.toLocaleDateString("pt-BR");
}

function formatarCpf(cpf: string): string {
  return cpf.length === 11 ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : cpf;
}

/**
 * Gera o mesmo documento de protesto (ver `documento-protesto.generator.ts`)
 * diretamente em PDF — layout equivalente ao .docx: título, credor, devedor,
 * curso, tabela de parcelas (Vencimento/Valor Bruto/Multa/Juros/Total), total
 * consolidado e assinatura.
 */
export async function gerarDocumentoProtestoPdf(dados: DadosDocumentoProtesto): Promise<Buffer> {
  const credor = process.env.INSTITUICAO_NOME ?? "[Nome da Instituição]";
  const cnpjCredor = process.env.INSTITUICAO_CNPJ ?? "[CNPJ da Instituição]";
  const totalConsolidado = dados.parcelas.reduce((soma, p) => soma + p.total, 0);

  const doc = new PDFDocument({ size: "A4", margin: 56 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finalizado = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.font(FONTE_NEGRITO).fontSize(TAMANHO + 3).text("PLANILHA PARA PROTESTO DE CONTRATO");
  doc.moveDown();

  doc.font(FONTE_NEGRITO).fontSize(TAMANHO).text("NOME DO CREDOR: ", { continued: true });
  doc.font(FONTE).text(credor);
  doc.font(FONTE).text(`CNPJ/CPF: ${cnpjCredor}`);
  doc.moveDown();

  doc.font(FONTE_NEGRITO).text("NOME DO DEVEDOR: ", { continued: true });
  doc.font(FONTE).text(dados.alunoNome);
  doc.font(FONTE_NEGRITO).text("CNPJ/CPF: ", { continued: true });
  doc.font(FONTE).text(formatarCpf(dados.alunoCpf));
  doc.font(FONTE_NEGRITO).text("CAMPUS/CURSO: ", { continued: true });
  doc.font(FONTE).text(dados.cursoNome);
  doc.moveDown();

  const colunas = ["Vencimento", "Valor Bruto", "Multa", "Juros", "Total"];
  const larguraTabela = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const larguraColuna = larguraTabela / colunas.length;
  const inicioX = doc.page.margins.left;

  function linha(valores: string[], negrito: boolean, y: number): void {
    doc.font(negrito ? FONTE_NEGRITO : FONTE).fontSize(TAMANHO);
    valores.forEach((valor, indice) => {
      doc.text(valor, inicioX + indice * larguraColuna, y, {
        width: larguraColuna,
        align: indice === 0 ? "left" : "right",
      });
    });
  }

  let y = doc.y;
  linha(colunas, true, y);
  y += 18;
  doc
    .moveTo(inicioX, y - 4)
    .lineTo(inicioX + larguraTabela, y - 4)
    .stroke();

  for (const parcela of dados.parcelas) {
    linha(
      [
        formatarData(parcela.vencimento),
        formatarMoeda(parcela.valorBruto),
        formatarMoeda(parcela.multa),
        formatarMoeda(parcela.juros),
        formatarMoeda(parcela.total),
      ],
      false,
      y,
    );
    y += 18;
  }

  linha(
    [
      "Total",
      "......................",
      "......................",
      "......................",
      formatarMoeda(totalConsolidado),
    ],
    true,
    y,
  );
  y += 32;

  doc.font(FONTE).fontSize(TAMANHO).text(`Vitória-ES, ${formatarData(new Date())}.`, inicioX, y, {
    width: larguraTabela,
    align: "right",
  });

  doc.text("________________________________________", inicioX, y + 48, {
    width: larguraTabela,
    align: "center",
  });

  doc.end();
  return finalizado;
}
