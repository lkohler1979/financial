import { Component, computed, inject, output } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { NavigationEnd, Router, RouterLink } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { filter, map } from "rxjs";
import { migalhasDaUrl } from "./navegacao";

/** Barra superior: botão do menu (celular), migalhas, busca de alunos e atalho para nova matrícula. */
@Component({
  selector: "app-topbar",
  standalone: true,
  imports: [RouterLink, FormsModule, MatButtonModule, MatIconModule],
  template: `
    <header
      class="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-white px-4 py-3 sm:px-6"
    >
      <button
        type="button"
        class="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg border-0 bg-transparent"
        aria-label="Abrir menu"
        (click)="abrirMenu.emit()"
      >
        <mat-icon>menu</mat-icon>
      </button>

      <nav aria-label="Você está em" class="min-w-0 flex-1 text-sm text-muted">
        <ol class="m-0 flex list-none flex-wrap items-center gap-x-2 p-0">
          @for (m of migalhas(); track $index; let ultima = $last) {
            @if ($index > 0) {
              <li aria-hidden="true">/</li>
            }
            <li [class]="ultima ? 'font-medium text-ink' : ''">
              @if (m.rota) {
                <a [routerLink]="m.rota" class="text-muted no-underline hover:underline">{{
                  m.rotulo
                }}</a>
              } @else {
                {{ m.rotulo }}
              }
            </li>
          }
        </ol>
      </nav>

      <form
        class="hidden md:flex w-full max-w-sm items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 focus-within:border-brand-600"
        role="search"
        (ngSubmit)="buscar()"
      >
        <mat-icon class="text-muted">search</mat-icon>
        <input
          type="search"
          name="busca"
          [(ngModel)]="termo"
          placeholder="Buscar alunos por nome, CPF ou e-mail…"
          aria-label="Buscar alunos"
          class="w-full border-0 bg-transparent py-1 text-sm outline-none"
        />
      </form>

      <a
        mat-flat-button
        color="primary"
        routerLink="/matriculas/cadastro"
        class="!hidden sm:!inline-flex"
      >
        <mat-icon>add</mat-icon> Nova matrícula
      </a>
    </header>
  `,
})
export class TopbarComponent {
  private readonly router = inject(Router);

  readonly abrirMenu = output<void>();
  termo = "";

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  readonly migalhas = computed(() => migalhasDaUrl(this.url()));

  buscar(): void {
    const busca = this.termo.trim();
    this.router.navigate(["/alunos"], { queryParams: busca ? { busca } : {} });
  }
}
