import { Component, inject, signal } from "@angular/core";
import { NavigationEnd, Router, RouterOutlet } from "@angular/router";
import { toSignal } from "@angular/core/rxjs-interop";
import { filter, map } from "rxjs";
import { AuthService } from "./core/auth/auth.service";
import { SidebarComponent } from "./shared/layout/sidebar.component";
import { TopbarComponent } from "./shared/layout/topbar.component";

// Estrutura de navegação segundo docs/especificacao: menu lateral (Acadêmico, Financeiro e itens de
// sistema, conforme o perfil do usuário — docs/PENDENCIAS.md tem a matriz de perfis x módulos) e
// barra superior com migalhas e busca. A tela de login e a área do aluno não têm esse layout.
@Component({
  selector: "app-root",
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent],
  template: `
    @if (authService.autenticado() && !naAreaDoAluno()) {
      <div class="flex min-h-screen">
        <!-- Menu fixo no computador; gaveta no celular -->
        <aside
          class="fixed inset-y-0 left-0 z-40 w-[264px] border-r border-line transition-transform lg:translate-x-0"
          [class.-translate-x-full]="!menuAberto()"
          [class.shadow-2xl]="menuAberto()"
        >
          <app-sidebar (navegou)="menuAberto.set(false)" />
        </aside>
        @if (menuAberto()) {
          <button
            type="button"
            class="fixed inset-0 z-30 border-0 bg-black/30 lg:hidden"
            aria-label="Fechar menu"
            (click)="menuAberto.set(false)"
          ></button>
        }

        <div class="flex min-w-0 flex-1 flex-col lg:pl-[264px]">
          <app-topbar (abrirMenu)="menuAberto.set(true)" />
          <main class="w-full box-border flex-1 p-4 sm:p-6">
            <router-outlet></router-outlet>
          </main>
        </div>
      </div>
    } @else {
      <router-outlet></router-outlet>
    }
  `,
})
export class AppComponent {
  readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly menuAberto = signal(false);

  /** A área do aluno tem layout próprio: esconde o menu da equipe. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  // Só "/aluno" e "/aluno/..." — "/alunos" (cadastro da equipe) mantém o menu.
  readonly naAreaDoAluno = () => /^\/aluno(\/|\?|$)/.test(this.url());
}
