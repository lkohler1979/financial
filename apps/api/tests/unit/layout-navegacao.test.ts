import { describe, expect, it } from "vitest";
import { menuDoPerfil, migalhasDaUrl } from "../../../web/src/app/shared/layout/navegacao";
import { iniciaisDe } from "../../../web/src/app/shared/utils/iniciais";
import { numerosDePagina, resumoDaPagina } from "../../../web/src/app/shared/utils/paginacao";

const rotulos = (perfil: Parameters<typeof menuDoPerfil>[0]) =>
  menuDoPerfil(perfil).flatMap((g) => g.itens.map((i) => i.rotulo));

describe("menu lateral por perfil", () => {
  it("administrador vê tudo, agrupado em Acadêmico, Financeiro e sistema", () => {
    const menu = menuDoPerfil("ADMINISTRADOR");
    expect(menu.map((g) => g.rotulo)).toEqual([null, "Acadêmico", "Financeiro", null]);
    expect(rotulos("ADMINISTRADOR")).toEqual([
      "Visão geral",
      "Alunos",
      "Matrículas",
      "Cursos",
      "Sacados",
      "Solicitações",
      "Notas fiscais",
      "Relatórios",
      "Importações",
      "Documentos",
      "Tipos",
      "Configurações",
      "Auditoria",
      "Usuários",
    ]);
  });

  it("financeiro não vê Visão geral nem os itens de administração", () => {
    const itens = rotulos("FINANCEIRO");
    expect(itens).toContain("Cursos");
    expect(itens).toContain("Notas fiscais");
    expect(itens).toContain("Importações");
    for (const proibido of ["Visão geral", "Tipos", "Configurações", "Auditoria", "Usuários"]) {
      expect(itens).not.toContain(proibido);
    }
  });

  it("usuário só vê o que o perfil comum acessa e nenhum grupo fica vazio", () => {
    expect(rotulos("USUARIO")).toEqual([
      "Alunos",
      "Matrículas",
      "Sacados",
      "Solicitações",
      "Relatórios",
      "Documentos",
    ]);
    expect(menuDoPerfil("USUARIO").every((g) => g.itens.length > 0)).toBe(true);
  });

  it("sem perfil não mostra item restrito", () => {
    expect(rotulos(null)).not.toContain("Configurações");
  });
});

describe("migalhas da URL", () => {
  const texto = (url: string) => migalhasDaUrl(url).map((m) => m.rotulo);

  it("página de lista: grupo › página", () => {
    expect(texto("/alunos")).toEqual(["Acadêmico", "Alunos"]);
    expect(texto("/relatorios?x=1")).toEqual(["Financeiro", "Relatórios"]);
    expect(texto("/configuracoes")).toEqual(["Sistema", "Configurações"]);
    expect(texto("/dashboard")).toEqual(["Visão geral"]);
  });

  it("cadastro novo e edição", () => {
    expect(texto("/alunos/novo")).toEqual(["Acadêmico", "Alunos", "Cadastro"]);
    expect(texto("/matriculas/cadastro")).toEqual(["Acadêmico", "Matrículas", "Cadastro"]);
    expect(texto("/alunos/9788328b-8e72-42e9-b659-5a329656c55c")).toEqual([
      "Acadêmico",
      "Alunos",
      "Cadastro",
    ]);
  });

  it("os níveis de cima levam à página anterior; o último não é link", () => {
    const m = migalhasDaUrl("/alunos/abc/titulos");
    expect(m.map((x) => x.rotulo)).toEqual(["Acadêmico", "Alunos", "Cadastro", "Títulos"]);
    expect(m[1].rota).toBe("/alunos");
    expect(m[2].rota).toBe("/alunos/abc");
    expect(m[3].rota).toBeUndefined();
  });

  it("ficha de cobrança fica sob Matrículas; rota desconhecida não tem migalhas", () => {
    expect(texto("/cobranca/matriculas/xyz")).toEqual([
      "Acadêmico",
      "Matrículas",
      "Ficha de cobrança",
    ]);
    expect(texto("/nao-existe")).toEqual([]);
    expect(texto("/")).toEqual([]);
  });
});

describe("iniciais do avatar", () => {
  it("primeira letra do primeiro e do último nome, ignorando 'de', 'da', 'dos'…", () => {
    expect(iniciaisDe("Mariana Costa Ribeiro")).toBe("MR");
    expect(iniciaisDe("Adriano Jorge Sombra Júnior")).toBe("AJ");
    expect(iniciaisDe("Alanderson Deuel de Moraes Barboza")).toBe("AB");
    expect(iniciaisDe("  maria  ")).toBe("M");
    expect(iniciaisDe("")).toBe("?");
  });
});

describe("paginação numerada", () => {
  it("poucas páginas: todas", () => {
    expect(numerosDePagina(1, 1)).toEqual([1]);
    expect(numerosDePagina(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("muitas páginas: começo, meio e fim (como na referência: 1 2 3 4 5 … 361)", () => {
    expect(numerosDePagina(1, 361)).toEqual([1, 2, 3, 4, 5, "…", 361]);
    expect(numerosDePagina(3, 361)).toEqual([1, 2, 3, 4, 5, "…", 361]);
    expect(numerosDePagina(50, 361)).toEqual([1, "…", 49, 50, 51, "…", 361]);
    expect(numerosDePagina(361, 361)).toEqual([1, "…", 357, 358, 359, 360, 361]);
  });

  it("resumo 'Mostrando 1–8 de 2.885'", () => {
    expect(resumoDaPagina(1, 8, 2885)).toBe("Mostrando 1–8 de 2.885");
    expect(resumoDaPagina(361, 8, 2885)).toBe("Mostrando 2.881–2.885 de 2.885");
    expect(resumoDaPagina(1, 20, 0)).toBe("Nenhum resultado");
  });
});
