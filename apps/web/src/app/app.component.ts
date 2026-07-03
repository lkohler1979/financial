import { Component } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatIconModule } from "@angular/material/icon";
import { MatTabsModule } from "@angular/material/tabs";

// Estrutura de navegação (topo + abas horizontais) baseada nos wireframes em
// docs/wireframes/ — identidade visual/cores ficam para uma etapa futura de UI
// (ver docs/wireframes/README.md). Abas de módulos ainda não implementados
// ficam desabilitadas para preservar a arquitetura de informação prevista.
@Component({
  selector: "app-root",
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatIconModule,
    MatTabsModule,
  ],
  template: `
    <mat-toolbar color="primary" class="!sticky top-0 z-10">
      <span class="font-medium">EthosFinancial</span>
      <span class="flex-1"></span>
      <mat-icon aria-hidden="false" aria-label="Notificações">notifications</mat-icon>
    </mat-toolbar>

    <nav mat-tab-nav-bar [tabPanel]="painel" class="bg-white border-b !sticky top-16 z-10">
      <a mat-tab-link disabled>Dashboard</a>
      <a
        mat-tab-link
        routerLink="/alunos"
        routerLinkActive
        #alunos="routerLinkActive"
        [active]="alunos.isActive"
        >Alunos</a
      >
      <a
        mat-tab-link
        routerLink="/cursos"
        routerLinkActive
        #cursos="routerLinkActive"
        [active]="cursos.isActive"
        >Cursos</a
      >
      <a
        mat-tab-link
        routerLink="/matriculas"
        routerLinkActive
        #matriculas="routerLinkActive"
        [active]="matriculas.isActive"
        >Matrículas</a
      >
      <a mat-tab-link disabled>Financeiro</a>
      <a
        mat-tab-link
        routerLink="/importacao"
        routerLinkActive
        #importacao="routerLinkActive"
        [active]="importacao.isActive"
        >Importação</a
      >
      <a
        mat-tab-link
        routerLink="/relatorios"
        routerLinkActive
        #relatorios="routerLinkActive"
        [active]="relatorios.isActive"
        >Relatórios</a
      >
      <a mat-tab-link disabled>Cobrança</a>
      <a mat-tab-link disabled>Configurações</a>
    </nav>

    <mat-tab-nav-panel #painel>
      <div class="p-6 max-w-6xl mx-auto">
        <router-outlet></router-outlet>
      </div>
    </mat-tab-nav-panel>
  `,
})
export class AppComponent {}
