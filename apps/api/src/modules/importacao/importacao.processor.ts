import { MapeamentoImportacao, SituacaoCobranca, StatusParcela, TabelaDestinoImportacao } from "@prisma/client";
import { normalizarCpf, validarCpf } from "../../shared/utils/cpf";
import { alunosRepository } from "../alunos/alunos.repository";
import { cursosRepository } from "../cursos/cursos.repository";
import { matriculasRepository } from "../matriculas/matriculas.repository";
import { financeiroRepository } from "../financeiro/financeiro.repository";
import { mapeamentoImportacaoRepository } from "../mapeamento-importacao/mapeamento-importacao.repository";
import { tipoDoCampo } from "../mapeamento-importacao/mapeamento-importacao.constants";
import { situacoesRepository } from "../cobranca/situacoes.repository";
import { historicoRepository } from "../cobranca/historico.repository";
import type { ErroImportacao, LinhaImportacaoValida } from "./importacao.parser";
import type { LinhaPlanilha } from "./importacao.schema";

// Mesmo nome/cor/ordem já usados em geracao-word.worker.ts para a situação
// "PENDENTE" criada automaticamente — mantém consistência entre os dois
// pontos que a semeiam (auto-cura, mesmo padrão de obterOuCriarPorNome).
const SITUACAO_PENDENTE = "PENDENTE";

export interface ResultadoProcessamento {
  novosAlunos: number;
  alunosAtualizados: number;
  parcelasNovas: number;
  parcelasAtualizadas: number;
  erros: ErroImportacao[];
}

// Formato "achatado" (escalares simples) do resultado de resolverCamposDinamicos
// — evita colidir com os tipos *UpdateInput do Prisma (que aceitam operações
// como StringFieldUpdateOperationsInput além do valor puro).
interface CamposAlunoDinamicos {
  tipoPessoa?: string;
  email?: string;
  telefone1?: string;
  telefone2?: string;
  cep?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
}

interface CamposMatriculaDinamicos {
  dataMatricula?: Date;
  contratoAssinado?: boolean;
  numeroMatricula?: string;
  observacoes?: string;
}

interface CamposParcelaDinamicos {
  tipoTitulo?: string;
  observacoes?: string;
  valorOrigemComJurosEMulta?: number;
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

/** Como paraNumero, mas retorna undefined em vez de NaN para valor ausente/inválido
 * (campos complementares opcionais não podem gravar NaN num Decimal do Prisma). */
function paraNumeroOpcional(valor: unknown): number | undefined {
  if (valor === undefined || valor === null) return undefined;
  const numero = paraNumero(valor);
  return Number.isNaN(numero) ? undefined : numero;
}

/**
 * Resolve os campos complementares configurados em MapeamentoImportacao para
 * a tabela indicada, aplicando a ação configurada quando a coluna não existe
 * (ou vem vazia) na planilha: VALOR_PADRAO usa `valorPadrao`, NAO_IMPORTAR
 * simplesmente deixa o campo de fora (não sobrescreve valor existente).
 */
function resolverCamposDinamicos(
  tabela: TabelaDestinoImportacao,
  linha: Record<string, unknown>,
  mapeamentos: MapeamentoImportacao[],
): Record<string, unknown> {
  const resultado: Record<string, unknown> = {};

  for (const mapeamento of mapeamentos) {
    if (mapeamento.tabelaDestino !== tabela) continue;

    const tipo = tipoDoCampo(tabela, mapeamento.campoDestino);
    if (!tipo) continue; // campo desconhecido (planilha antiga) — ignora

    const bruto = linha[mapeamento.colunaPlanilha];
    const vazio = bruto === undefined || bruto === null || String(bruto).trim() === "";

    if (vazio && mapeamento.acaoAusente !== "VALOR_PADRAO") continue;

    const valorBruto = vazio ? mapeamento.valorPadrao : bruto;
    if (tipo === "data") resultado[mapeamento.campoDestino] = paraData(valorBruto);
    else if (tipo === "booleano") resultado[mapeamento.campoDestino] = paraBooleano(valorBruto);
    else if (tipo === "numero") resultado[mapeamento.campoDestino] = paraNumeroOpcional(valorBruto);
    else resultado[mapeamento.campoDestino] = paraTexto(valorBruto);
  }

  return resultado;
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
  usuarioId: string,
  aoProgredir?: (percentual: number) => Promise<void> | void,
): Promise<ResultadoProcessamento> {
  const resultado: ResultadoProcessamento = {
    novosAlunos: 0,
    alunosAtualizados: 0,
    parcelasNovas: 0,
    parcelasAtualizadas: 0,
    erros: [],
  };

  const mapeamentos = await mapeamentoImportacaoRepository.listarAtivos();
  // Resolvida uma única vez para o lote inteiro (não por linha) — decisão do
  // usuário, 2026-07-09: matrícula importada sem situação de cobrança
  // definida entra automaticamente como "Pendente".
  const situacaoPendente = await situacoesRepository.obterOuCriarPorNome(SITUACAO_PENDENTE, {
    cor: "#FAEEDA",
    ordem: 10,
    ativa: true,
    participaNovosRelatorios: true,
  });

  for (let indice = 0; indice < linhas.length; indice++) {
    const { linha, dados } = linhas[indice];
    try {
      await processarLinha(dados, resultado, mapeamentos, situacaoPendente, usuarioId);
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
  mapeamentos: MapeamentoImportacao[],
  situacaoPendente: SituacaoCobranca,
  usuarioId: string,
): Promise<void> {
  const linhaBruta = dados as unknown as Record<string, unknown>;
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
  // preserva histórico (PRD seção 7). Os campos de contato/endereço são
  // resolvidos via MapeamentoImportacao (tela de Configurações), não fixos. ---
  const alunoExistente = await alunosRepository.findByCpf(cpfDigitos);
  const dadosAluno = {
    nome: dados.NOME.trim(),
    ...(resolverCamposDinamicos("ALUNO", linhaBruta, mapeamentos) as CamposAlunoDinamicos),
  };

  const aluno = alunoExistente
    ? await alunosRepository.update(alunoExistente.id, dadosAluno)
    : await alunosRepository.create({ cpf: cpfDigitos, ...dadosAluno });

  if (alunoExistente) resultado.alunosAtualizados++;
  else resultado.novosAlunos++;

  // --- Curso: quando a planilha traz ID_CURSO (identificador do sistema de
  // origem — planilha real, 2026-07-09), localizamos por ele primeiro
  // (Curso.codigo), mais confiável que casar por nome (evita duplicar curso
  // por variação de digitação). Sem ID_CURSO (planilhas antigas), cai no
  // comportamento anterior: localizado pelo nome, cria automaticamente
  // quando não encontrado (decisão registrada em docs/PENDENCIAS.md). ---
  const nomeCurso = dados.CURSO.trim();
  const idCursoPlanilha = paraTexto((dados as unknown as Record<string, unknown>).ID_CURSO);
  const curso =
    (idCursoPlanilha ? await cursosRepository.findByCodigo(idCursoPlanilha) : null) ??
    (await cursosRepository.findByNome(nomeCurso)) ??
    (await cursosRepository.create({
      codigo: idCursoPlanilha || gerarCodigoCurso(nomeCurso),
      nome: nomeCurso,
    }));

  // --- Matrícula: a planilha não traz número de matrícula, então localizamos
  // pelo par aluno+curso (PRD seção 21: "Localiza Curso → Atualiza/Cria
  // Matrícula"). ---
  const matricula =
    (await matriculasRepository.findByAlunoECurso(aluno.id, curso.id)) ??
    (await matriculasRepository.create({
      aluno: { connect: { id: aluno.id } },
      curso: { connect: { id: curso.id } },
      ...(resolverCamposDinamicos("MATRICULA", linhaBruta, mapeamentos) as CamposMatriculaDinamicos),
    }));

  // Decisão do usuário, 2026-07-09: matrícula sem situação de cobrança
  // definida (nova ou já existente) entra como "Pendente" — nunca sobrescreve
  // uma situação já atribuída manualmente.
  if (!matricula.situacaoCobrancaId) {
    await matriculasRepository.update(matricula.id, {
      situacaoCobranca: { connect: { id: situacaoPendente.id } },
    });
    await historicoRepository.registrar(
      matricula.id,
      usuarioId,
      `Situação alterada para "${situacaoPendente.nome}" (importação)`,
    );
  }

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
    ...(resolverCamposDinamicos("PARCELA", linhaBruta, mapeamentos) as CamposParcelaDinamicos),
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
