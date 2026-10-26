import { Component, computed, inject, output } from "@angular/core";
import { Router, RouterLink, RouterLinkActive } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";
import { AuthService } from "../../core/auth/auth.service";
import { iniciaisDe } from "../utils/iniciais";
import { LogoComponent } from "./logo.component";
import { menuDoPerfil } from "./navegacao";

const ROTULO_PERFIL = {
  ADMINISTRADOR: "Administrador",
  FINANCEIRO: "Financeiro",
  USUARIO: "Usuário",
} as const;

/** Menu lateral: marca, grupos de navegação (Acadêmico, Financeiro, sistema) e o usuário logado. */
@Component({
  selector: "app-sidebar",
  standalone: true,
  imports: [RouterLink, RouterLinkActive, MatIconModule, LogoComponent],
  template: `
    <div class="flex h-full flex-col bg-white">
      <div class="px-5 pt-5 pb-4">
        <a routerLink="/" aria-label="Ethos Financial — início" (click)="navegou.emit()">
          <app-logo />
        </a>
      </div>

      <nav class="flex-1 overflow-y-auto px-3 pb-3" aria-label="Menu principal">
        @for (grupo of menu(); track $index) {
          <div [class]="grupo.rodape ? 'mt-4 border-t border-line pt-4' : 'mt-3 first:mt-0'">
            @if (grupo.rotulo) {
              <p class="mb-1 px-3 text-xs font-medium uppercase tracking-wide text-muted">
                {{ grupo.rotulo }}
              </p>
            }
            @for (item of grupo.itens; track item.rota) {
              <a
                [routerLink]="item.rota"
                routerLinkActive="ef-nav-ativo"
                (click)="navegou.emit()"
                class="ef-nav-item"
              >
                <mat-icon>{{ item.icone }}</mat-icon>
                <span>{{ item.rotulo }}</span>
              </a>
            }
          </div>
        }
      </nav>

      <div class="flex items-center gap-3 border-t border-line px-4 py-4">
        <span class="ef-avatar" style="background: #0b837e; color: #fff">{{ iniciais() }}</span>
        <div class="min-w-0 flex-1 leading-tight">
          <p class="m-0 truncate text-sm font-semibold">{{ auth.usuario()?.nome }}</p>
          <p class="m-0 text-xs text-muted">{{ perfil() }}</p>
        </div>
        <button type="button" class="ef-icon-btn" aria-label="Sair" title="Sair" (click)="sair()">
          <mat-icon>logout</mat-icon>
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .ef-nav-item {
        display: flex;
        align-items: center;
        gap: 14px;
        margin: 2px 0;
        padding: 10px 12px;
        border-radius: 10px;
        color: #2b3a44;
        font-size: 15px;
        text-decoration: none;
      }
      .ef-nav-item:hover {
        background: #f1f5f6;
      }
      .ef-nav-item .mat-icon {
        color: #3a4a54;
      }
      .ef-nav-ativo,
      .ef-nav-ativo:hover {
        background: var(--ef-brand-soft);
        color: var(--ef-brand-dark);
        font-weight: 600;
      }
      .ef-nav-ativo .mat-icon {
        color: var(--ef-brand);
      }
      .ef-icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border: 0;
        border-radius: 8px;
        background: none;
        color: #3a4a54;
        cursor: pointer;
      }
      .ef-icon-btn:hover {
        background: #f1f5f6;
      }
    `,
  ],
})
export class SidebarComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Avisa que uma página foi aberta (no celular, o menu se fecha). */
  readonly navegou = output<void>();

  readonly menu = computed(() => menuDoPerfil(this.auth.usuario()?.perfil));
  readonly iniciais = computed(() => iniciaisDe(this.auth.usuario()?.nome ?? ""));
  readonly perfil = computed(() => {
    const p = this.auth.usuario()?.perfil;
    return p ? ROTULO_PERFIL[p] : "";
  });

  sair(): void {
    this.auth.logout();
    this.router.navigate(["/login"]);
  }
}
