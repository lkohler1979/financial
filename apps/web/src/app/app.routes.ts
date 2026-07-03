import { Routes } from "@angular/router";

export const routes: Routes = [
  { path: "", pathMatch: "full", redirectTo: "alunos" },
  {
    path: "alunos",
    loadComponent: () =>
      import("./features/alunos/alunos-list.component").then((m) => m.AlunosListComponent),
  },
  {
    path: "alunos/novo",
    loadComponent: () =>
      import("./features/alunos/aluno-form.component").then((m) => m.AlunoFormComponent),
  },
  {
    path: "alunos/:id",
    loadComponent: () =>
      import("./features/alunos/aluno-form.component").then((m) => m.AlunoFormComponent),
  },
  {
    path: "cursos",
    loadComponent: () =>
      import("./features/cursos/cursos-list.component").then((m) => m.CursosListComponent),
  },
  {
    path: "cursos/novo",
    loadComponent: () =>
      import("./features/cursos/curso-form.component").then((m) => m.CursoFormComponent),
  },
  {
    path: "cursos/:id",
    loadComponent: () =>
      import("./features/cursos/curso-form.component").then((m) => m.CursoFormComponent),
  },
  {
    path: "matriculas",
    loadComponent: () =>
      import("./features/matriculas/matriculas-list.component").then(
        (m) => m.MatriculasListComponent,
      ),
  },
  {
    path: "matriculas/novo",
    loadComponent: () =>
      import("./features/matriculas/matricula-form.component").then(
        (m) => m.MatriculaFormComponent,
      ),
  },
  {
    path: "matriculas/:id",
    loadComponent: () =>
      import("./features/matriculas/matricula-form.component").then(
        (m) => m.MatriculaFormComponent,
      ),
  },
  {
    path: "importacao",
    loadComponent: () =>
      import("./features/importacao/importacao-upload.component").then(
        (m) => m.ImportacaoUploadComponent,
      ),
  },
  {
    path: "relatorios",
    loadComponent: () =>
      import("./features/relatorios/relatorios-geracao.component").then(
        (m) => m.RelatoriosGeracaoComponent,
      ),
  },
  { path: "**", redirectTo: "alunos" },
];
