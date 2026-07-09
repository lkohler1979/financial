import { Component, inject } from "@angular/core";
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatIconModule } from "@angular/material/icon";
import { MatTabsModule } from "@angular/material/tabs";
import { MatButtonModule } from "@angular/material/button";
import { AuthService } from "./core/auth/auth.service";

// Estrutura de navegação (topo + abas horizontais) baseada nos wireframes em
// docs/wireframes/ — identidade visual/cores ficam para uma etapa futura de UI
// (ver docs/wireframes/README.md). Abas ficam visíveis conforme o perfil do
// usuário logado (docs/PENDENCIAS.md tem a matriz de perfis x módulos) e
// somem inteiramente na tela de login.
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
    MatButtonModule,
  ],
  template: `
    @if (authService.autenticado()) {
      <mat-toolbar color="primary" class="!sticky top-0 z-10">
        <span class="font-medium">EthosFinancial</span>
        <span class="flex-1"></span>
        <span class="text-sm mr-3">{{ authService.usuario()?.nome }}</span>
        <button mat-icon-button aria-label="Sair" (click)="sair()">
          <mat-icon>logout</mat-icon>
        </button>
      </mat-toolbar>

      <nav mat-tab-nav-bar [tabPanel]="painel" class="bg-white border-b !sticky top-16 z-10">
        @if (authService.temPerfil("ADMINISTRADOR")) {
          <a
            mat-tab-link
            routerLink="/dashboard"
            routerLinkActive
            #dashboard="routerLinkActive"
            [active]="dashboard.isActive"
            >Dashboard</a
          >
        }
        <a
          mat-tab-link
          routerLink="/alunos"
          routerLinkActive
          #alunos="routerLinkActive"
          [active]="alunos.isActive"
          >Alunos</a
        >
        @if (authService.temPerfil("ADMINISTRADOR", "FINANCEIRO")) {
          <a
            mat-tab-link
            routerLink="/cursos"
            routerLinkActive
            #cursos="routerLinkActive"
            [active]="cursos.isActive"
            >Cursos</a
          >
        }
        <a
          mat-tab-link
          routerLink="/matriculas"
          routerLinkActive
          #matriculas="routerLinkActive"
          [active]="matriculas.isActive"
          >Matrículas</a
        >
        @if (authService.temPerfil("ADMINISTRADOR", "FINANCEIRO")) {
          <a
            mat-tab-link
            routerLink="/importacao"
            routerLinkActive
            #importacao="routerLinkActive"
            [active]="importacao.isActive"
            >Importação</a
          >
        }
        <a
          mat-tab-link
          routerLink="/relatorios"
          routerLinkActive
          #relatorios="routerLinkActive"
          [active]="relatorios.isActive"
          >Relatórios</a
        >
        @if (authService.temPerfil("ADMINISTRADOR")) {
          <a
            mat-tab-link
            routerLink="/configuracoes"
            routerLinkActive
            #configuracoes="routerLinkActive"
            [active]="configuracoes.isActive"
            >Configurações</a
          >
          <a
            mat-tab-link
            routerLink="/auditoria"
            routerLinkActive
            #auditoria="routerLinkActive"
            [active]="auditoria.isActive"
            >Auditoria</a
          >
          <a
            mat-tab-link
            routerLink="/usuarios"
            routerLinkActive
            #usuarios="routerLinkActive"
            [active]="usuarios.isActive"
            >Usuários</a
          >
        }
      </nav>

      <mat-tab-nav-panel #painel>
        <div class="p-3 sm:p-6 w-full box-border">
          <router-outlet></router-outlet>
        </div>
      </mat-tab-nav-panel>
    } @else {
      <router-outlet></router-outlet>
    }
  `,
})
export class AppComponent {
  readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  sair(): void {
    this.authService.logout();
    this.router.navigate(["/login"]);
  }
}
