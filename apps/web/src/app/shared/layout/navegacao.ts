/**
 * Menu lateral e migalhas (breadcrumb) do app, sem Angular, para poder ser testado
 * (apps/api/tests/unit/navegacao.test.ts). Organização segundo docs/especificacao: grupos
 * Acadêmico e Financeiro, e os itens de sistema no rodapé do menu.
 */

export type PerfilMenu = "ADMINISTRADOR" | "FINANCEIRO" | "USUARIO";

export interface ItemMenu {
  rotulo: string;
  /** Nome do ícone (Material Icons, estilo outlined). */
  icone: string;
  rota: string;
  /** Perfis que veem o item; sem a lista, todos veem. */
  perfis?: readonly PerfilMenu[];
}

export interface GrupoMenu {
  /** Texto pequeno acima dos itens; sem ele o grupo não tem título. */
  rotulo: string | null;
  itens: ItemMenu[];
  /** Grupo do rodapé do menu (separado dos demais por uma linha). */
  rodape?: boolean;
}

const ADMIN = ["ADMINISTRADOR"] as const;
const ADMIN_E_FINANCEIRO = ["ADMINISTRADOR", "FINANCEIRO"] as const;

export const GRUPOS_MENU: GrupoMenu[] = [
  {
    rotulo: null,
    itens: [{ rotulo: "Visão geral", icone: "home", rota: "/dashboard", perfis: ADMIN }],
  },
  {
    rotulo: "Acadêmico",
    itens: [
      { rotulo: "Alunos", icone: "person", rota: "/alunos" },
      { rotulo: "Matrículas", icone: "event_note", rota: "/matriculas" },
      { rotulo: "Cursos", icone: "menu_book", rota: "/cursos", perfis: ADMIN_E_FINANCEIRO },
      { rotulo: "Sacados", icone: "groups", rota: "/sacados" },
      { rotulo: "Solicitações", icone: "inbox", rota: "/solicitacoes" },
    ],
  },
  {
    rotulo: "Financeiro",
    itens: [
      {
        rotulo: "Notas fiscais",
        icone: "description",
        rota: "/notas-fiscais",
        perfis: ADMIN_E_FINANCEIRO,
      },
      { rotulo: "Relatórios", icone: "bar_chart", rota: "/relatorios" },
    ],
  },
  {
    rotulo: null,
    rodape: true,
    itens: [
      { rotulo: "Importações", icone: "upload", rota: "/importacao", perfis: ADMIN_E_FINANCEIRO },
      { rotulo: "Documentos", icone: "folder_open", rota: "/documentos" },
      { rotulo: "Tipos", icone: "category", rota: "/tipos", perfis: ADMIN },
      { rotulo: "Configurações", icone: "settings", rota: "/configuracoes", perfis: ADMIN },
      { rotulo: "Auditoria", icone: "fact_check", rota: "/auditoria", perfis: ADMIN },
      { rotulo: "Usuários", icone: "manage_accounts", rota: "/usuarios", perfis: ADMIN },
    ],
  },
];

/** O menu que o perfil enxerga (sem os itens proibidos e sem grupos que ficaram vazios). */
export function menuDoPerfil(perfil: PerfilMenu | null | undefined): GrupoMenu[] {
  return GRUPOS_MENU.map((g) => ({
    ...g,
    itens: g.itens.filter((i) => !i.perfis || (!!perfil && i.perfis.includes(perfil))),
  })).filter((g) => g.itens.length > 0);
}

export interface Migalha {
  rotulo: string;
  /** Rota da migalha; a última (página atual) não tem. */
  rota?: string;
}

const SEGMENTOS_ESPECIAIS: Record<string, string> = {
  novo: "Cadastro",
  cadastro: "Cadastro",
  titulos: "Títulos",
};

/** Migalhas da URL: grupo do menu › página › (cadastro | edição | subpágina). */
export function migalhasDaUrl(url: string): Migalha[] {
  const caminho = url.split(/[?#]/)[0];
  const segmentos = caminho.split("/").filter(Boolean);
  if (segmentos.length === 0) return [];

  // A ficha de cobrança fica sob Matrículas.
  if (segmentos[0] === "cobranca") {
    return [
      { rotulo: "Acadêmico" },
      { rotulo: "Matrículas", rota: "/matriculas" },
      { rotulo: "Ficha de cobrança" },
    ];
  }

  for (const grupo of GRUPOS_MENU) {
    const item = grupo.itens.find((i) => i.rota === `/${segmentos[0]}`);
    if (!item) continue;

    const migalhas: Migalha[] = [];
    const rotuloGrupo = grupo.rotulo ?? (grupo.rodape ? "Sistema" : null);
    if (rotuloGrupo) migalhas.push({ rotulo: rotuloGrupo });
    const resto = segmentos.slice(1);
    migalhas.push(
      resto.length ? { rotulo: item.rotulo, rota: item.rota } : { rotulo: item.rotulo },
    );

    if (resto.length === 0) return migalhas;
    const [primeiro, segundo] = resto;
    if (SEGMENTOS_ESPECIAIS[primeiro]) {
      migalhas.push({ rotulo: SEGMENTOS_ESPECIAIS[primeiro] });
    } else if (segundo && SEGMENTOS_ESPECIAIS[segundo]) {
      migalhas.push({
        rotulo: "Cadastro",
        rota: `${item.rota}/${primeiro}`,
      });
      migalhas.push({ rotulo: SEGMENTOS_ESPECIAIS[segundo] });
    } else {
      migalhas.push({ rotulo: "Cadastro" });
    }
    return migalhas;
  }
  return [];
}
