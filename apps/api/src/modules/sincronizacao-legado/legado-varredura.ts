import type { LegadoPessoaCurso } from "./legado-client";

/** O legado devolve no máximo 40 linhas por consulta de nome; 40 = "pode ter mais". */
export const TETO_RESULTADOS_LEGADO = 40;

const LETRAS = "abcdefghijklmnopqrstuvwxyz".split("");
// Começos possíveis de nome: letras e dígitos (razão social "3M ...").
const INICIAIS = [...LETRAS, ...("0123456789".split(""))];
// Próximo caractere ao expandir um prefixo cheio: letras e espaço (nome composto). Apóstrofo e
// hífen ("D'Ávila", "Ana-Maria") só nos dois primeiros níveis, onde a busca é mais larga.
const PROFUNDIDADE_PONTUACAO = 2;
const PROFUNDIDADE_MAXIMA = 20;

export interface ProgressoVarredura {
  consultas: number;
  pessoas: number;
}

export interface ResultadoVarredura {
  /** pesId → linhas (1 por curso do aluno) */
  pessoas: Map<string, LegadoPessoaCurso[]>;
  consultas: number;
  /** Prefixos que continuaram cheios na profundidade máxima (podem ter pessoas fora da lista). */
  truncados: string[];
}

function expansoes(prefixo: string): string[] {
  const proximos = [...LETRAS];
  if (!prefixo.endsWith(" ")) proximos.push(" ");
  if (prefixo.length <= PROFUNDIDADE_PONTUACAO) proximos.push("'", "-");
  return proximos.map((c) => prefixo + c);
}

/**
 * Lista todas as pessoas do legado usando só a busca por prefixo do nome (limitada a 40 linhas):
 * começa por a–z/0–9 e, sempre que uma consulta volta cheia, desce um nível (`ma` → `maa`…`maz`,
 * `ma `). Prefixos que voltam com menos de 40 linhas estão completos. Remove duplicatas por
 * `pesId`/curso, então rodar duas vezes o mesmo prefixo não polui o resultado.
 *
 * `limite` interrompe a varredura quando já houver essa quantidade de pessoas (testes).
 */
export async function varrerPessoasDoLegado(
  buscar: (prefixo: string) => Promise<LegadoPessoaCurso[]>,
  opcoes: { limite?: number; onProgresso?: (p: ProgressoVarredura) => void | Promise<void> } = {},
): Promise<ResultadoVarredura> {
  const pessoas = new Map<string, LegadoPessoaCurso[]>();
  const truncados: string[] = [];
  const fila = [...INICIAIS];
  let consultas = 0;

  while (fila.length > 0) {
    const prefixo = fila.shift() as string;
    const linhas = await buscar(prefixo);
    consultas += 1;

    for (const linha of linhas) {
      if (!linha.pesId) continue;
      const lista = pessoas.get(linha.pesId) ?? [];
      if (!lista.some((l) => l.alunocursoId === linha.alunocursoId)) lista.push(linha);
      pessoas.set(linha.pesId, lista);
    }

    if (linhas.length >= TETO_RESULTADOS_LEGADO) {
      if (prefixo.length >= PROFUNDIDADE_MAXIMA) truncados.push(prefixo);
      else fila.push(...expansoes(prefixo));
    }

    await opcoes.onProgresso?.({ consultas, pessoas: pessoas.size });
    if (opcoes.limite && pessoas.size >= opcoes.limite) break;
  }

  return { pessoas, consultas, truncados };
}
