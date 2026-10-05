import { DatePipe } from "@angular/common";
import { Component, inject, OnInit, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Solicitacao, StatusSolicitacao } from "../../core/models/portal.model";
import { SolicitacoesService } from "../../core/services/solicitacoes.service";
import { baixarBlob } from "../portal/baixar-arquivo";

const ROTULO_STATUS: Record<StatusSolicitacao, string> = {
  ABERTA: "Em aberto",
  ATENDIDA: "Atendida",
  RECUSADA: "Recusada",
};

/** Fila de pedidos de documentos feitos pelos alunos: anexar o arquivo ou recusar. */
@Component({
  selector: "app-solicitacoes-fila",
  standalone: true,
  imports: [DatePipe, FormsModule, MatButtonModule],
  template: `
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <h1 class="text-2xl font-medium">Solicitações dos alunos</h1>
      <select class="border rounded px-2 py-1 ml-auto" [ngModel]="filtro()" (ngModelChange)="mudarFiltro($event)">
        <option value="ABERTA">Em aberto</option>
        <option value="ATENDIDA">Atendidas</option>
        <option value="RECUSADA">Recusadas</option>
        <option value="">Todas</option>
      </select>
    </div>

    <div class="bg-white rounded-lg border divide-y">
      @for (s of itens(); track s.id) {
        <div class="p-3">
          <div class="flex flex-wrap items-center gap-3">
            <div class="flex-1 min-w-56">
              <p class="font-medium">{{ s.tipo.nome }}</p>
              <p class="text-xs text-gray-500">
                {{ s.aluno.codigo ?? "—" }} · {{ s.aluno.nome }}
                @if (s.matricula) { · matrícula {{ s.matricula.numeroMatricula ?? "—" }} — {{ s.matricula.curso.nome }} }
              </p>
              <p class="text-xs text-gray-400">Pedido em {{ s.criadoEm | date: "dd/MM/yyyy HH:mm" }}</p>
              @if (s.observacaoAluno) {
                <p class="text-sm mt-1">“{{ s.observacaoAluno }}”</p>
              }
              @if (s.respostaStaff) {
                <p class="text-xs text-gray-600 mt-1">Resposta: {{ s.respostaStaff }}</p>
              }
            </div>
            <span class="text-xs px-2 py-1 rounded-full bg-gray-100">{{ rotulo(s.status) }}</span>

            @if (s.status === "ATENDIDA") {
              <button mat-button type="button" (click)="baixar(s)">Ver arquivo</button>
            }
            @if (s.status === "ABERTA") {
              <button mat-flat-button color="primary" type="button" (click)="seletor.click()">Anexar e atender</button>
              <input #seletor type="file" class="hidden" accept=".pdf,.jpg,.jpeg,.png" (change)="atender(s, $any($event.target))" />
              <button mat-button type="button" (click)="recusando.set(s.id)">Recusar</button>
            }
          </div>

          @if (recusando() === s.id) {
            <div class="flex flex-wrap gap-2 mt-3">
              <input class="border rounded px-2 py-1 flex-1 min-w-56" placeholder="Motivo da recusa (o aluno verá)" [(ngModel)]="motivo" />
              <button mat-flat-button color="warn" type="button" [disabled]="!motivo.trim()" (click)="recusar(s)">Confirmar recusa</button>
              <button mat-button type="button" (click)="recusando.set(null)">Cancelar</button>
            </div>
          }
        </div>
      } @empty {
        <p class="p-4 text-gray-500">Nenhuma solicitação nesta situação.</p>
      }
    </div>
  `,
})
export class SolicitacoesFilaComponent implements OnInit {
  private readonly service = inject(SolicitacoesService);
  private readonly snackBar = inject(MatSnackBar);

  readonly itens = signal<Solicitacao[]>([]);
  readonly filtro = signal<StatusSolicitacao | "">("ABERTA");
  readonly recusando = signal<string | null>(null);
  motivo = "";

  ngOnInit(): void {
    this.carregar();
  }

  rotulo(status: StatusSolicitacao): string {
    return ROTULO_STATUS[status];
  }

  mudarFiltro(valor: StatusSolicitacao | ""): void {
    this.filtro.set(valor);
    this.carregar();
  }

  private carregar(): void {
    this.service.listar(this.filtro() || undefined).subscribe((l) => this.itens.set(l));
  }

  atender(s: Solicitacao, input: HTMLInputElement): void {
    const arquivo = input.files?.[0];
    input.value = "";
    if (!arquivo) return;
    this.service.atender(s.id, arquivo).subscribe(() => {
      this.snackBar.open("Solicitação atendida", "Fechar", { duration: 3000 });
      this.carregar();
    });
  }

  recusar(s: Solicitacao): void {
    this.service.recusar(s.id, this.motivo.trim()).subscribe(() => {
      this.recusando.set(null);
      this.motivo = "";
      this.snackBar.open("Solicitação recusada", "Fechar", { duration: 3000 });
      this.carregar();
    });
  }

  baixar(s: Solicitacao): void {
    this.service.baixar(s.id).subscribe((blob) => baixarBlob(blob, s.arquivoNome ?? "documento"));
  }
}
