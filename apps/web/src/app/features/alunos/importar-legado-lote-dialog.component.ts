import { DatePipe, DecimalPipe } from "@angular/common";
import { Component, inject, OnDestroy, OnInit, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatDialogModule } from "@angular/material/dialog";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { ImportacaoLegadoService, LoteLegado } from "../../core/services/importacao-legado.service";

const INTERVALO_MS = 3000;

/**
 * "Buscar todos do legado": dispara a varredura de todos os alunos do sistema legado (que só
 * oferece busca por prefixo do nome) e a importação de aluno, matrícula e parcelas em segundo
 * plano. A tela só acompanha o andamento — pode ser fechada e reaberta sem interromper o job.
 */
@Component({
  selector: "app-importar-legado-lote-dialog",
  standalone: true,
  imports: [DatePipe, DecimalPipe, MatButtonModule, MatDialogModule, MatProgressBarModule],
  template: `
    <h2 mat-dialog-title>Buscar todos os alunos do legado</h2>
    <mat-dialog-content>
      <p class="text-sm text-gray-600 mt-0">
        Lista todas as pessoas do sistema legado e importa, para cada uma, o aluno (se ainda não existe), as
        matrículas e as parcelas dos cursos <strong>cujo nome é igual ao de um curso do Ethos</strong>. Cursos que
        não existirem aqui são ignorados e listados no resumo — cadastre-os e rode de novo (parcelas já importadas só
        têm a situação de pagamento atualizada). Leva alguns minutos e continua em segundo plano.
      </p>

      @if (lote(); as l) {
        <div class="border rounded-lg p-4 bg-gray-50 mb-3">
          <p class="m-0 text-sm font-medium">
            @switch (l.status) {
              @case ("ENUMERANDO") { Listando os alunos no legado… }
              @case ("IMPORTANDO") { Importando alunos, matrículas e parcelas… }
              @case ("CONCLUIDO") { Concluída em {{ l.finalizadoEm | date: "dd/MM/yyyy HH:mm" }} }
              @case ("FALHOU") { A busca falhou }
            }
          </p>

          @if (l.status === "ENUMERANDO") {
            <mat-progress-bar mode="indeterminate" class="my-2"></mat-progress-bar>
            <p class="text-xs text-gray-600 m-0">{{ l.consultas | number }} consultas · {{ l.pessoasEncontradas | number }} pessoas encontradas</p>
          } @else if (l.status === "IMPORTANDO") {
            <mat-progress-bar mode="determinate" [value]="percentual(l)" class="my-2"></mat-progress-bar>
            <p class="text-xs text-gray-600 m-0">
              {{ l.pessoasProcessadas | number }} de {{ l.pessoasEncontradas | number }} pessoas ({{ percentual(l) }}%)
            </p>
          }
          @if (l.status === "FALHOU" && l.mensagemFalha) {
            <p class="text-sm text-red-600 mt-2 mb-0">{{ l.mensagemFalha }}</p>
          }

          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 text-sm">
            <div><span class="block text-xs text-gray-500">Alunos criados</span>{{ l.alunosCriados | number }}</div>
            <div><span class="block text-xs text-gray-500">Matrículas novas</span>{{ l.matriculasNovas | number }}</div>
            <div><span class="block text-xs text-gray-500">Parcelas novas</span>{{ l.parcelasNovas | number }}</div>
            <div><span class="block text-xs text-gray-500">Parcelas atualizadas</span>{{ l.parcelasAtualizadas | number }}</div>
            <div><span class="block text-xs text-gray-500">Sem CPF (ignorados)</span>{{ l.semCpf | number }}</div>
            <div [class]="l.erros ? 'text-red-600' : ''"><span class="block text-xs text-gray-500">Com erro</span>{{ l.erros | number }}</div>
          </div>
        </div>

        @if (cursosIgnorados(l).length) {
          <p class="text-sm font-medium mb-1">Cursos do legado sem correspondência no Ethos</p>
          <ul class="text-xs text-gray-700 mt-0 pl-5 max-h-40 overflow-auto">
            @for (c of cursosIgnorados(l); track c.nome) {
              <li>{{ c.nome || "(matrícula sem curso)" }} — {{ c.quantidade }} matrícula(s)</li>
            }
          </ul>
        }
        @if (l.detalhes?.erros?.length) {
          <p class="text-sm font-medium mb-1 text-red-700">Erros (primeiros {{ l.detalhes?.erros?.length }})</p>
          <ul class="text-xs text-red-700 mt-0 pl-5 max-h-32 overflow-auto">
            @for (e of l.detalhes?.erros; track e) { <li>{{ e }}</li> }
          </ul>
        }
      } @else if (carregado()) {
        <p class="text-sm text-gray-500">Nenhuma busca em lote foi feita ainda.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Fechar</button>
      <button mat-flat-button color="primary" type="button" [disabled]="emAndamento() || iniciando()" (click)="iniciar()">
        {{ lote() ? "Buscar novamente" : "Iniciar busca" }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ImportarLegadoLoteDialogComponent implements OnInit, OnDestroy {
  private readonly service = inject(ImportacaoLegadoService);

  readonly lote = signal<LoteLegado | null>(null);
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
    const status = this.lote()?.status;
    return status === "ENUMERANDO" || status === "IMPORTANDO";
  }

  percentual(l: LoteLegado): number {
    return l.pessoasEncontradas ? Math.min(100, Math.floor((l.pessoasProcessadas / l.pessoasEncontradas) * 100)) : 0;
  }

  cursosIgnorados(l: LoteLegado): { nome: string; quantidade: number }[] {
    return Object.entries(l.cursosSemCorrespondencia ?? {})
      .map(([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade);
  }

  private atualizar(): void {
    this.service.ultimoLote().subscribe({
      next: (lote) => {
        this.lote.set(lote);
        this.carregado.set(true);
      },
      error: () => this.carregado.set(true),
    });
  }

  iniciar(): void {
    this.iniciando.set(true);
    this.service.iniciarLote().subscribe({
      next: (lote) => {
        this.lote.set(lote);
        this.iniciando.set(false);
      },
      error: () => this.iniciando.set(false),
    });
  }
}
