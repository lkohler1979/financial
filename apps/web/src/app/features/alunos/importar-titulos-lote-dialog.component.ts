import { DatePipe, DecimalPipe } from "@angular/common";
import { Component, inject, OnDestroy, OnInit, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatDialogModule } from "@angular/material/dialog";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { LoteTitulos } from "../../core/models/titulo-aluno.model";
import { ImportacaoLegadoService } from "../../core/services/importacao-legado.service";
import { formatarCpf } from "../../shared/utils/cpf.util";

const INTERVALO_MS = 3000;

/**
 * "Buscar títulos não importados": para cada aluno, consulta o legado e grava só os títulos que
 * faltam — parcela da matrícula (se o aluno tem o curso) ou título sem matrícula (aparece só na
 * tela de títulos do aluno). Não cria aluno nem matrícula. Roda em segundo plano: a tela só
 * acompanha o andamento e pode ser fechada e reaberta.
 */
@Component({
  selector: "app-importar-titulos-lote-dialog",
  standalone: true,
  imports: [DatePipe, DecimalPipe, MatButtonModule, MatDialogModule, MatProgressBarModule],
  template: `
    <h2 mat-dialog-title>Buscar títulos não importados</h2>
    <mat-dialog-content>
      <p class="text-sm text-gray-600 mt-0">
        Para cada aluno, consulta o sistema legado pelo CPF e grava só os títulos que ainda não
        estão no Ethos: os do curso em que o aluno tem matrícula entram como
        <strong>parcelas da matrícula</strong>; os de outros cursos ficam
        <strong>sem matrícula</strong> e aparecem só na tela de títulos do aluno. Não cria aluno nem
        matrícula, não altera o que já foi importado e pode rodar de novo sem duplicar. Se o legado
        falhar, espera 1 minuto e continua de onde parou.
      </p>

      @if (lote(); as l) {
        <div class="border rounded-lg p-4 bg-gray-50 mb-3">
          <p class="m-0 text-sm font-medium">
            @switch (l.status) {
              @case ("EM_ANDAMENTO") {
                Consultando o legado…
              }
              @case ("CONCLUIDO") {
                Concluída em {{ l.finalizadoEm | date: "dd/MM/yyyy HH:mm" }}
              }
              @case ("FALHOU") {
                A busca parou
              }
            }
          </p>
          @if (l.status === "EM_ANDAMENTO") {
            <mat-progress-bar
              mode="determinate"
              [value]="percentual(l)"
              class="my-2"
            ></mat-progress-bar>
          }
          <p class="text-xs text-gray-600 m-0">
            {{ l.processados | number }} de {{ l.total | number }} alunos ({{ percentual(l) }}%)
          </p>
          @if (l.status === "FALHOU" && l.mensagemFalha) {
            <p class="text-sm text-red-600 mt-2 mb-0">{{ l.mensagemFalha }}</p>
          }

          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 text-sm">
            <div>
              <span class="block text-xs text-gray-500">Parcelas novas em matrículas</span
              >{{ l.parcelasNovas | number }}
            </div>
            <div>
              <span class="block text-xs text-gray-500">Títulos sem matrícula</span
              >{{ l.titulosSemMatricula | number }}
            </div>
            <div>
              <span class="block text-xs text-gray-500">Já importados</span
              >{{ l.jaImportados | number }}
            </div>
            <div>
              <span class="block text-xs text-gray-500">Ignorados (sem vencimento)</span
              >{{ l.ignorados | number }}
            </div>
            <div>
              <span class="block text-xs text-gray-500">Alunos não achados no legado</span
              >{{ l.alunosNaoEncontrados | number }}
            </div>
            <div [class]="l.alunosComErro ? 'text-red-600' : ''">
              <span class="block text-xs text-gray-500">Alunos com erro</span
              >{{ l.alunosComErro | number }}
            </div>
          </div>
        </div>

        @if (l.problemas?.length) {
          <p class="text-sm font-medium mb-1">
            Alunos com erro (primeiros {{ l.problemas!.length }})
          </p>
          <ul class="text-sm mt-0 pl-5 max-h-40 overflow-auto">
            @for (p of l.problemas; track p.cpf) {
              <li class="text-amber-800">{{ p.alunoNome }} ({{ cpf(p.cpf) }}): {{ p.motivo }}</li>
            }
          </ul>
        }
      } @else if (carregado()) {
        <p class="text-sm text-gray-500">Nenhuma busca de títulos foi feita ainda.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Fechar</button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="emAndamento() || iniciando()"
        (click)="iniciar()"
      >
        {{ lote() ? "Buscar novamente" : "Iniciar busca" }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ImportarTitulosLoteDialogComponent implements OnInit, OnDestroy {
  private readonly service = inject(ImportacaoLegadoService);

  readonly lote = signal<LoteTitulos | null>(null);
  readonly carregado = signal(false);
  readonly iniciando = signal(false);
  private temporizador: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.atualizar();
    this.temporizador = setInterval(() => this.atualizar(), INTERVALO_MS);
  }

  ngOnDestroy(): void {
    if (this.temporizador) clearInterval(this.temporizador);
  }

  emAndamento(): boolean {
    return this.lote()?.status === "EM_ANDAMENTO";
  }

  percentual(l: LoteTitulos): number {
    return l.total ? Math.min(100, Math.floor((l.processados / l.total) * 100)) : 0;
  }

  cpf(valor: string): string {
    return formatarCpf(valor);
  }

  private atualizar(): void {
    this.service.ultimoLoteTitulos().subscribe({
      next: (lote) => {
        this.lote.set(lote);
        this.carregado.set(true);
      },
      error: () => this.carregado.set(true),
    });
  }

  iniciar(): void {
    this.iniciando.set(true);
    this.service.iniciarLoteTitulos().subscribe({
      next: (lote) => {
        this.lote.set(lote);
        this.iniciando.set(false);
      },
      error: () => this.iniciando.set(false),
    });
  }
}
