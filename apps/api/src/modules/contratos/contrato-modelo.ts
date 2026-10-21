import JSZip from "jszip";

/** Campos que o modelo (.docx) pode usar, escritos entre colchetes: [NOMEALUNO], [CPF], … */
export const CAMPOS_CONTRATO: { campo: string; descricao: string }[] = [
  { campo: "NOMEALUNO", descricao: "Nome do aluno" },
  { campo: "CPF", descricao: "CPF do aluno" },
  { campo: "RG", descricao: "Documento de identificação do aluno" },
  { campo: "DATANASCIMENTO", descricao: "Data de nascimento do aluno" },
  { campo: "EMAIL", descricao: "E-mail do aluno" },
  { campo: "TELEFONE", descricao: "Telefone do aluno" },
  { campo: "ENDERECO", descricao: "Endereço completo do aluno" },
  { campo: "CEP", descricao: "CEP do aluno" },
  { campo: "BAIRRO", descricao: "Bairro do aluno" },
  { campo: "CIDADE", descricao: "Cidade do aluno" },
  { campo: "ESTADO", descricao: "UF do aluno" },
  { campo: "NOMECONTRATANTE", descricao: "Nome de quem assina (sacado, ou o aluno)" },
  { campo: "CPFCNPJCONTRATANTE", descricao: "CPF/CNPJ de quem assina" },
  { campo: "EMAILCONTRATANTE", descricao: "E-mail de quem assina" },
  { campo: "ENDERECOCONTRATANTE", descricao: "Endereço de quem assina" },
  { campo: "CURSO", descricao: "Nome do curso" },
  { campo: "CODIGOCURSO", descricao: "Código do curso" },
  { campo: "NUMEROMATRICULA", descricao: "Número da matrícula" },
  { campo: "DATAMATRICULA", descricao: "Data da matrícula" },
  { campo: "VALORCURSO", descricao: "Valor total do curso (R$)" },
  { campo: "NUMEROPARCELAS", descricao: "Quantidade de parcelas" },
  { campo: "VALORPARCELA", descricao: "Valor da primeira parcela (R$)" },
  { campo: "DIAVENCIMENTO", descricao: "Dia de vencimento das parcelas" },
  { campo: "PRIMEIROVENCIMENTO", descricao: "Vencimento da primeira parcela" },
  { campo: "DATAATUAL", descricao: "Data de geração do contrato (dd/mm/aaaa)" },
  { campo: "DATAATUALEXTENSO", descricao: "Data de geração por extenso" },
  { campo: "NOMEESCOLA", descricao: "Representante da escola (Configurações)" },
  { campo: "CNPJESCOLA", descricao: "CNPJ da escola (Configurações)" },
];

const PARTES_COM_TEXTO = /^word\/(document|header\d*|footer\d*)\.xml$/;
const REGEX_CAMPO = /\[([A-Za-z0-9_]+)\]/g;

function escaparXml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function desescaparXml(texto: string): string {
  return texto
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Troca os campos [XXX] de um parágrafo. O Word costuma quebrar um mesmo texto em vários trechos
 * (`<w:t>`), então os campos são localizados no texto do parágrafo inteiro: o valor entra no
 * trecho onde o campo começa e o restante do campo é removido dos trechos seguintes.
 */
function substituirNoParagrafo(
  xml: string,
  valores: Record<string, string>,
  naoEncontrados: Set<string>,
): string {
  const regexTexto = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  const trechos: { inicio: number; fim: number; texto: string }[] = [];
  for (let m = regexTexto.exec(xml); m; m = regexTexto.exec(xml)) {
    const inicio = m.index + m[0].indexOf(">") + 1;
    trechos.push({ inicio, fim: inicio + m[1].length, texto: desescaparXml(m[1]) });
  }
  const completo = trechos.map((t) => t.texto).join("");
  if (!completo.includes("[")) return xml;

  const novos = trechos.map((t) => t.texto);
  let acumulado = 0;
  const limites = trechos.map((t) => {
    const lim = { ini: acumulado, fim: acumulado + t.texto.length };
    acumulado = lim.fim;
    return lim;
  });

  // De trás para frente, para não deslocar a posição dos campos anteriores.
  const mudou = new Set<number>();
  for (const achado of [...completo.matchAll(REGEX_CAMPO)].reverse()) {
    const chave = achado[1].toUpperCase();
    if (!(chave in valores)) {
      naoEncontrados.add(achado[1]);
      continue;
    }
    const ini = achado.index as number;
    const fim = ini + achado[0].length;
    let primeiro = true;
    limites.forEach((lim, i) => {
      const de = Math.max(ini, lim.ini);
      const ate = Math.min(fim, lim.fim);
      if (de >= ate) return;
      novos[i] =
        novos[i].slice(0, de - lim.ini) +
        (primeiro ? valores[chave] : "") +
        novos[i].slice(ate - lim.ini);
      primeiro = false;
      mudou.add(i);
    });
  }

  let resultado = xml;
  for (let i = trechos.length - 1; i >= 0; i--) {
    if (!mudou.has(i)) continue;
    const t = trechos[i];
    resultado = resultado.slice(0, t.inicio) + escaparXml(novos[i]) + resultado.slice(t.fim);
    // Preserva espaços no começo/fim do valor.
    const abertura = resultado.lastIndexOf("<w:t", t.inicio);
    if (!/xml:space/.test(resultado.slice(abertura, t.inicio))) {
      resultado =
        resultado.slice(0, abertura) + '<w:t xml:space="preserve">' + resultado.slice(t.inicio);
    }
  }
  return resultado;
}

/** Preenche o modelo .docx e devolve o arquivo novo, com a lista de campos desconhecidos. */
export async function preencherModeloDocx(
  modelo: Buffer,
  valores: Record<string, string>,
): Promise<{ arquivo: Buffer; naoEncontrados: string[] }> {
  const zip = await JSZip.loadAsync(modelo);
  const naoEncontrados = new Set<string>();
  const normalizados = Object.fromEntries(
    Object.entries(valores).map(([k, v]) => [k.toUpperCase(), v]),
  );

  for (const nome of Object.keys(zip.files)) {
    if (!PARTES_COM_TEXTO.test(nome)) continue;
    const xml = await (zip.file(nome) as JSZip.JSZipObject).async("string");
    zip.file(
      nome,
      xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (p) =>
        substituirNoParagrafo(p, normalizados, naoEncontrados),
      ),
    );
  }

  return {
    arquivo: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
    naoEncontrados: [...naoEncontrados],
  };
}

/** Confere se o arquivo é um .docx (zip com word/document.xml). */
export async function ehDocx(arquivo: Buffer): Promise<boolean> {
  try {
    const zip = await JSZip.loadAsync(arquivo);
    return Boolean(zip.file("word/document.xml"));
  } catch {
    return false;
  }
}
