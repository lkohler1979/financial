import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/database/prisma";
import { documentacaoService } from "../../src/modules/documentos/documentacao.service";
import { matriculasRepository } from "../../src/modules/matriculas/matriculas.repository";

/**
 * Banco de verdade (sem mock): usa o PostgreSQL de DATABASE_URL. Cria só o mínimo (um curso, um
 * aluno, uma matrícula e um tipo de documento obrigatório) e apaga tudo no fim.
 */

/** CPF válido (dígitos verificadores corretos) a partir de 9 dígitos. */
function cpfValido(base: string): string {
  const digito = (nums: number[]) => {
    const soma = nums.reduce((s, n, i) => s + n * (nums.length + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const nums = base.split("").map(Number);
  const d1 = digito(nums);
  const d2 = digito([...nums, d1]);
  return `${base}${d1}${d2}`;
}

const execucao = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
let cursoId: string;
let alunoId: string;
let matriculaId: string;
let tipoProprioId: string;

async function situacao() {
  const m = await prisma.matricula.findUniqueOrThrow({ where: { id: matriculaId } });
  return m.situacaoDocumentacao;
}

/** Um documento enviado para cada tipo ativo obrigatório, com a conferência pedida. */
async function enviarObrigatorios(
  deferimento: "PENDENTE" | "DEFERIDO" | "INDEFERIDO",
  exceto?: string,
) {
  const tipos = await prisma.tipoDocumento.findMany({ where: { ativo: true, obrigatorio: true } });
  for (const t of tipos.filter((x) => x.id !== exceto)) {
    const matriculaDoc = t.escopo === "MATRICULA" ? matriculaId : null;
    const existente = await prisma.documento.findFirst({
      where: { tipoDocumentoId: t.id, alunoId, matriculaId: matriculaDoc },
    });
    const dados = {
      situacaoEntrega: "ENVIADO" as const,
      situacaoDeferimento: deferimento,
      anexadoEm: new Date(),
    };
    if (existente) await prisma.documento.update({ where: { id: existente.id }, data: dados });
    else {
      await prisma.documento.create({
        data: { tipoDocumentoId: t.id, alunoId, matriculaId: matriculaDoc, ...dados },
      });
    }
  }
}

beforeAll(async () => {
  const curso = await prisma.curso.create({
    data: { codigo: `T${execucao}`, nome: `Curso do teste de documentação ${execucao}` },
  });
  cursoId = curso.id;
  const aluno = await prisma.aluno.create({
    data: {
      cpf: cpfValido(execucao.slice(-9).padStart(9, "1")),
      nome: `Aluno do teste ${execucao}`,
    },
  });
  alunoId = aluno.id;
  const matricula = await prisma.matricula.create({ data: { alunoId, cursoId } });
  matriculaId = matricula.id;
  // Garante ao menos um tipo obrigatório ativo, mesmo num banco recém-migrado.
  const tipo = await prisma.tipoDocumento.create({
    data: { nome: `Tipo do teste ${execucao}`, escopo: "ALUNO", obrigatorio: true },
  });
  tipoProprioId = tipo.id;
});

afterAll(async () => {
  await prisma.documento.deleteMany({ where: { alunoId } });
  await prisma.matricula.deleteMany({ where: { id: matriculaId } });
  await prisma.aluno.deleteMany({ where: { id: alunoId } });
  await prisma.curso.deleteMany({ where: { id: cursoId } });
  await prisma.tipoDocumento.deleteMany({ where: { id: tipoProprioId } });
  await prisma.$disconnect();
});

describe("situação da documentação (banco real)", () => {
  it("nasce sem documentos", async () => {
    await documentacaoService.recalcularMatricula(matriculaId);
    expect(await situacao()).toBe("SEM_DOCUMENTOS");
  });

  it("documentos enviados e ainda não conferidos: pendentes", async () => {
    await enviarObrigatorios("PENDENTE");
    await documentacaoService.recalcularAluno(alunoId);
    expect(await situacao()).toBe("DOCUMENTOS_PENDENTES");
  });

  it("falta um obrigatório (mesmo com os outros deferidos): pendentes", async () => {
    await enviarObrigatorios("DEFERIDO", tipoProprioId);
    await prisma.documento.deleteMany({ where: { alunoId, tipoDocumentoId: tipoProprioId } });
    await documentacaoService.recalcularAluno(alunoId);
    expect(await situacao()).toBe("DOCUMENTOS_PENDENTES");
  });

  it("todos os obrigatórios deferidos: documentação completa", async () => {
    await enviarObrigatorios("DEFERIDO");
    await documentacaoService.recalcularAluno(alunoId);
    expect(await situacao()).toBe("DOCUMENTACAO_COMPLETA");
  });

  it("um documento indeferido volta para pendentes", async () => {
    await prisma.documento.updateMany({
      where: { alunoId, tipoDocumentoId: tipoProprioId },
      data: { situacaoDeferimento: "INDEFERIDO" },
    });
    await documentacaoService.recalcularMatricula(matriculaId);
    expect(await situacao()).toBe("DOCUMENTOS_PENDENTES");
  });

  it("o filtro da listagem usa a situação gravada", async () => {
    await enviarObrigatorios("DEFERIDO");
    await documentacaoService.recalcularAluno(alunoId);
    const completa = await matriculasRepository.list({
      alunoId,
      situacaoDocumentacao: "DOCUMENTACAO_COMPLETA",
      skip: 0,
      take: 10,
    });
    const semDocs = await matriculasRepository.list({
      alunoId,
      situacaoDocumentacao: "SEM_DOCUMENTOS",
      skip: 0,
      take: 10,
    });
    expect(completa.data.map((m) => m.id)).toEqual([matriculaId]);
    expect(semDocs.total).toBe(0);
  });

  it("o recálculo geral corrige uma situação gravada errada", async () => {
    await prisma.matricula.update({
      where: { id: matriculaId },
      data: { situacaoDocumentacao: "SEM_DOCUMENTOS" },
    });
    await documentacaoService.recalcularTodas();
    expect(await situacao()).toBe("DOCUMENTACAO_COMPLETA");
  });

  it("removidos todos os documentos: sem documentos", async () => {
    await prisma.documento.deleteMany({ where: { alunoId } });
    await documentacaoService.recalcularAluno(alunoId);
    expect(await situacao()).toBe("SEM_DOCUMENTOS");
  });
});
