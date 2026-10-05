import { DatePipe } from "@angular/common";
import { Component, inject, input, OnInit, output, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatSnackBar } from "@angular/material/snack-bar";
import {
  classeSituacaoMatricula,
  HistoricoSituacaoMatricula,
  rotuloSituacaoMatricula,
  SituacaoMatriculaOpcao,
} from "../../core/models/matricula.model";
import { MatriculasService } from "../../core/services/matriculas.service";

/** Situação atual da matrícula, troca com motivo/período/observação e histórico. */
@Component({
  selector: "app-situacao-matricula",
  standalone: true,
  imports: [DatePipe, FormsModule, MatButtonModule],
  template: `
    <section class="bg-white rounded-lg border p-4 mb-4">
      <div class="flex flex-wrap items-center gap-3">
        <p class="text-sm font-medium text-gray-700 m-0">Situação da matrícula</p>
        <span class="px-2 py-0.5 rounded text-xs" [class]="classe(situacao())">{{ rotulo(situacao()) }}</span>
        <button mat-stroked-button type="button" class="ml-auto" (click)="aberto.set(!aberto())">
          {{ aberto() ? "Fechar" : "Alterar situação" }}
        </button>
      </div>

      @if (aberto()) {
        <div class="grid gap-3 md:grid-cols-3 mt-4">
          <label class="text-sm">
            <span class="block text-xs text-gray-500">Nova situação</span>
            <select class="border rounded px-2 py-1 w-full" [(ngModel)]="nova">
              <option value="">Selecione...</option>
              @for (s of opcoes(); track s.codigo) {
                @if (s.codigo !== situacao()) {
                  <option [value]="s.codigo">{{ s.nome }}</option>
                }
              }
            </select>
          </label>
          <label class="text-sm">
            <span class="block text-xs text-gray-500">Período letivo</span>
            <input class="border rounded px-2 py-1 w-full" placeholder="Ex.: 2026/2" maxlength="50" [(ngModel)]="periodoLetivo" />
          </label>
          <label class="text-sm">
            <span class="block text-xs text-gray-500">Motivo {{ exigeMotivo() ? "(obrigatório)" : "" }}</span>
            <input class="border rounded px-2 py-1 w-full" maxlength="500" [(ngModel)]="motivo" />
          </label>
          <label class="text-sm md:col-span-3">
            <span class="block text-xs text-gray-500">Observações sobre a mudança</span>
            <textarea class="border rounded px-2 py-1 w-full" rows="2" maxlength="1000" [(ngModel)]="observacoes"></textarea>
          </label>
        </div>
        <div class="mt-3">
          <button mat-flat-button color="primary" type="button" [disabled]="!pode() || salvando()" (click)="salvar()">
            Salvar alteração
          </button>
        </div>
      }

      @if (historico().length > 0) {
        <p class="text-xs text-gray-500 mt-4 mb-1">Histórico</p>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-400">
              <th class="py-1 pr-2">Data</th>
              <th class="pr-2">De → Para</th>
              <th class="pr-2">Período</th>
              <th class="pr-2">Motivo / observações</th>
              <th>Por</th>
            </tr>
          </thead>
          <tbody>
            @for (h of historico(); track h.id) {
              <tr class="border-t align-top">
                <td class="py-1 pr-2 whitespace-nowrap">{{ h.criadoEm | date: "dd/MM/yyyy HH:mm" }}</td>
                <td class="pr-2 whitespace-nowrap">
                  {{ h.situacaoAnterior ? rotulo(h.situacaoAnterior) + " → " : "" }}{{ rotulo(h.situacaoNova) }}
                </td>
                <td class="pr-2">{{ h.periodoLetivo || "—" }}</td>
                <td class="pr-2">
                  {{ h.motivo || "—" }}
                  @if (h.observacoes) { <span class="block text-xs text-gray-500">{{ h.observacoes }}</span> }
                </td>
                <td>{{ h.usuario?.nome ?? "Sistema" }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>
  `,
})
export class SituacaoMatriculaComponent implements OnInit {
  private readonly service = inject(MatriculasService);
  private readonly snackBar = inject(MatSnackBar);

  readonly matriculaId = input.required<string>();
  readonly situacaoInicial = input.required<string>();
  /** Avisa o formulário pai que a situação mudou. */
  readonly alterada = output<string>();

  readonly situacao = signal("");
  readonly aberto = signal(false);
  readonly salvando = signal(false);
  readonly opcoes = signal<SituacaoMatriculaOpcao[]>([]);
  readonly historico = signal<HistoricoSituacaoMatricula[]>([]);

  nova = "";
  periodoLetivo = "";
  motivo = "";
  observacoes = "";

  protected readonly rotulo = rotuloSituacaoMatricula;
  protected readonly classe = classeSituacaoMatricula;

  ngOnInit(): void {
    this.situacao.set(this.situacaoInicial());
    this.service.situacoes().subscribe((o) => this.opcoes.set(o));
    this.carregarHistorico();
  }

  exigeMotivo(): boolean {
    return !!this.opcoes().find((o) => o.codigo === this.nova)?.exigeMotivo;
  }

  pode(): boolean {
    return !!this.nova && (!this.exigeMotivo() || !!this.motivo.trim());
  }

  private carregarHistorico(): void {
    this.service.historicoSituacao(this.matriculaId()).subscribe((h) => this.historico.set(h));
  }

  salvar(): void {
    this.salvando.set(true);
    this.service
      .alterarSituacao(this.matriculaId(), {
        situacao: this.nova,
        periodoLetivo: this.periodoLetivo.trim() || null,
        motivo: this.motivo.trim() || null,
        observacoes: this.observacoes.trim() || null,
      })
      .subscribe({
        next: (r) => {
          this.salvando.set(false);
          this.situacao.set(r.situacao);
          this.alterada.emit(r.situacao);
          this.nova = this.periodoLetivo = this.motivo = this.observacoes = "";
          this.aberto.set(false);
          this.snackBar.open("Situação alterada", "Fechar", { duration: 3000 });
          this.carregarHistorico();
        },
        error: () => this.salvando.set(false),
      });
  }
}
