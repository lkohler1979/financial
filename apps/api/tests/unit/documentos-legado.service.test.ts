import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  documentosLegadoService,
  parseDataHoraLegado,
} from "../../src/modules/importacao-legado/documentos-legado.service";
import { alunosRepository } from "../../src/modules/alunos/alunos.repository";
import { documentacaoService } from "../../src/modules/documentos/documentacao.service";
import { documentosRepository } from "../../src/modules/documentos/documentos.repository";
import { armazenamento } from "../../src/shared/armazenamento/armazenamento";
import { registrarAuditoria } from "../../src/modules/auditoria/auditoria.service";
import type {
  LegadoDocumentoAluno,
  LegadoPessoaCurso,
  LegadoTipoDocumento,
} from "../../src/modules/sincronizacao-legado/legado-client";

vi.mock("../../src/modules/alunos/alunos.repository", () => ({
  alunosRepository: { findById: vi.fn() },
}));
vi.mock("../../src/modules/documentos/documentos.repository", () => ({
  documentosRepository: {
    listarTodosTipos: vi.fn(),
    criarTipo: vi.fn(),
    findPorTipo: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock("../../src/shared/armazenamento/armazenamento", () => ({
  armazenamento: { salvar: vi.fn(), remover: vi.fn() },
}));
vi.mock("../../src/modules/auditoria/auditoria.service", () => ({ registrarAuditoria: vi.fn() }));
vi.mock("../../src/modules/documentos/documentacao.service", () => ({
  documentacaoService: { recalcularAluno: vi.fn().mockResolvedValue({}) },
}));
vi.mock("../../src/modules/sincronizacao-legado/sincronizacao-legado.service", () => ({
  montarClient: vi.fn(),
}));

const alunos = vi.mocked(alunosRepository);
const docs = vi.mocked(documentosRepository);
const storage = vi.mocked(armazenamento);
const documentacao = vi.mocked(documentacaoService);

const PESSOA = {
  pesId: "00000000046",
  alunoId: "0000000027",
  nome: "Adriano",
} as unknown as LegadoPessoaCurso;

const TIPOS: LegadoTipoDocumento[] = [
  { docgruporegraId: "0000000001", tdocId: "0000000001", descricao: "CPF", chaveGed: "CPF" },
  { docgruporegraId: "0000000002", tdocId: "0000000002", descricao: "RG", chaveGed: "RG" },
  {
    docgruporegraId: "0000000003",
    tdocId: "0000000007",
    descricao: "Comprovante de Residência",
    chaveGed: "COMPROVANTE DE RESIDENCIA",
  },
];

function documento(extra: Partial<LegadoDocumentoAluno> = {}): LegadoDocumentoAluno {
  return {
    situacao: "Deferido",
    submissao: "2021-06-14 17:07:32",
    deferido: "2021-06-22 18:50:30",
    vencimento: null,
    validador: "Jeane Cristina",
    obsInterna: null,
    obsAluno: null,
    arquivos: [
      {
        id: "0000000243",
        nome: "CPF ADRIANO.pdf",
        mime: "application/pdf",
        tamanho: 1000,
        chave: "chave-cpf",
      },
    ],
    ...extra,
  };
}

function legadoFalso(porTipo: Record<string, LegadoDocumentoAluno | null>) {
  return {
    buscarPessoaPorCpf: vi.fn(async () => [PESSOA]),
    listarTiposDocumento: vi.fn(async () => TIPOS),
    buscarDocumentoAluno: vi.fn(
      async (_id: string, tipo: LegadoTipoDocumento) => porTipo[tipo.descricao] ?? null,
    ),
    baixarArquivo: vi.fn(async (_chave: string, tamanho?: number) =>
      Buffer.alloc(tamanho ?? 10, 1),
    ),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  alunos.findById.mockResolvedValue({
    id: "a1",
    nome: "Adriano Silva",
    cpf: "52998224725",
  } as never);
  docs.listarTodosTipos.mockResolvedValue([
    { id: "t-cpf", nome: "CPF", escopo: "ALUNO" },
    { id: "t-rg", nome: "RG", escopo: "ALUNO" },
  ] as never);
  docs.criarTipo.mockImplementation(async (d) => ({ id: "t-novo", ...d }) as never);
  docs.findPorTipo.mockResolvedValue(null);
  docs.create.mockResolvedValue({ id: "d1" } as never);
  storage.salvar.mockResolvedValue("a1/abc.pdf");
});

describe("documentosLegadoService.importarDoAluno — situação da documentação", () => {
  it("recalcula a situação das matrículas do aluno depois de baixar", async () => {
    const legado = legadoFalso({ CPF: documento() });
    await documentosLegadoService.importarDoAluno("a1", "u1", legado as never);
    expect(documentacao.recalcularAluno).toHaveBeenCalledWith("a1");
  });

  it("recalcula também quando o aluno não existe no legado ou o legado falha", async () => {
    const semPessoa = legadoFalso({});
    semPessoa.buscarPessoaPorCpf.mockResolvedValue([]);
    await expect(
      documentosLegadoService.importarDoAluno("a1", "u1", semPessoa as never),
    ).rejects.toThrow(/não encontrado/i);
    expect(documentacao.recalcularAluno).toHaveBeenCalledWith("a1");

    documentacao.recalcularAluno.mockClear();
    const fora = legadoFalso({});
    fora.buscarPessoaPorCpf.mockRejectedValue(new Error("legado fora do ar"));
    await expect(
      documentosLegadoService.importarDoAluno("a1", "u1", fora as never),
    ).rejects.toThrow(/fora do ar/);
    expect(documentacao.recalcularAluno).toHaveBeenCalledWith("a1");
  });

  it("falha no recálculo não esconde o resultado da busca", async () => {
    documentacao.recalcularAluno.mockRejectedValueOnce(new Error("banco"));
    const legado = legadoFalso({ CPF: documento() });
    await expect(
      documentosLegadoService.importarDoAluno("a1", "u1", legado as never),
    ).resolves.toMatchObject({ aluno: { id: "a1" } });
  });
});

describe("documentosLegadoService.importarDoAluno", () => {
  it("baixa os arquivos, cria os documentos com situação/datas do legado e cria o tipo que não existe", async () => {
    const legado = legadoFalso({
      CPF: documento(),
      RG: documento({
        situacao: "Indeferido",
        arquivos: [
          { id: "2", nome: "RG.pdf", mime: "application/pdf", tamanho: 500, chave: "chave-rg" },
        ],
      }),
      "Comprovante de Residência": documento({
        situacao: "Aguardando",
        deferido: null,
        validador: null,
        obsAluno: "Foto ilegível",
        arquivos: [
          { id: "3", nome: "bl.pdf", mime: "application/pdf", tamanho: 70, chave: "chave-res" },
        ],
      }),
    });

    const r = await documentosLegadoService.importarDoAluno("a1", "u1", legado as never);

    expect(legado.buscarPessoaPorCpf).toHaveBeenCalledWith("529.982.247-25");
    expect(legado.listarTiposDocumento).toHaveBeenCalledWith("00000000046");
    expect(legado.buscarDocumentoAluno).toHaveBeenCalledWith("0000000027", TIPOS[0]);
    expect(r).toMatchObject({
      baixados: 3,
      jaImportados: 0,
      mantidos: 0,
      semDocumento: 0,
      erros: 0,
    });
    expect(storage.salvar).toHaveBeenCalledTimes(3);
    expect(storage.salvar).toHaveBeenCalledWith("a1", "CPF ADRIANO.pdf", expect.any(Buffer));

    // CPF: deferido pelo legado, datas convertidas e origem registrada na observação interna.
    expect(docs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoDocumentoId: "t-cpf",
        alunoId: "a1",
        matriculaId: null,
        arquivoNome: "CPF ADRIANO.pdf",
        arquivoChave: "a1/abc.pdf",
        arquivoTamanho: 1000,
        situacaoEntrega: "ENVIADO",
        situacaoDeferimento: "DEFERIDO",
        anexadoPorAluno: false,
        anexadoEm: new Date(2021, 5, 14, 17, 7, 32),
        deferidoEm: new Date(2021, 5, 22, 18, 50, 30),
        observacaoInterna: expect.stringContaining("deferido por Jeane Cristina"),
      }),
    );
    expect(docs.create).toHaveBeenCalledWith(
      expect.objectContaining({ tipoDocumentoId: "t-rg", situacaoDeferimento: "INDEFERIDO" }),
    );
    // Tipo "Comprovante de Residência" não existia: criado como tipo de aluno, não obrigatório.
    expect(docs.criarTipo).toHaveBeenCalledWith(
      expect.objectContaining({
        nome: "Comprovante de Residência",
        escopo: "ALUNO",
        obrigatorio: false,
      }),
    );
    expect(docs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoDocumentoId: "t-novo",
        situacaoDeferimento: "PENDENTE",
        deferidoEm: null,
        observacaoAluno: "Foto ilegível",
      }),
    );
    expect(r.itens.find((i) => i.tipo === "Comprovante de Residência")?.detalhe).toMatch(
      /Tipo de documento criado/,
    );
    expect(registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        usuarioId: "u1",
        entidadeId: "a1",
        detalhes: expect.objectContaining({ baixados: 3 }),
      }),
    );
  });

  it("casa o tipo do legado com o do Ethos ignorando acento e caixa", async () => {
    docs.listarTodosTipos.mockResolvedValue([
      { id: "t-res", nome: "COMPROVANTE DE RESIDENCIA", escopo: "ALUNO" },
    ] as never);
    const legado = legadoFalso({ "Comprovante de Residência": documento() });
    await documentosLegadoService.importarDoAluno("a1", "u1", legado as never);
    expect(docs.create).toHaveBeenCalledWith(expect.objectContaining({ tipoDocumentoId: "t-res" }));
    expect(docs.criarTipo).not.toHaveBeenCalled(); // reaproveita o tipo existente em vez de criar outro
  });

  it("é idempotente: o mesmo arquivo já importado não é baixado de novo", async () => {
    docs.findPorTipo.mockResolvedValue({
      id: "d1",
      arquivoChave: "a1/x.pdf",
      arquivoNome: "CPF ADRIANO.pdf",
      arquivoTamanho: 1000,
      situacaoDeferimento: "DEFERIDO",
    } as never);
    const legado = legadoFalso({ CPF: documento() });
    const r = await documentosLegadoService.importarDoAluno("a1", "u1", legado as never);
    expect(r.itens.find((i) => i.tipo === "CPF")?.resultado).toBe("JA_IMPORTADO");
    expect(legado.baixarArquivo).not.toHaveBeenCalled();
    expect(storage.salvar).not.toHaveBeenCalled();
  });

  it("nunca substitui um arquivo diferente que já exista no Ethos", async () => {
    docs.findPorTipo.mockResolvedValue({
      id: "d1",
      arquivoChave: "a1/x.pdf",
      arquivoNome: "enviado-pelo-aluno.jpg",
      arquivoTamanho: 5,
      situacaoDeferimento: "PENDENTE",
    } as never);
    const legado = legadoFalso({ CPF: documento() });
    const r = await documentosLegadoService.importarDoAluno("a1", "u1", legado as never);
    const item = r.itens.find((i) => i.tipo === "CPF");
    expect(item?.resultado).toBe("MANTIDO_ETHOS");
    expect(r.mantidos).toBe(1);
    expect(legado.baixarArquivo).not.toHaveBeenCalled();
    expect(docs.update).not.toHaveBeenCalled();
  });

  it("atualiza o Documento já criado sem arquivo (ex.: só observações) em vez de duplicar", async () => {
    docs.findPorTipo.mockResolvedValue({ id: "d9", arquivoChave: null } as never);
    const legado = legadoFalso({ CPF: documento() });
    await documentosLegadoService.importarDoAluno("a1", "u1", legado as never);
    expect(docs.update).toHaveBeenCalledWith(
      "d9",
      expect.objectContaining({ arquivoNome: "CPF ADRIANO.pdf", situacaoEntrega: "ENVIADO" }),
    );
    expect(docs.create).not.toHaveBeenCalled(); // atualizou o existente; os outros tipos não têm documento
  });

  it("tipos sem entrega ou sem arquivo no legado são contados, não são erro", async () => {
    const legado = legadoFalso({ CPF: documento({ arquivos: [] }), RG: null });
    const r = await documentosLegadoService.importarDoAluno("a1", "u1", legado as never);
    expect(r).toMatchObject({ baixados: 0, semDocumento: 3, erros: 0 });
    expect(r.itens.map((i) => i.resultado)).toEqual([
      "SEM_ARQUIVO",
      "SEM_DOCUMENTO",
      "SEM_DOCUMENTO",
    ]);
  });

  it("com vários arquivos no mesmo documento importa o mais recente (maior id) e avisa", async () => {
    const legado = legadoFalso({
      CPF: documento({
        arquivos: [
          {
            id: "0000000010",
            nome: "antigo.pdf",
            mime: "application/pdf",
            tamanho: 10,
            chave: "k-antigo",
          },
          {
            id: "0000000099",
            nome: "novo.pdf",
            mime: "application/pdf",
            tamanho: 20,
            chave: "k-novo",
          },
        ],
      }),
    });
    const r = await documentosLegadoService.importarDoAluno("a1", "u1", legado as never);
    expect(legado.baixarArquivo).toHaveBeenCalledWith("k-novo", 20);
    expect(r.itens[0]).toMatchObject({ resultado: "BAIXADO", arquivo: "novo.pdf" });
    expect(r.itens[0].detalhe).toMatch(/1 arquivo\(s\) mais antigo/);
  });

  it("falha no download de um tipo não derruba os outros", async () => {
    const legado = legadoFalso({
      CPF: documento(),
      RG: documento({
        arquivos: [
          { id: "2", nome: "RG.pdf", mime: "application/pdf", tamanho: 500, chave: "k-rg" },
        ],
      }),
    });
    legado.baixarArquivo.mockRejectedValueOnce(new Error("O legado não devolveu o arquivo"));
    const r = await documentosLegadoService.importarDoAluno("a1", "u1", legado as never);
    expect(r.itens[0]).toMatchObject({
      tipo: "CPF",
      resultado: "ERRO",
      detalhe: "O legado não devolveu o arquivo",
    });
    expect(r.itens[1].resultado).toBe("BAIXADO");
    expect(r).toMatchObject({ baixados: 1, erros: 1 });
  });

  it("se o banco recusar, remove o arquivo salvo para não deixar órfão", async () => {
    docs.create.mockRejectedValueOnce(new Error("violação de constraint"));
    const legado = legadoFalso({ CPF: documento() });
    const r = await documentosLegadoService.importarDoAluno("a1", "u1", legado as never);
    expect(storage.remover).toHaveBeenCalledWith("a1/abc.pdf");
    expect(r.itens[0]).toMatchObject({ resultado: "ERRO", detalhe: "violação de constraint" });
  });

  it("aluno inexistente, sem CPF válido ou fora do legado dão erro claro", async () => {
    alunos.findById.mockResolvedValueOnce(null);
    await expect(
      documentosLegadoService.importarDoAluno("zz", "u1", legadoFalso({}) as never),
    ).rejects.toThrow(/Aluno não encontrado$/);

    alunos.findById.mockResolvedValueOnce({ id: "a1", nome: "X", cpf: "123" } as never);
    await expect(
      documentosLegadoService.importarDoAluno("a1", "u1", legadoFalso({}) as never),
    ).rejects.toThrow(/CPF válido/);

    const vazio = legadoFalso({});
    vazio.buscarPessoaPorCpf.mockResolvedValue([]);
    await expect(
      documentosLegadoService.importarDoAluno("a1", "u1", vazio as never),
    ).rejects.toThrow(/não encontrado no sistema legado/);
  });
});

describe("parseDataHoraLegado", () => {
  it("converte data e hora, só data, e rejeita lixo", () => {
    expect(parseDataHoraLegado("2021-06-22 18:50:30")).toEqual(new Date(2021, 5, 22, 18, 50, 30));
    expect(parseDataHoraLegado("2021-06-22")).toEqual(new Date(2021, 5, 22));
    expect(parseDataHoraLegado(null)).toBeNull();
    expect(parseDataHoraLegado("22/06/2021")).toBeNull();
  });
});
