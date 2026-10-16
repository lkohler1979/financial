import { DatePipe, DecimalPipe } from "@angular/common";
import { Component, inject, OnDestroy, OnInit, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatDialogModule } from "@angular/material/dialog";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { ImportacaoLegadoService, LoteLegado } from "../../core/services/importacao-legado.service";

const INTERVALO_MS = 3000;

/** Rótulo de cada tipo de linha do relatório (na ordem em que aparecem na tela). */
const TIPOS_OCORRENCIA: { tipo: string; rotulo: string; alerta: boolean }[] = [
  { tipo: "ALUNO_SEM_CPF", rotulo: "Pessoas sem CPF", alerta: true },
  { tipo: "MATRICULA_NAO_REALIZADA", rotulo: "Matrículas não realizadas", alerta: true },
  { tipo: "PARCELA_NAO_IMPORTADA", rotulo: "Parcelas não importadas", alerta: true },
  { tipo: "ERRO", rotulo: "Erros", alerta: true },
  { tipo: "VARREDURA_INCOMPLETA", rotulo: "Varredura incompleta", alerta: true },
  { tipo: "ALUNO_SEM_MATRICULA", rotulo: "Alunos sem matrícula no legado", alerta: false },
  { tipo: "CURSO_CRIADO", rotulo: "Cursos criados (completar cadastro)", alerta: false },
];

/**
 * "Buscar todos do legado": dispara a varredura de todos os alunos do sistema legado (que só
 * oferece busca por prefixo do nome) e a importação de aluno, matrícula e parcelas em segundo
 * plano. A tela só acompanha o andamento — pode ser fechada e reaberta sem interromper o job — e
 * baixa o relatório com tudo que ficou de fora.
 */
@Component({
  selector: "app-importar-legado-lote-dialog",
  standalone: true,
  imports: [DatePipe, DecimalPipe, MatButtonModule, MatDialogModule, MatProgressBarModule],
  template: `
    <h2 mat-dialog-title>Buscar todos os alunos do legado</h2>
    <mat-dialog-content>
      <p class="text-sm text-gray-600 mt-0">
        Lista todas as pessoas do sistema legado e importa, para cada uma, o aluno (quem tem CPF),
        as matrículas e as parcelas. Curso que ainda não existe no Ethos é
        <strong>cadastrado automaticamente</strong> (com o código do legado) e depois vêm a
        matrícula e as parcelas. O que não entrar — pessoas sem CPF, matrículas, parcelas, erros —
        vai para o <strong>relatório</strong>, para análise. Pode rodar de novo sem duplicar. Leva
        alguns minutos e continua em segundo plano.
      </p>

      @if (lote(); as l) {
        <div class="border rounded-lg p-4 bg-gray-50 mb-3">
          <p class="m-0 text-sm font-medium">
            @switch (l.status) {
              @case ("ENUMERANDO") {
                Listando os alunos no legado…
              }
              @case ("IMPORTANDO") {
                Importando alunos, matrículas e parcelas…
              }
              @case ("CONCLUIDO") {
                Concluída em {{ l.finalizadoEm | date: "dd/MM/yyyy HH:mm" }}
              }
              @case ("FALHOU") {
                A busca falhou
              }
            }
          </p>

          @if (l.status === "ENUMERANDO") {
            <mat-progress-bar mode="indeterminate" class="my-2"></mat-progress-bar>
            <p class="text-xs text-gray-600 m-0">
              {{ l.consultas | number }} consultas · {{ l.pessoasEncontradas | number }} pessoas
              encontradas
            </p>
          } @else if (l.status === "IMPORTANDO") {
            <mat-progress-bar
              mode="determinate"
              [value]="percentual(l)"
              class="my-2"
            ></mat-progress-bar>
            <p class="text-xs text-gray-600 m-0">
              {{ l.pessoasProcessadas | number }} de {{ l.pessoasEncontradas | number }} pessoas ({{
                percentual(l)
              }}%)
            </p>
          }
          @if (l.status === "FALHOU" && l.mensagemFalha) {
            <p class="text-sm text-red-600 mt-2 mb-0">{{ l.mensagemFalha }}</p>
          }

          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 text-sm">
            <div>
              <span class="block text-xs text-gray-500">Alunos criados</span
              >{{ l.alunosCriados | number }}
            </div>
            <div>
              <span class="block text-xs text-gray-500">Matrículas novas</span
              >{{ l.matriculasNovas | number }}
            </div>
            <div>
              <span class="block text-xs text-gray-500">Cursos criados</span
              >{{ l.cursosCriados | number }}
            </div>
            <div>
              <span class="block text-xs text-gray-500">Parcelas novas</span
              >{{ l.parcelasNovas | number }}
            </div>
            <div>
              <span class="block text-xs text-gray-500">Parcelas atualizadas</span
              >{{ l.parcelasAtualizadas | number }}
            </div>
            <div [class]="l.erros ? 'text-red-600' : ''">
              <span class="block text-xs text-gray-500">Pessoas com erro</span
              >{{ l.erros | number }}
            </div>
          </div>
        </div>

        @if (ocorrencias(l).length) {
          <p class="text-sm font-medium mb-1">Relatório para análise</p>
          <ul class="text-sm mt-0 pl-5">
            @for (o of ocorrencias(l); track o.tipo) {
              <li [class]="o.alerta ? 'text-amber-800' : 'text-gray-700'">
                {{ o.rotulo }}: <strong>{{ o.quantidade | number }}</strong>
              </li>
            }
          </ul>
        } @else if (l.status === "CONCLUIDO") {
          <p class="text-sm text-green-700">Nada ficou de fora: nenhuma ocorrência no relatório.</p>
        }
      } @else if (carregado()) {
        <p class="text-sm text-gray-500">Nenhuma busca em lote foi feita ainda.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Fechar</button>
      @if (lote(); as l) {
        <button
          mat-stroked-button
          type="button"
          [disabled]="baixando() || l.status === 'ENUMERANDO'"
          (click)="baixarRelatorio()"
        >
          Baixar relatório (Excel)
        </button>
      }
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
export class ImportarLegadoLoteDialogComponent implements OnInit, OnDestroy {
  private readonly service = inject(ImportacaoLegadoService);

  readonly lote = signal<LoteLegado | null>(null);
  readonly carregado = signal(false);
  readonly iniciando = signal(false);
  readonly baixando = signal(false);
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
    return l.pessoasEncontradas
      ? Math.min(100, Math.floor((l.pessoasProcessadas / l.pessoasEncontradas) * 100))
      : 0;
  }

  /** Só os tipos que têm linhas no relatório, na ordem de análise. */
  ocorrencias(
    l: LoteLegado,
  ): { tipo: string; rotulo: string; alerta: boolean; quantidade: number }[] {
    return TIPOS_OCORRENCIA.map((t) => ({
      ...t,
      quantidade: l.ocorrenciasPorTipo?.[t.tipo] ?? 0,
    })).filter((t) => t.quantidade > 0);
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
        this.lote.set({ ...lote, ocorrenciasPorTipo: {} });
        this.iniciando.set(false);
      },
      error: () => this.iniciando.set(false),
    });
  }

  baixarRelatorio(): void {
    this.baixando.set(true);
    this.service.baixarRelatorioLote().subscribe({
      next: (arquivo) => {
        const url = URL.createObjectURL(arquivo);
        const link = document.createElement("a");
        link.href = url;
        link.download = `importacao-legado-${new Date().toISOString().slice(0, 10)}.xlsx`;
        link.click();
        URL.revokeObjectURL(url);
        this.baixando.set(false);
      },
      error: () => this.baixando.set(false),
    });
  }
}
