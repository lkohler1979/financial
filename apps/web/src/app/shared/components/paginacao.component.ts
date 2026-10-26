import { Component, computed, input, output } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { numerosDePagina, resumoDaPagina } from "../utils/paginacao";

/**
 * Rodapé de tabela: "Mostrando 1–8 de 2.885 alunos", linhas por página e páginas numeradas
 * (padrão docs/especificacao). A página é contada a partir de 1.
 */
@Component({
  selector: "app-paginacao",
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
      <span class="text-muted" data-testid="resumo-pagina">
        {{ resumo() }}{{ total() > 0 ? " " + rotuloItens() : "" }}
      </span>

      <div class="flex flex-wrap items-center gap-4">
        <label class="flex items-center gap-2 text-muted">
          Linhas por página
          <select
            class="rounded-lg border border-line bg-white px-2 py-1.5 text-ink"
            [value]="tamanho()"
            (change)="alterarTamanho($any($event.target).value)"
          >
            @for (opcao of opcoes(); track opcao) {
              <option [value]="opcao" [selected]="opcao === tamanho()">{{ opcao }}</option>
            }
          </select>
        </label>

        @if (totalPaginas() > 1) {
          <nav class="flex items-center gap-1" aria-label="Páginas">
            <button
              type="button"
              class="ef-pg"
              aria-label="Página anterior"
              [disabled]="pagina() <= 1"
              (click)="ir(pagina() - 1)"
            >
              <mat-icon>chevron_left</mat-icon>
            </button>
            @for (n of numeros(); track $index) {
              @if (n === "…") {
                <span class="px-1 text-muted" aria-hidden="true">…</span>
              } @else {
                <button
                  type="button"
                  class="ef-pg"
                  [class.ef-pg-atual]="n === pagina()"
                  [attr.aria-current]="n === pagina() ? 'page' : null"
                  (click)="ir(+n)"
                >
                  {{ n }}
                </button>
              }
            }
            <button
              type="button"
              class="ef-pg"
              aria-label="Próxima página"
              [disabled]="pagina() >= totalPaginas()"
              (click)="ir(pagina() + 1)"
            >
              <mat-icon>chevron_right</mat-icon>
            </button>
          </nav>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .ef-pg {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 34px;
        height: 34px;
        padding: 0 6px;
        border: 0;
        border-radius: 8px;
        background: none;
        color: var(--ef-ink);
        font: inherit;
        cursor: pointer;
      }
      .ef-pg:hover:not(:disabled) {
        background: #f1f5f6;
      }
      .ef-pg:disabled {
        color: #b6c0c6;
        cursor: default;
      }
      .ef-pg-atual,
      .ef-pg-atual:hover:not(:disabled) {
        background: var(--ef-brand-soft);
        color: var(--ef-brand-dark);
        font-weight: 600;
      }
    `,
  ],
})
export class PaginacaoComponent {
  readonly total = input.required<number>();
  readonly pagina = input.required<number>();
  readonly tamanho = input.required<number>();
  readonly opcoes = input<number[]>([10, 20, 50, 100]);
  /** O que se está contando, no plural ("alunos"). */
  readonly rotuloItens = input("registros");

  readonly paginaAlterada = output<number>();
  readonly tamanhoAlterado = output<number>();

  readonly totalPaginas = computed(() => Math.max(1, Math.ceil(this.total() / this.tamanho())));
  readonly numeros = computed(() => numerosDePagina(this.pagina(), this.totalPaginas()));
  readonly resumo = computed(() => resumoDaPagina(this.pagina(), this.tamanho(), this.total()));

  ir(pagina: number): void {
    if (pagina < 1 || pagina > this.totalPaginas() || pagina === this.pagina()) return;
    this.paginaAlterada.emit(pagina);
  }

  alterarTamanho(valor: string): void {
    this.tamanhoAlterado.emit(Number(valor));
  }
}
