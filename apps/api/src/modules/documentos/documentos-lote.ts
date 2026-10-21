import path from "node:path";

export interface DocumentoParaLote {
  id: string;
  arquivoNome: string | null;
  arquivoChave: string | null;
  tipo: { nome: string };
  aluno: { nome: string; codigo: string | null };
  matricula: { numeroMatricula: string | null } | null;
}

/** Tira o que o Windows/zip não aceitam em nomes de arquivo e pasta. */
function limpar(texto: string): string {
  return (
    texto
      .replace(/[<>:"/\\|?*]/g, " ")
      .split("")
      .map((c) => (c.charCodeAt(0) < 32 ? " " : c))
      .join("")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/, "")
      .slice(0, 80) || "sem-nome"
  );
}

/**
 * Nome de cada arquivo dentro do ZIP: `Aluno/Matrícula N/Tipo - arquivo.ext` (documento de aluno,
 * sem matrícula, fica direto na pasta do aluno). Nomes repetidos ganham " (2)", " (3)"…
 */
export function nomesNoZip(documentos: DocumentoParaLote[]): Map<string, string> {
  const usados = new Set<string>();
  const nomes = new Map<string, string>();
  for (const d of documentos) {
    const pastaAluno = limpar(`${d.aluno.codigo ? `${d.aluno.codigo} - ` : ""}${d.aluno.nome}`);
    const pasta = d.matricula
      ? `${pastaAluno}/Matrícula ${limpar(d.matricula.numeroMatricula ?? "sem número")}`
      : pastaAluno;
    const original = d.arquivoNome ?? "arquivo";
    const extensao = path.extname(original);
    const base = limpar(`${d.tipo.nome} - ${path.basename(original, extensao)}`);
    let nome = `${pasta}/${base}${extensao}`;
    for (let n = 2; usados.has(nome.toLowerCase()); n++)
      nome = `${pasta}/${base} (${n})${extensao}`;
    usados.add(nome.toLowerCase());
    nomes.set(d.id, nome);
  }
  return nomes;
}
