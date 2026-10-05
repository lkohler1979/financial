import { DatePipe } from "@angular/common";
import { Component, inject, input, OnInit, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatSnackBar } from "@angular/material/snack-bar";
import { PortalMatricula, Solicitacao, TipoSolicitacao } from "../../core/models/portal.model";
import { PortalService } from "../../core/services/portal.service";
import { baixarBlob } from "./baixar-arquivo";

const ROTULO_STATUS = { ABERTA: "Em análise", ATENDIDA: "Atendida", RECUSADA: "Recusada" } as const;
const CLASSE_STATUS = {
  ABERTA: "bg-amber-100 text-amber-700",
  ATENDIDA: "bg-green-100 text-green-700",
  RECUSADA: "bg-red-100 text-red-700",
} as const;

/** Pedido de declarações/certidões à secretaria e download do que foi atendido. */
@Component({
  selector: "app-portal-solicitacoes",
  standalone: true,
  imports: [DatePipe, FormsModule, MatButtonModule],
  template: `
    <section class="bg-white rounded-lg border p-4 mb-4">
      <p class="text-sm font-medium text-gray-700 mb-2">Nova solicitação</p>
      <div class="flex flex-wrap gap-3 items-end">
        <label class="text-sm">
          <span class="block text-xs text-gray-500">Documento</span>
          <select class="border rounded px-2 py-1 min-w-56" [(ngModel)]="tipoId">
            <option value="">Selecione...</option>
            @for (t of tipos(); track t.id) {
              <option [value]="t.id">{{ t.nome }}</option>
            }
          </select>
        </label>
        @if (matriculas().length > 1) {
          <label class="text-sm">
            <span class="block text-xs text-gray-500">Matrícula</span>
            <select class="border rounded px-2 py-1" [(ngModel)]="matriculaId">
              @for (m of matriculas(); track m.id) {
                <option [value]="m.id">{{ m.numeroMatricula ?? "—" }} · {{ m.curso.nome }}</option>
              }
            </select>
          </label>
        }
        <label class="text-sm flex-1 min-w-48">
          <span class="block text-xs text-gray-500">Observação (opcional)</span>
          <input class="border rounded px-2 py-1 w-full" maxlength="1000" [(ngModel)]="observacao" />
        </label>
        <button mat-flat-button color="primary" type="button" [disabled]="!tipoId || enviando()" (click)="solicitar()">
          Solicitar
        </button>
      </div>
    </section>

    <div class="bg-white rounded-lg border divide-y">
      @for (s of solicitacoes(); track s.id) {
        <div class="p-3 flex flex-wrap items-center gap-3">
          <div class="flex-1 min-w-48">
            <p class="font-medium">{{ s.tipo.nome }}</p>
            <p class="text-xs text-gray-500">
              Pedido em {{ s.criadoEm | date: "dd/MM/yyyy HH:mm" }}
              @if (s.matricula) { · matrícula {{ s.matricula.numeroMatricula ?? "—" }} }
            </p>
            @if (s.respostaStaff) {
              <p class="text-xs mt-1" [class]="s.status === 'RECUSADA' ? 'text-red-600' : 'text-gray-600'">
                {{ s.respostaStaff }}
              </p>
            }
          </div>
          <span class="text-xs px-2 py-1 rounded-full" [class]="classe(s)">{{ rotulo(s) }}</span>
          @if (s.status === "ATENDIDA" && s.arquivoNome) {
            <button mat-stroked-button type="button" (click)="baixar(s)">Baixar</button>
          }
        </div>
      } @empty {
        <p class="p-4 text-gray-500">Você ainda não fez nenhuma solicitação.</p>
      }
    </div>
  `,
})
export class PortalSolicitacoesComponent implements OnInit {
  private readonly portal = inject(PortalService);
  private readonly snackBar = inject(MatSnackBar);

  readonly matriculas = input.required<PortalMatricula[]>();
  readonly tipos = signal<TipoSolicitacao[]>([]);
  readonly solicitacoes = signal<Solicitacao[]>([]);
  readonly enviando = signal(false);

  tipoId = "";
  matriculaId = "";
  observacao = "";

  ngOnInit(): void {
    this.matriculaId = this.matriculas()[0].id;
    this.portal.tiposSolicitacao().subscribe((t) => this.tipos.set(t));
    this.carregar();
  }

  private carregar(): void {
    this.portal.solicitacoes().subscribe((s) => this.solicitacoes.set(s));
  }

  rotulo(s: Solicitacao): string {
    return ROTULO_STATUS[s.status];
  }

  classe(s: Solicitacao): string {
    return CLASSE_STATUS[s.status];
  }

  solicitar(): void {
    this.enviando.set(true);
    this.portal
      .solicitar({
        tipoSolicitacaoId: this.tipoId,
        matriculaId: this.matriculaId || null,
        observacao: this.observacao.trim() || null,
      })
      .subscribe({
        next: () => {
          this.enviando.set(false);
          this.tipoId = "";
          this.observacao = "";
          this.snackBar.open("Solicitação enviada à secretaria", "Fechar", { duration: 4000 });
          this.carregar();
        },
        error: () => this.enviando.set(false),
      });
  }

  baixar(s: Solicitacao): void {
    this.portal.baixarSolicitacao(s.id).subscribe((blob) => baixarBlob(blob, s.arquivoNome ?? "documento"));
  }
}
