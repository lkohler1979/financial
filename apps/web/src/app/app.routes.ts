import { Routes } from "@angular/router";
import { authGuard } from "./core/guards/auth.guard";
import { perfilGuard } from "./core/guards/perfil.guard";
import { homeRedirectGuard } from "./core/guards/home-redirect.guard";

// Perfis por módulo (docs/PENDENCIAS.md tem a matriz completa e a decisão do
// usuário, 2026-07-07). Sem `data.perfis`, qualquer usuário autenticado acessa.
const TODOS_PERFIS = ["ADMINISTRADOR", "FINANCEIRO", "USUARIO"] as const;
const ADMIN_E_FINANCEIRO = ["ADMINISTRADOR", "FINANCEIRO"] as const;
const SO_ADMIN = ["ADMINISTRADOR"] as const;

export const routes: Routes = [
  {
    path: "login",
    loadComponent: () => import("./features/auth/login.component").then((m) => m.LoginComponent),
  },
  { path: "", pathMatch: "full", canActivate: [homeRedirectGuard], children: [] },
  {
    path: "dashboard",
    canActivate: [authGuard, perfilGuard],
    data: { perfis: SO_ADMIN },
    loadComponent: () =>
      import("./features/dashboard/dashboard.component").then((m) => m.DashboardComponent),
  },
  {
    path: "alunos",
    canActivate: [authGuard, perfilGuard],
    data: { perfis: TODOS_PERFIS },
    loadComponent: () =>
      import("./features/alunos/alunos-list.component").then((m) => m.AlunosListComponent),
  },
  {
    path: "alunos/novo",
    canActivate: [authGuard, perfilGuard],
    data: { perfis: TODOS_PERFIS },
    loadComponent: () =>
      import("./features/alunos/aluno-form.component").then((m) => m.AlunoFormComponent),
  },
  {
    path: "alunos/:id",
    canActivate: [authGuard, perfilGuard],
    data: { perfis: TODOS_PERFIS },
    loadComponent: () =>
      import("./features/alunos/aluno-form.component").then((m) => m.AlunoFormComponent),
  },
  {
    path: "cursos",
    canActivate: [authGuard, perfilGuard],
    data: { perfis: ADMIN_E_FINANCEIRO },
    loadComponent: () =>
      import("./features/cursos/cursos-list.component").then((m) => m.CursosListComponent),
  },
  {
    path: "cursos/novo",
    canActivate: [authGuard, perfilGuard],
    data: { perfis: ADMIN_E_FINANCEIRO },
    loadComponent: () =>
      import("./features/cursos/curso-form.component").then((m) => m.CursoFormComponent),
  },
  {
    path: "cursos/:id",
    canActivate: [authGuard, perfilGuard],
    data: { perfis: ADMIN_E_FINANCEIRO },
    loadComponent: () =>
      import("./features/cursos/curso-form.component").then((m) => m.CursoFormComponent),
  },
  {
    path: "matriculas",
    canActivate: [authGuard, perfilGuard],
    data: { perfis: TODOS_PERFIS },
    loadComponent: () =>
      import("./features/matriculas/matriculas-list.component").then(
        (m) => m.MatriculasListComponent,
      ),
  },
  {
    path: "matriculas/novo",
    canActivate: [authGuard, perfilGuard],
    data: { perfis: TODOS_PERFIS },
    loadComponent: () =>
      import("./features/matriculas/matricula-form.component").then(
        (m) => m.MatriculaFormComponent,
      ),
  },
  {
    path: "matriculas/:id",
    canActivate: [authGuard, perfilGuard],
    data: { perfis: TODOS_PERFIS },
    loadComponent: () =>
      import("./features/matriculas/matricula-form.component").then(
        (m) => m.MatriculaFormComponent,
      ),
  },
  {
    path: "importacao",
    canActivate: [authGuard, perfilGuard],
    data: { perfis: ADMIN_E_FINANCEIRO },
    loadComponent: () =>
      import("./features/importacao/importacao-upload.component").then(
        (m) => m.ImportacaoUploadComponent,
      ),
  },
  {
    path: "relatorios",
    canActivate: [authGuard, perfilGuard],
    data: { perfis: TODOS_PERFIS },
    loadComponent: () =>
      import("./features/relatorios/relatorios-geracao.component").then(
        (m) => m.RelatoriosGeracaoComponent,
      ),
  },
  {
    path: "cobranca/matriculas/:matriculaId",
    canActivate: [authGuard, perfilGuard],
    data: { perfis: SO_ADMIN },
    loadComponent: () =>
      import("./features/cobranca/ficha-cobranca.component").then((m) => m.FichaCobrancaComponent),
  },
  {
    path: "configuracoes",
    canActivate: [authGuard, perfilGuard],
    data: { perfis: SO_ADMIN },
    loadComponent: () =>
      import("./features/configuracoes/configuracoes.component").then(
        (m) => m.ConfiguracoesComponent,
      ),
  },
  {
    path: "auditoria",
    canActivate: [authGuard, perfilGuard],
    data: { perfis: SO_ADMIN },
    loadComponent: () =>
      import("./features/auditoria/auditoria-list.component").then((m) => m.AuditoriaListComponent),
  },
  {
    path: "usuarios",
    canActivate: [authGuard, perfilGuard],
    data: { perfis: SO_ADMIN },
    loadComponent: () =>
      import("./features/usuarios/usuarios-list.component").then((m) => m.UsuariosListComponent),
  },
  {
    path: "usuarios/novo",
    canActivate: [authGuard, perfilGuard],
    data: { perfis: SO_ADMIN },
    loadComponent: () =>
      import("./features/usuarios/usuario-form.component").then((m) => m.UsuarioFormComponent),
  },
  {
    path: "usuarios/:id",
    canActivate: [authGuard, perfilGuard],
    data: { perfis: SO_ADMIN },
    loadComponent: () =>
      import("./features/usuarios/usuario-form.component").then((m) => m.UsuarioFormComponent),
  },
  { path: "**", canActivate: [homeRedirectGuard], children: [] },
];
