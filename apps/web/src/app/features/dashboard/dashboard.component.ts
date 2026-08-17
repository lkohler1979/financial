import { CurrencyPipe, DatePipe, DecimalPipe } from "@angular/common";
import { Component, inject, OnInit } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatTabsModule } from "@angular/material/tabs";
import { DashboardService } from "../../core/services/dashboard.service";
import { DashboardCobranca, DashboardGeral } from "../../core/models/dashboard.model";

@Component({
  selector: "app-dashboard",
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTabsModule,
  ],
  template: `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-medium m-0">Dashboard</h1>
      <button mat-stroked-button type="button" (click)="carregar()">
        <mat-icon>refresh</mat-icon> Atualizar
      </button>
    </div>

    @if (carregandoGeral || carregandoCobranca) {
      <mat-progress-bar mode="indeterminate" class="mb-3"></mat-progress-bar>
    }

    <mat-tab-group>
      <mat-tab label="Geral">
        @if (geral; as d) {
          <div class="pt-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <div class="bg-white rounded-lg border p-4">
                <p class="text-xs text-gray-500 mb-1">Total de alunos</p>
                <p class="text-2xl font-medium m-0">{{ d.indicadores.totalAlunos }}</p>
              </div>
              <div class="bg-white rounded-lg border p-4">
                <p class="text-xs text-gray-500 mb-1">Alunos inadimplentes</p>
                <p class="text-2xl font-medium text-red-700 m-0">
                  {{ d.indicadores.alunosInadimplentes }}
                </p>
              </div>
              <div class="bg-white rounded-lg border p-4">
                <p class="text-xs text-gray-500 mb-1">Valor total vencido</p>
                <p class="text-2xl font-medium m-0">
                  {{ d.indicadores.valorTotalVencido | currency: "BRL" }}
                </p>
              </div>
              <div class="bg-white rounded-lg border p-4">
                <p class="text-xs text-gray-500 mb-1">Última importação</p>
                <p class="text-2xl font-medium m-0">
                  @if (d.indicadores.ultimaImportacao) {
                    {{ d.indicadores.ultimaImportacao.data | date: "dd/MM" }}
                  } @else {
                    —
                  }
                </p>
              </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-5">
              <div class="bg-white rounded-lg border p-4">
                <p class="text-xs text-gray-500 mb-1">Cursos</p>
                <p class="text-xl font-medium m-0">{{ d.indicadores.totalCursosAtivos }} ativos</p>
                <p class="text-xs text-gray-500 m-0">{{ d.indicadores.totalCursos }} cadastrados</p>
              </div>
              <div class="bg-white rounded-lg border p-4">
                <p class="text-xs text-gray-500 mb-1">Matrículas</p>
                <p class="text-xl font-medium m-0">{{ d.indicadores.totalMatriculas }}</p>
                <p class="text-xs text-gray-500 m-0">vínculos aluno/curso</p>
              </div>
              <div class="bg-white rounded-lg border p-4">
                <p class="text-xs text-gray-500 mb-1">Relatórios gerados</p>
                <p class="text-xl font-medium m-0">{{ d.indicadores.relatoriosGerados }}</p>
                <p class="text-xs text-gray-500 m-0">
                  {{ d.indicadores.parcelasVencidas }} parcelas vencidas
                </p>
              </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
              <section class="bg-white rounded-lg border p-4">
                <p class="text-sm font-medium text-gray-700 mb-4">Valor vencido por mês</p>
                <div class="h-44 flex items-end gap-2">
                  @for (item of d.valorVencidoPorMes; track item.mes) {
                    <div class="flex-1 h-full flex flex-col justify-end items-center gap-2">
                      <div
                        class="w-full max-w-10 rounded-t bg-blue-600"
                        [style.height.%]="percentual(item.valor, maxValorVencido(d))"
                        [title]="item.valor | currency: 'BRL'"
                      ></div>
                      <span class="text-[11px] text-gray-500">{{ mesCurto(item.mes) }}</span>
                    </div>
                  }
                </div>
              </section>

              <section class="bg-white rounded-lg border p-4">
                <p class="text-sm font-medium text-gray-700 mb-4">Inadimplência mensal</p>
                <div class="h-44 flex items-end gap-2">
                  @for (item of d.inadimplenciaMensal; track item.mes) {
                    <div class="flex-1 h-full flex flex-col justify-end items-center gap-2">
                      <div
                        class="w-full max-w-10 rounded-t bg-orange-600"
                        [style.height.%]="percentual(item.matriculas, maxInadimplenciaMensal(d))"
                        [title]="item.matriculas + ' matrículas'"
                      ></div>
                      <span class="text-[11px] text-gray-500">{{ mesCurto(item.mes) }}</span>
                    </div>
                  }
                </div>
              </section>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section class="bg-white rounded-lg border p-4">
                <p class="text-sm font-medium text-gray-700 mb-4">Top cursos com inadimplência</p>
                <div class="space-y-3">
                  @for (item of d.inadimplenciaPorCurso; track item.cursoId) {
                    <div>
                      <div class="flex justify-between gap-3 text-sm mb-1">
                        <span class="truncate">{{ item.cursoNome }}</span>
                        <span class="text-gray-500">{{ item.valorTotal | currency: "BRL" }}</span>
                      </div>
                      <div class="h-2 bg-gray-100 rounded">
                        <div
                          class="h-2 bg-red-600 rounded"
                          [style.width.%]="percentual(item.valorTotal, maxCursoValor(d))"
                        ></div>
                      </div>
                    </div>
                  } @empty {
                    <p class="text-sm text-gray-500 m-0">Sem inadimplência vencida.</p>
                  }
                </div>
              </section>

              <section class="bg-white rounded-lg border p-4">
                <p class="text-sm font-medium text-gray-700 mb-4">Evolução histórica</p>
                <div class="space-y-3">
                  @for (item of d.evolucaoHistorica; track item.mes) {
                    <div class="grid grid-cols-[56px_1fr_56px] items-center gap-3 text-sm">
                      <span class="text-gray-500">{{ mesCurto(item.mes) }}</span>
                      <div class="h-2 bg-gray-100 rounded">
                        <div
                          class="h-2 bg-emerald-600 rounded"
                          [style.width.%]="
                            percentual(item.documentosGerados, maxDocumentosHistorico(d))
                          "
                        ></div>
                      </div>
                      <span class="text-right">{{ item.documentosGerados }}</span>
                    </div>
                  }
                </div>
              </section>
            </div>
          </div>
        }
      </mat-tab>

      <mat-tab label="Cobrança">
        @if (cobranca; as c) {
          <div class="pt-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <div class="bg-white rounded-lg border p-4">
                <p class="text-xs text-gray-500 mb-1">Inadimplentes</p>
                <p class="text-2xl font-medium text-red-700 m-0">
                  {{ c.indicadores.inadimplentes }}
                </p>
              </div>
              <div class="bg-white rounded-lg border p-4">
                <p class="text-xs text-gray-500 mb-1">Valor em aberto</p>
                <p class="text-2xl font-medium m-0">
                  {{ c.indicadores.valorEmAberto | currency: "BRL" }}
                </p>
              </div>
              <div class="bg-white rounded-lg border p-4">
                <p class="text-xs text-gray-500 mb-1">Protestado</p>
                <p class="text-2xl font-medium m-0">
                  {{ c.indicadores.valorProtestado | currency: "BRL" }}
                </p>
              </div>
              <div class="bg-white rounded-lg border p-4">
                <p class="text-xs text-gray-500 mb-1">Quitado</p>
                <p class="text-2xl font-medium m-0">
                  {{ c.indicadores.valorQuitado | currency: "BRL" }}
                </p>
              </div>
            </div>

            <section class="bg-white rounded-lg border p-4 mb-5">
              <p class="text-sm font-medium text-gray-700 mb-4">
                Valor em aberto por contrato assinado
              </p>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div class="rounded-lg border p-3">
                  <p class="text-xs text-gray-500 mb-1">Com contrato assinado</p>
                  <p class="text-xl font-medium m-0">
                    {{ c.porContrato.comContrato.valor | currency: "BRL" }}
                  </p>
                  <p class="text-xs text-gray-500 m-0">
                    {{ c.porContrato.comContrato.matriculas }} matrículas
                  </p>
                </div>
                <div class="rounded-lg border p-3">
                  <p class="text-xs text-gray-500 mb-1">Sem contrato assinado</p>
                  <p class="text-xl font-medium m-0">
                    {{ c.porContrato.semContrato.valor | currency: "BRL" }}
                  </p>
                  <p class="text-xs text-gray-500 m-0">
                    {{ c.porContrato.semContrato.matriculas }} matrículas
                  </p>
                </div>
                <div class="rounded-lg border p-3 bg-gray-50">
                  <p class="text-xs text-gray-500 mb-1">Resumo (com + sem)</p>
                  <p class="text-xl font-medium m-0">
                    {{ c.porContrato.resumo.valor | currency: "BRL" }}
                  </p>
                  <p class="text-xs text-gray-500 m-0">
                    {{ c.porContrato.resumo.matriculas }} matrículas
                  </p>
                </div>
              </div>
            </section>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
              <section class="bg-white rounded-lg border p-4">
                <p class="text-sm font-medium text-gray-700 mb-4">Quantidade por situação</p>
                <div class="space-y-3">
                  @for (item of c.porSituacao; track item.id || item.nome) {
                    <div class="grid grid-cols-[1fr_56px] gap-3 items-center">
                      <div>
                        <div class="flex items-center gap-2 text-sm mb-1">
                          <span
                            class="inline-block w-3 h-3 rounded-full"
                            [style.background]="item.cor"
                          ></span>
                          <span class="truncate">{{ item.nome }}</span>
                        </div>
                        <div class="h-2 bg-gray-100 rounded">
                          <div
                            class="h-2 rounded"
                            [style.background]="item.cor"
                            [style.width.%]="percentual(item.quantidade, maxSituacao(c))"
                          ></div>
                        </div>
                      </div>
                      <span class="text-sm text-right">{{ item.quantidade }}</span>
                    </div>
                  } @empty {
                    <p class="text-sm text-gray-500 m-0">Sem situações em aberto.</p>
                  }
                </div>
              </section>

              <section class="bg-white rounded-lg border p-4">
                <p class="text-sm font-medium text-gray-700 mb-4">Ranking de TAGs</p>
                <div class="space-y-3">
                  @for (item of c.rankingTags; track item.tagId) {
                    <div>
                      <div class="flex justify-between gap-3 text-sm mb-1">
                        <span class="truncate">{{ item.nome }}</span>
                        <span class="text-gray-500">{{ item.matriculas }}</span>
                      </div>
                      <div class="h-2 bg-gray-100 rounded">
                        <div
                          class="h-2 bg-indigo-600 rounded"
                          [style.width.%]="percentual(item.matriculas, maxRankingTag(c))"
                        ></div>
                      </div>
                    </div>
                  } @empty {
                    <p class="text-sm text-gray-500 m-0">Nenhuma TAG associada.</p>
                  }
                </div>
              </section>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section class="bg-white rounded-lg border p-4">
                <p class="text-sm font-medium text-gray-700 mb-4">Top 10 cursos</p>
                <div class="space-y-3">
                  @for (item of c.topCursos; track item.cursoId) {
                    <div>
                      <div class="flex justify-between gap-3 text-sm mb-1">
                        <span class="truncate">{{ item.cursoNome }}</span>
                        <span class="text-gray-500">{{ item.valor | currency: "BRL" }}</span>
                      </div>
                      <div class="h-2 bg-gray-100 rounded">
                        <div
                          class="h-2 bg-orange-600 rounded"
                          [style.width.%]="percentual(item.valor, maxCursoCobranca(c))"
                        ></div>
                      </div>
                    </div>
                  } @empty {
                    <p class="text-sm text-gray-500 m-0">Sem cursos com valor vencido.</p>
                  }
                </div>
              </section>

              <section class="bg-white rounded-lg border p-4">
                <p class="text-sm font-medium text-gray-700 mb-4">Relatórios por período</p>
                <div class="space-y-3">
                  @for (item of c.relatoriosPorPeriodo; track item.mes) {
                    <div class="grid grid-cols-[56px_1fr_56px] items-center gap-3 text-sm">
                      <span class="text-gray-500">{{ mesCurto(item.mes) }}</span>
                      <div class="h-2 bg-gray-100 rounded">
                        <div
                          class="h-2 bg-emerald-600 rounded"
                          [style.width.%]="
                            percentual(item.relatoriosGerados, maxRelatoriosPeriodo(c))
                          "
                        ></div>
                      </div>
                      <span class="text-right">{{ item.relatoriosGerados }}</span>
                    </div>
                  }
                </div>
              </section>
            </div>
          </div>
        }
      </mat-tab>
    </mat-tab-group>
  `,
})
export class DashboardComponent implements OnInit {
  private readonly service = inject(DashboardService);

  geral?: DashboardGeral;
  cobranca?: DashboardCobranca;
  carregandoGeral = false;
  carregandoCobranca = false;

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregandoGeral = true;
    this.carregandoCobranca = true;

    this.service.geral().subscribe({
      next: (dashboard) => {
        this.geral = dashboard;
        this.carregandoGeral = false;
      },
      error: () => (this.carregandoGeral = false),
    });

    this.service.cobranca().subscribe({
      next: (dashboard) => {
        this.cobranca = dashboard;
        this.carregandoCobranca = false;
      },
      error: () => (this.carregandoCobranca = false),
    });
  }

  mesCurto(mes: string): string {
    const [ano, mesNumero] = mes.split("-");
    return `${mesNumero}/${ano.slice(2)}`;
  }

  percentual(valor: number, maximo: number): number {
    if (maximo <= 0 || valor <= 0) return 0;
    return Math.max(6, Math.round((valor / maximo) * 100));
  }

  maxValorVencido(dashboard: DashboardGeral): number {
    return Math.max(0, ...dashboard.valorVencidoPorMes.map((item) => item.valor));
  }

  maxInadimplenciaMensal(dashboard: DashboardGeral): number {
    return Math.max(0, ...dashboard.inadimplenciaMensal.map((item) => item.matriculas));
  }

  maxCursoValor(dashboard: DashboardGeral): number {
    return Math.max(0, ...dashboard.inadimplenciaPorCurso.map((item) => item.valorTotal));
  }

  maxDocumentosHistorico(dashboard: DashboardGeral): number {
    return Math.max(0, ...dashboard.evolucaoHistorica.map((item) => item.documentosGerados));
  }

  maxSituacao(dashboard: DashboardCobranca): number {
    return Math.max(0, ...dashboard.porSituacao.map((item) => item.quantidade));
  }

  maxRankingTag(dashboard: DashboardCobranca): number {
    return Math.max(0, ...dashboard.rankingTags.map((item) => item.matriculas));
  }

  maxCursoCobranca(dashboard: DashboardCobranca): number {
    return Math.max(0, ...dashboard.topCursos.map((item) => item.valor));
  }

  maxRelatoriosPeriodo(dashboard: DashboardCobranca): number {
    return Math.max(0, ...dashboard.relatoriosPorPeriodo.map((item) => item.relatoriosGerados));
  }
}
