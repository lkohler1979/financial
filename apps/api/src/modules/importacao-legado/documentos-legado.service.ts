import { NotFoundError, ValidationError } from "../../shared/errors/app-error";
import { armazenamento } from "../../shared/armazenamento/armazenamento";
import { formatarCpf, normalizarCpf } from "../../shared/utils/cpf";
import { alunosRepository } from "../alunos/alunos.repository";
import { registrarAuditoria } from "../auditoria/auditoria.service";
import { documentacaoService } from "../documentos/documentacao.service";
import { documentosRepository } from "../documentos/documentos.repository";
import type {
  LegadoClient,
  LegadoDocumentoAluno,
  LegadoTipoDocumento,
} from "../sincronizacao-legado/legado-client";
import { montarClient } from "../sincronizacao-legado/sincronizacao-legado.service";

type ClienteLegado = Pick<
  LegadoClient,
  "buscarPessoaPorCpf" | "listarTiposDocumento" | "buscarDocumentoAluno" | "baixarArquivo"
>;
type TipoDocumento = NonNullable<Awaited<ReturnType<typeof documentosRepository.findTipo>>>;

export type ResultadoDocumento =
  | "BAIXADO" // arquivo baixado e documento criado/atualizado no Ethos
  | "JA_IMPORTADO" // o mesmo arquivo já está no Ethos
  | "MANTIDO_ETHOS" // já há outro arquivo no Ethos — não é substituído
  | "SEM_DOCUMENTO" // o aluno não entregou esse tipo no legado
  | "SEM_ARQUIVO" // há registro no legado, mas sem arquivo anexado
  | "ERRO";

export interface ItemDocumentoLegado {
  tipo: string;
  resultado: ResultadoDocumento;
  arquivo: string | null;
  bytes: number | null;
  /** Situação no Ethos depois da importação (PENDENTE | DEFERIDO | INDEFERIDO). */
  situacao: string | null;
  detalhe: string | null;
}

export interface ResumoDocumentosLegado {
  aluno: { id: string; nome: string; cpf: string };
  baixados: number;
  jaImportados: number;
  mantidos: number;
  semDocumento: number;
  erros: number;
  itens: ItemDocumentoLegado[];
}

/** Nome comparável: sem acento, caixa ou espaços repetidos. */
function normalizar(nome: string): string {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** "2021-06-22 18:50:30" (ou só a data) → Date local; null se não houver/for inválida. */
export function parseDataHoraLegado(valor: string | null): Date | null {
  const m = valor?.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const data = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  return Number.isNaN(data.getTime()) ? null : data;
}

function situacaoDeferimento(situacao: string): "PENDENTE" | "DEFERIDO" | "INDEFERIDO" {
  const s = normalizar(situacao);
  if (s === "deferido") return "DEFERIDO";
  if (s === "indeferido") return "INDEFERIDO";
  return "PENDENTE";
}

function observacaoInterna(doc: LegadoDocumentoAluno): string {
  const origem = [
    "Importado do sistema legado",
    doc.deferido && doc.validador ? `deferido por ${doc.validador} em ${doc.deferido}` : null,
  ]
    .filter(Boolean)
    .join(" — ");
  return [doc.obsInterna, origem].filter(Boolean).join("\n");
}

const mensagemDe = (erro: unknown) => (erro instanceof Error ? erro.message : "erro desconhecido");

export const documentosLegadoService = {
  /**
   * Busca no legado os documentos pessoais do aluno (CPF, RG, comprovante de residência…) e baixa
   * os arquivos para a pasta de documentos (`apps/documentos`), criando/atualizando o Documento do
   * aluno com situação, datas e observações do legado. É seguro repetir: o mesmo arquivo não é
   * baixado de novo e um arquivo que já exista no Ethos nunca é substituído.
   */
  async importarDoAluno(
    alunoId: string,
    usuarioId: string,
    cliente?: ClienteLegado,
  ): Promise<ResumoDocumentosLegado> {
    try {
      return await this.baixarDoAluno(alunoId, usuarioId, cliente);
    } finally {
      // Qualquer que seja o resultado (baixou, não achou nada, legado fora do ar), a situação da
      // documentação das matrículas do aluno é conferida: pode ser "sem documentos", "pendentes"
      // ou "completa". Falha aqui não esconde o resultado da busca.
      try {
        await documentacaoService.recalcularAluno(alunoId);
      } catch {
        // Só a conferência da situação falhou; o resultado da busca segue.
      }
    }
  },

  async baixarDoAluno(
    alunoId: string,
    usuarioId: string,
    cliente?: ClienteLegado,
  ): Promise<ResumoDocumentosLegado> {
    const aluno = await alunosRepository.findById(alunoId);
    if (!aluno) throw new NotFoundError("Aluno não encontrado");
    const cpf = normalizarCpf(aluno.cpf);
    if (cpf.length !== 11)
      throw new ValidationError("O aluno não tem um CPF válido para buscar no legado");

    const legado = cliente ?? (await montarClient());
    const pessoas = await legado.buscarPessoaPorCpf(formatarCpf(cpf));
    if (pessoas.length === 0)
      throw new NotFoundError("Aluno não encontrado no sistema legado pelo CPF");
    const { pesId, alunoId: alunoLegadoId } = pessoas[0];

    const tiposEthos = await documentosRepository.listarTodosTipos();
    const itens: ItemDocumentoLegado[] = [];
    for (const tipo of await legado.listarTiposDocumento(pesId)) {
      try {
        itens.push(await this.importarTipo(legado, aluno.id, alunoLegadoId, tipo, tiposEthos));
      } catch (erro) {
        itens.push({
          tipo: tipo.descricao,
          resultado: "ERRO",
          arquivo: null,
          bytes: null,
          situacao: null,
          detalhe: mensagemDe(erro),
        });
      }
    }

    const contar = (r: ResultadoDocumento) => itens.filter((i) => i.resultado === r).length;
    const resumo: ResumoDocumentosLegado = {
      aluno: { id: aluno.id, nome: aluno.nome, cpf: formatarCpf(cpf) },
      baixados: contar("BAIXADO"),
      jaImportados: contar("JA_IMPORTADO"),
      mantidos: contar("MANTIDO_ETHOS"),
      semDocumento: contar("SEM_DOCUMENTO") + contar("SEM_ARQUIVO"),
      erros: contar("ERRO"),
      itens,
    };
    await registrarAuditoria({
      usuarioId,
      entidade: "Aluno",
      entidadeId: aluno.id,
      acao: "ATUALIZACAO",
      detalhes: {
        acao: "documentos_importados_do_legado",
        baixados: resumo.baixados,
        jaImportados: resumo.jaImportados,
        mantidos: resumo.mantidos,
        semDocumento: resumo.semDocumento,
        erros: resumo.erros,
      },
    });
    return resumo;
  },

  async importarTipo(
    legado: ClienteLegado,
    alunoId: string,
    alunoLegadoId: string,
    tipoLegado: LegadoTipoDocumento,
    tiposEthos: TipoDocumento[],
  ): Promise<ItemDocumentoLegado> {
    const base = {
      tipo: tipoLegado.descricao,
      arquivo: null,
      bytes: null,
      situacao: null,
      detalhe: null,
    };
    const doc = await legado.buscarDocumentoAluno(alunoLegadoId, tipoLegado);
    if (!doc) return { ...base, resultado: "SEM_DOCUMENTO" };
    if (doc.arquivos.length === 0) {
      return {
        ...base,
        resultado: "SEM_ARQUIVO",
        detalhe: "Há registro no legado, mas sem arquivo anexado",
      };
    }

    // Vários arquivos no mesmo documento: fica o mais recente (maior id); o Ethos guarda um por tipo.
    const arquivo = doc.arquivos.reduce((a, b) => (Number(b.id) > Number(a.id) ? b : a));
    const extras = doc.arquivos.length - 1;
    const aviso =
      extras > 0
        ? `O legado tem ${extras} arquivo(s) mais antigo(s) neste documento; importado só o mais recente`
        : null;

    // Tipo do Ethos com o mesmo nome (sem acento/caixa); se não existir, cria como tipo de aluno.
    let tipo = tiposEthos.find((t) => normalizar(t.nome) === normalizar(tipoLegado.descricao));
    let tipoCriado = false;
    if (!tipo) {
      tipo = await documentosRepository.criarTipo({
        nome: tipoLegado.descricao,
        escopo: "ALUNO",
        obrigatorio: false,
        ordem: 100,
      });
      tiposEthos.push(tipo);
      tipoCriado = true;
    }
    if (tipo.escopo !== "ALUNO") {
      return {
        ...base,
        resultado: "ERRO",
        detalhe: `O tipo "${tipo.nome}" do Ethos é por matrícula, não por aluno`,
      };
    }

    const existente = await documentosRepository.findPorTipo(tipo.id, alunoId, null);
    if (existente?.arquivoChave) {
      const mesmo =
        existente.arquivoNome === arquivo.nome && existente.arquivoTamanho === arquivo.tamanho;
      return {
        ...base,
        resultado: mesmo ? "JA_IMPORTADO" : "MANTIDO_ETHOS",
        arquivo: existente.arquivoNome,
        bytes: existente.arquivoTamanho,
        situacao: existente.situacaoDeferimento,
        detalhe: mesmo ? null : "Já existe outro arquivo deste tipo no Ethos — não foi substituído",
      };
    }

    const conteudo = await legado.baixarArquivo(arquivo.chave, arquivo.tamanho);
    const nome = arquivo.nome || `${tipoLegado.descricao}.pdf`;
    const chave = await armazenamento.salvar(alunoId, nome, conteudo);
    const dados = {
      arquivoNome: nome,
      arquivoChave: chave,
      arquivoMime: arquivo.mime || "application/octet-stream",
      arquivoTamanho: conteudo.length,
      situacaoEntrega: "ENVIADO" as const,
      anexadoEm: parseDataHoraLegado(doc.submissao) ?? new Date(),
      anexadoIp: null,
      anexadoPorAluno: false,
      situacaoDeferimento: situacaoDeferimento(doc.situacao),
      deferidoEm: parseDataHoraLegado(doc.deferido),
      vencimento: parseDataHoraLegado(doc.vencimento),
      observacaoInterna: observacaoInterna(doc),
      observacaoAluno: doc.obsAluno,
    };
    try {
      if (existente) await documentosRepository.update(existente.id, dados);
      else
        await documentosRepository.create({
          ...dados,
          tipoDocumentoId: tipo.id,
          alunoId,
          matriculaId: null,
        });
    } catch (erro) {
      await armazenamento.remover(chave); // não deixa arquivo órfão se o banco recusar
      throw erro;
    }

    return {
      tipo: tipoLegado.descricao,
      resultado: "BAIXADO",
      arquivo: nome,
      bytes: conteudo.length,
      situacao: dados.situacaoDeferimento,
      detalhe:
        [tipoCriado ? "Tipo de documento criado no Ethos" : null, aviso]
          .filter(Boolean)
          .join(" · ") || null,
    };
  },
};
