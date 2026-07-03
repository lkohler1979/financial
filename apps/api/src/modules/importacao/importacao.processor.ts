import { StatusParcela } from "@prisma/client";
import { normalizarCpf, validarCpf } from "../../shared/utils/cpf";
import { alunosRepository } from "../alunos/alunos.repository";
import { cursosRepository } from "../cursos/cursos.repository";
import { matriculasRepository } from "../matriculas/matriculas.repository";
import { financeiroRepository } from "../financeiro/financeiro.repository";
import type { ErroImportacao, LinhaImportacaoValida } from "./importacao.parser";
import type { LinhaPlanilha } from "./importacao.schema";

export interface ResultadoProcessamento {
  novosAlunos: number;
  alunosAtualizados: number;
  parcelasNovas: number;
  parcelasAtualizadas: number;
  erros: ErroImportacao[];
}

function paraTexto(valor: unknown): string | undefined {
  if (valor === undefined || valor === null) return undefined;
  const texto = String(valor).trim();
  return texto.length > 0 ? texto : undefined;
}

function paraData(valor: unknown): Date | undefined {
  if (valor instanceof Date) return valor;
  const texto = paraTexto(valor);
  if (!texto) return undefined;

  // Planilhas brasileiras costumam trazer DD/MM/AAAA em vez de ISO.
  const partesBr = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (partesBr) {
    const [, dia, mes, ano] = partesBr;
    return new Date(Number(ano), Number(mes) - 1, Number(dia));
  }

  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? undefined : data;
}

function paraNumero(valor: unknown): number {
  if (typeof valor === "number") return valor;
  // Aceita formato brasileiro (1.234,56) além do formato com ponto decimal.
  const texto = String(valor).trim().replace(/\./g, "").replace(",", ".");
  return Number(texto);
}

function paraBooleano(valor: unknown): boolean {
  const texto = paraTexto(valor)?.toLowerCase();
  return texto === "sim" || texto === "true" || texto === "1" || texto === "s";
}

/** Gera um código inicial legível para cursos criados automaticamente na importação. */
function gerarCodigoCurso(nome: string): string {
  const slug = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos (marcas de combinação)
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase()
    .slice(0, 30);
  return `${slug || "CURSO"}-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Processa as linhas já validadas estruturalmente, aplicando o fluxo do PRD
 * seção 21 (localiza/cria Aluno → localiza/cria Curso → localiza/cria
 * Matrícula → importa Parcela), sem nunca excluir registros existentes
 * (PRD seção 12).
 */
export async function processarLinhasImportacao(
  linhas: LinhaImportacaoValida[],
  aoProgredir?: (percentual: number) => Promise<void> | void,
): Promise<ResultadoProcessamento> {
  const resultado: ResultadoProcessamento = {
    novosAlunos: 0,
    alunosAtualizados: 0,
    parcelasNovas: 0,
    parcelasAtualizadas: 0,
    erros: [],
  };

  for (let indice = 0; indice < linhas.length; indice++) {
    const { linha, dados } = linhas[indice];
    try {
      await processarLinha(dados, resultado);
    } catch (err) {
      resultado.erros.push({
        linha,
        mensagem: err instanceof Error ? err.message : "Erro desconhecido ao processar a linha",
      });
    }

    if (aoProgredir) {
      await aoProgredir(Math.round(((indice + 1) / linhas.length) * 100));
    }
  }

  return resultado;
}

async function processarLinha(
  dados: LinhaPlanilha,
  resultado: ResultadoProcessamento,
): Promise<void> {
  const cpfDigitos = normalizarCpf(String(dados.CNPJ_CPF));
  if (cpfDigitos.length === 0) {
    throw new Error("CPF/CNPJ vazio");
  }
  // Só aplicamos o dígito verificador quando o documento tem 11 dígitos (CPF de
  // pessoa física). CNPJ (pessoa jurídica) não é validado por dígito aqui — o
  // schema.prisma não distingue os dois tipos de documento (ver PENDENCIAS.md).
  if (cpfDigitos.length === 11 && !validarCpf(cpfDigitos)) {
    throw new Error(`CPF inválido: ${dados.CNPJ_CPF}`);
  }

  // --- Aluno: localizado pelo CPF/CNPJ; reimportação atualiza dados e
  // preserva histórico (PRD seção 7). ---
  const alunoExistente = await alunosRepository.findByCpf(cpfDigitos);
  const dadosAluno = {
    nome: dados.NOME.trim(),
    tipoPessoa: paraTexto(dados.TP_PESSOA),
    email: paraTexto(dados.EMAIL),
    telefone1: paraTexto(dados.FONE),
    endereco: paraTexto(dados.ENDEREÇO),
  };

  const aluno = alunoExistente
    ? await alunosRepository.update(alunoExistente.id, dadosAluno)
    : await alunosRepository.create({ cpf: cpfDigitos, ...dadosAluno });

  if (alunoExistente) resultado.alunosAtualizados++;
  else resultado.novosAlunos++;

  // --- Curso: localizado pelo nome (a planilha só traz o nome — PRD seção 8).
  // Assunção registrada em docs/PENDENCIAS.md: cria automaticamente quando não
  // encontrado. O padrão deveria ser configurável (Configuracao), mas o módulo
  // de configurações só chega no Sprint 5. ---
  const nomeCurso = dados.CURSO.trim();
  const curso =
    (await cursosRepository.findByNome(nomeCurso)) ??
    (await cursosRepository.create({ codigo: gerarCodigoCurso(nomeCurso), nome: nomeCurso }));

  // --- Matrícula: a planilha não traz número de matrícula, então localizamos
  // pelo par aluno+curso (PRD seção 21: "Localiza Curso → Atualiza/Cria
  // Matrícula"). ---
  const matricula =
    (await matriculasRepository.findByAlunoECurso(aluno.id, curso.id)) ??
    (await matriculasRepository.create({
      aluno: { connect: { id: aluno.id } },
      curso: { connect: { id: curso.id } },
      dataMatricula: paraData(dados.DATA_MATRICULA),
      contratoAssinado: paraBooleano(dados["CONTRATO ASSINADO"]),
    }));

  // --- Parcela: identificada por (matrícula, código do título); existe →
  // atualiza, não existe → insere. Jamais excluída (PRD seção 12). ---
  const codTitulo = String(dados.COD_TITULO).trim();
  const vencimento = paraData(dados.DT_VENCIMENTO);
  if (!vencimento) {
    throw new Error(`Data de vencimento inválida: ${String(dados.DT_VENCIMENTO)}`);
  }

  const dadosParcela = {
    parcela: String(dados.PARCELA).trim(),
    vencimento,
    valor: paraNumero(dados.VALOR),
    tipoTitulo: paraTexto(dados.TIPO_TITULO),
  };

  const parcelaExistente = await financeiroRepository.findByChaveNatural(matricula.id, codTitulo);
  if (parcelaExistente) {
    await financeiroRepository.update(parcelaExistente.id, dadosParcela);
    resultado.parcelasAtualizadas++;
  } else {
    await financeiroRepository.create({
      ...dadosParcela,
      codTitulo,
      status: StatusParcela.EM_ABERTO,
      matricula: { connect: { id: matricula.id } },
    });
    resultado.parcelasNovas++;
  }
}
