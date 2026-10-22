import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/database/prisma";
import { contratosRepository } from "../../src/modules/contratos/contratos.repository";

/**
 * Banco de verdade (sem mock): quais contratos o monitoramento confere e o que acontece na
 * matrícula quando um contrato é marcado como assinado. A consulta à plataforma de assinatura em
 * si não roda aqui (não há plataforma no CI).
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
  return `${base}${d1}${digito([...nums, d1])}`;
}

const execucao = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const DIA = 24 * 60 * 60_000;
const agora = new Date();
const ha = (dias: number) => new Date(agora.getTime() - dias * DIA);

let cursoId: string;
let alunoId: string;
const matriculaIds: string[] = [];
const contratoPorNome: Record<string, string> = {};

async function contrato(
  nome: string,
  matriculaId: string,
  dados: {
    status: "ENVIADO" | "ASSINADO" | "RECUSADO" | "CANCELADO";
    enviadoEm: Date;
    assinadoEm?: Date;
    arquivoAssinadoChave?: string;
    documentoExternoId?: string | null;
  },
) {
  const c = await prisma.contratoMatricula.create({
    data: {
      matriculaId,
      status: dados.status,
      provedor: "AUTENTIQUE",
      documentoExternoId:
        dados.documentoExternoId === undefined
          ? `doc-${execucao}-${nome}`
          : dados.documentoExternoId,
      contratanteNome: "Contratante do teste",
      contratanteEmail: `${nome}-${execucao}@exemplo.test`,
      autenticacao: "EMAIL",
      arquivoGeradoChave: `contratos/${execucao}-${nome}.docx`,
      enviadoEm: dados.enviadoEm,
      assinadoEm: dados.assinadoEm,
      arquivoAssinadoChave: dados.arquivoAssinadoChave,
    },
  });
  contratoPorNome[nome] = c.id;
  return c;
}

beforeAll(async () => {
  cursoId = (
    await prisma.curso.create({
      data: { codigo: `C${execucao}`, nome: `Curso do teste ${execucao}` },
    })
  ).id;
  alunoId = (
    await prisma.aluno.create({
      data: {
        cpf: cpfValido(String(Number(execucao.slice(-8))).padStart(9, "1")),
        nome: `Aluno ${execucao}`,
      },
    })
  ).id;
  // Uma matrícula por contrato (cada uma com seu campo "contrato assinado").
  for (let i = 0; i < 7; i++) {
    matriculaIds.push(
      (
        await prisma.matricula.create({
          data: { alunoId, cursoId, numeroMatricula: `${execucao}-${i}` },
        })
      ).id,
    );
  }
  await contrato("aguardando", matriculaIds[0], { status: "ENVIADO", enviadoEm: ha(2) });
  await contrato("aguardando-antigo", matriculaIds[1], { status: "ENVIADO", enviadoEm: ha(120) });
  await contrato("assinado-sem-pdf", matriculaIds[2], {
    status: "ASSINADO",
    enviadoEm: ha(3),
    assinadoEm: ha(1),
  });
  await contrato("assinado-sem-pdf-velho", matriculaIds[3], {
    status: "ASSINADO",
    enviadoEm: ha(40),
    assinadoEm: ha(30),
  });
  await contrato("assinado-com-pdf", matriculaIds[4], {
    status: "ASSINADO",
    enviadoEm: ha(3),
    assinadoEm: ha(1),
    arquivoAssinadoChave: "contratos/x.pdf",
  });
  await contrato("recusado", matriculaIds[5], { status: "RECUSADO", enviadoEm: ha(2) });
  await contrato("sem-documento", matriculaIds[6], {
    status: "ENVIADO",
    enviadoEm: ha(2),
    documentoExternoId: null,
  });
});

afterAll(async () => {
  await prisma.contratoMatricula.deleteMany({ where: { matriculaId: { in: matriculaIds } } });
  await prisma.matricula.deleteMany({ where: { id: { in: matriculaIds } } });
  await prisma.aluno.deleteMany({ where: { id: alunoId } });
  await prisma.curso.deleteMany({ where: { id: cursoId } });
  await prisma.$disconnect();
});

describe("contratos que o monitoramento confere (banco real)", () => {
  it("aguardando assinatura recente e assinado ainda sem o PDF; o resto fica de fora", async () => {
    const lista = await contratosRepository.paraMonitorar(1000, agora);
    const meus = new Set(Object.values(contratoPorNome));
    const ids = new Set(lista.filter((c) => meus.has(c.id)).map((c) => c.id));
    const esperados = ["aguardando", "assinado-sem-pdf"].map((n) => contratoPorNome[n]);
    expect([...ids].sort()).toEqual(esperados.sort());
  });

  it("respeita o limite por rodada", async () => {
    const lista = await contratosRepository.paraMonitorar(1, agora);
    expect(lista.length).toBeLessThanOrEqual(1);
  });
});

describe("marcar o contrato como assinado (banco real)", () => {
  it("atualiza o contrato e o campo 'Contrato assinado' da matrícula", async () => {
    const id = contratoPorNome["aguardando"];
    const antes = await prisma.matricula.findUniqueOrThrow({ where: { id: matriculaIds[0] } });
    expect(antes.contratoAssinado).toBe(false);

    const contratoAntes = await contratosRepository.porId(id);
    await contratosRepository.marcarAssinado(contratoAntes!, "contratos/assinado.pdf");

    const contratoDepois = await contratosRepository.porId(id);
    expect(contratoDepois).toMatchObject({
      status: "ASSINADO",
      arquivoAssinadoChave: "contratos/assinado.pdf",
    });
    expect(contratoDepois?.assinadoEm).not.toBeNull();
    const depois = await prisma.matricula.findUniqueOrThrow({ where: { id: matriculaIds[0] } });
    expect(depois.contratoAssinado).toBe(true);
  });

  it("depois de assinado e com PDF, sai do monitoramento", async () => {
    const lista = await contratosRepository.paraMonitorar(1000, agora);
    expect(lista.map((c) => c.id)).not.toContain(contratoPorNome["aguardando"]);
  });

  it("reconferir um assinado (para baixar o PDF) mantém a data da assinatura", async () => {
    const id = contratoPorNome["assinado-sem-pdf"];
    const antes = await contratosRepository.porId(id);
    await contratosRepository.marcarAssinado(antes!, "contratos/depois.pdf");
    const depois = await contratosRepository.porId(id);
    expect(depois?.assinadoEm?.getTime()).toBe(antes?.assinadoEm?.getTime());
    expect(depois?.arquivoAssinadoChave).toBe("contratos/depois.pdf");
  });
});
