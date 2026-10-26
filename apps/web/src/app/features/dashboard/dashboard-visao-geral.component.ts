import { CurrencyPipe, DecimalPipe, PercentPipe } from "@angular/common";
import { Component, inject, OnInit, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { DashboardVisaoGeral } from "../../core/models/dashboard.model";
import { DashboardService } from "../../core/services/dashboard.service";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * Visão geral da operação: quem são os alunos, quanto há em aberto, vencido e a vencer, quanto
 * entrou, e onde está o problema (por curso, faixa de atraso, tipo de título e maiores devedores).
 */
@Component({
  selector: "app-dashboard-visao-geral",
  standalone: true,
  imports: [
    CurrencyPipe,
    DecimalPipe,
    PercentPipe,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  template: `
    @if (carregando()) {
      <mat-progress-bar mode="indeterminate" class="mb-3"></mat-progress-bar>
    }

    @if (d(); as v) {
      <div class="pt-4">
        <!-- Carteira -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <div class="ef-card p-4">
            <p class="text-xs text-gray-500 mb-1">Em aberto</p>
            <p class="text-2xl font-semibold m-0">
              {{ v.indicadores.valorEmAberto | currency: "BRL" }}
            </p>
            <p class="text-xs text-gray-500 m-0">
              {{ v.indicadores.parcelasEmAberto | number }} parcelas
            </p>
          </div>
          <div class="ef-card p-4">
            <p class="text-xs text-gray-500 mb-1">Vencido</p>
            <p class="text-2xl font-semibold text-red-700 m-0">
              {{ v.indicadores.valorVencido | currency: "BRL" }}
            </p>
            <p class="text-xs text-gray-500 m-0">
              {{ v.indicadores.parcelasVencidas | number }} parcelas ·
              {{ v.indicadores.alunosInadimplentes | number }} alunos
            </p>
          </div>
          <div class="ef-card p-4">
            <p class="text-xs text-gray-500 mb-1">A vencer</p>
            <p class="text-2xl font-semibold text-blue-700 m-0">
              {{ v.indicadores.valorAVencer | currency: "BRL" }}
            </p>
            <p class="text-xs text-gray-500 m-0">
              {{ v.indicadores.parcelasAVencer | number }} parcelas · próximos 30 dias:
              {{ v.indicadores.valorAVencer30Dias | currency: "BRL" }}
            </p>
          </div>
          <div class="ef-card p-4">
            <p class="text-xs text-gray-500 mb-1">Recebido no mês</p>
            <p class="text-2xl font-semibold text-emerald-700 m-0">
              {{ v.indicadores.recebidoMes | currency: "BRL" }}
            </p>
            <p class="text-xs text-gray-500 m-0">
              mês anterior: {{ v.indicadores.recebidoMesAnterior | currency: "BRL" }}
            </p>
          </div>
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-5">
          <div class="ef-card p-3">
            <p class="text-xs text-gray-500 mb-1">Alunos</p>
            <p class="text-xl font-medium m-0">{{ v.indicadores.totalAlunos | number }}</p>
            <p class="text-xs text-gray-500 m-0">
              {{ v.indicadores.alunosComMatricula | number }} com matrícula
            </p>
          </div>
          <div class="ef-card p-3">
            <p class="text-xs text-gray-500 mb-1">Matrículas</p>
            <p class="text-xl font-medium m-0">{{ v.indicadores.totalMatriculas | number }}</p>
            <p class="text-xs text-gray-500 m-0">
              {{ v.indicadores.matriculasInadimplentes | number }} em atraso
            </p>
          </div>
          <div class="ef-card p-3">
            <p class="text-xs text-gray-500 mb-1">Cursos</p>
            <p class="text-xl font-medium m-0">{{ v.indicadores.totalCursos | number }}</p>
            <p class="text-xs text-gray-500 m-0">
              {{ v.indicadores.cursosComMatricula | number }} com matrículas
            </p>
          </div>
          <div class="ef-card p-3">
            <p class="text-xs text-gray-500 mb-1">Atraso médio</p>
            <p class="text-xl font-medium m-0">
              {{ v.indicadores.diasMedioAtraso | number: "1.0-0" }} dias
            </p>
            <p class="text-xs text-gray-500 m-0">
              maior: {{ v.indicadores.maiorAtrasoDias | number }} dias
            </p>
          </div>
          <div class="ef-card p-3">
            <p class="text-xs text-gray-500 mb-1">Inadimplência</p>
            <p class="text-xl font-medium m-0">
              {{ v.indicadores.percentualInadimplencia / 100 | percent: "1.1-1" }}
            </p>
            <p class="text-xs text-gray-500 m-0">vencido ÷ (vencido + recebido)</p>
          </div>
          <div class="ef-card p-3">
            <p class="text-xs text-gray-500 mb-1">Ticket médio</p>
            <p class="text-xl font-medium m-0">{{ v.indicadores.ticketMedio | currency: "BRL" }}</p>
            <p class="text-xs text-gray-500 m-0">
              paga em média {{ prazo(v.indicadores.prazoMedioPagamentoDias) }}
            </p>
          </div>
        </div>

        <!-- Séries mensais -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          <section class="ef-card p-4">
            <p class="text-sm font-medium text-gray-700 mb-1">Matrículas por mês</p>
            <p class="text-xs text-gray-500 mt-0 mb-3">
              pela data da matrícula ou, quando não há, pelo 1º vencimento
            </p>
            <div class="h-40 flex items-end gap-1.5">
              @for (item of v.matriculasPorMes; track item.mes) {
                <div class="flex-1 h-full flex flex-col justify-end items-center gap-1">
                  <span class="text-[10px] text-gray-500">{{ item.matriculas || "" }}</span>
                  <div
                    class="w-full max-w-9 rounded-t bg-brand-700"
                    [style.height.%]="pct(item.matriculas, maxMatriculas(v))"
                    [title]="item.matriculas + ' matrículas'"
                  ></div>
                  <span class="text-[11px] text-gray-500">{{ mesCurto(item.mes) }}</span>
                </div>
              }
            </div>
          </section>

          <section class="ef-card p-4">
            <p class="text-sm font-medium text-gray-700 mb-1">Alunos novos por mês</p>
            <p class="text-xs text-gray-500 mt-0 mb-3">mês da primeira matrícula de cada aluno</p>
            <div class="h-40 flex items-end gap-1.5">
              @for (item of v.alunosNovosPorMes; track item.mes) {
                <div class="flex-1 h-full flex flex-col justify-end items-center gap-1">
                  <span class="text-[10px] text-gray-500">{{ item.alunos || "" }}</span>
                  <div
                    class="w-full max-w-9 rounded-t bg-sky-600"
                    [style.height.%]="pct(item.alunos, maxAlunosNovos(v))"
                    [title]="item.alunos + ' alunos'"
                  ></div>
                  <span class="text-[11px] text-gray-500">{{ mesCurto(item.mes) }}</span>
                </div>
              }
            </div>
          </section>

          <section class="ef-card p-4">
            <p class="text-sm font-medium text-gray-700 mb-3">Recebido por mês</p>
            <div class="h-40 flex items-end gap-1.5">
              @for (item of v.recebidoPorMes; track item.mes) {
                <div class="flex-1 h-full flex flex-col justify-end items-center gap-1">
                  <div
                    class="w-full max-w-9 rounded-t bg-emerald-600"
                    [style.height.%]="pct(item.valor, maxRecebido(v))"
                    [title]="(item.valor | currency: 'BRL') + ' · ' + item.qtd + ' parcelas'"
                  ></div>
                  <span class="text-[11px] text-gray-500">{{ mesCurto(item.mes) }}</span>
                </div>
              }
            </div>
            @if (maxRecebido(v) === 0) {
              <p class="text-xs text-gray-500 mt-2 mb-0">Nenhum pagamento registrado ainda.</p>
            }
          </section>

          <section class="ef-card p-4">
            <p class="text-sm font-medium text-gray-700 mb-3">A vencer nos próximos meses</p>
            <div class="h-40 flex items-end gap-3">
              @for (item of v.aVencerPorMes; track item.mes) {
                <div class="flex-1 h-full flex flex-col justify-end items-center gap-1">
                  <div
                    class="w-full max-w-12 rounded-t bg-brand-600"
                    [style.height.%]="pct(item.valor, maxAVencer(v))"
                    [title]="(item.valor | currency: 'BRL') + ' · ' + item.qtd + ' parcelas'"
                  ></div>
                  <span class="text-[11px] text-gray-500">{{ mesCurto(item.mes) }}</span>
                </div>
              }
            </div>
          </section>
        </div>

        <!-- Atraso e tipo de título -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          <section class="ef-card p-4">
            <p class="text-sm font-medium text-gray-700 mb-3">Vencido por faixa de atraso</p>
            <div class="space-y-3">
              @for (f of v.faixasAtraso; track f.faixa) {
                <div>
                  <div class="flex justify-between gap-3 text-sm mb-1">
                    <span>{{ f.faixa }}</span>
                    <span class="text-gray-500">
                      {{ f.valor | currency: "BRL" }} · {{ f.qtd | number }} parcelas
                    </span>
                  </div>
                  <div class="h-2 bg-gray-100 rounded">
                    <div
                      class="h-2 bg-red-600 rounded"
                      [style.width.%]="pct(f.valor, maxFaixa(v))"
                    ></div>
                  </div>
                </div>
              } @empty {
                <p class="text-sm text-gray-500 m-0">Nada vencido.</p>
              }
            </div>
          </section>

          <section class="ef-card p-4">
            <p class="text-sm font-medium text-gray-700 mb-3">Em aberto por tipo de título</p>
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs text-gray-400">
                  <th class="py-1">Tipo</th>
                  <th class="py-1 text-right">Parcelas</th>
                  <th class="py-1 text-right">Em aberto</th>
                  <th class="py-1 text-right">Vencido</th>
                </tr>
              </thead>
              <tbody>
                @for (t of v.porTipoTitulo; track t.tipo) {
                  <tr class="border-t">
                    <td class="py-1">{{ t.tipo }}</td>
                    <td class="py-1 text-right">{{ t.parcelas | number }}</td>
                    <td class="py-1 text-right">{{ t.valorAberto | currency: "BRL" }}</td>
                    <td class="py-1 text-right text-red-700">
                      {{ t.valorVencido | currency: "BRL" }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            <p class="text-xs text-gray-500 mt-3 mb-0">
              Protestadas: {{ v.indicadores.parcelasProtestadas | number }} ({{
                v.indicadores.valorProtestado | currency: "BRL"
              }}) · Renegociadas: {{ v.indicadores.parcelasRenegociadas | number }} ({{
                v.indicadores.valorRenegociado | currency: "BRL"
              }})
            </p>
          </section>
        </div>

        <!-- Cursos -->
        <section class="ef-card p-4 mb-5">
          <p class="text-sm font-medium text-gray-700 mb-3">
            Cursos: matrículas e valores ({{ v.porCurso.length }})
          </p>
          <div class="overflow-x-auto max-h-[28rem] overflow-y-auto">
            <table class="w-full text-sm">
              <thead class="sticky top-0 bg-white">
                <tr class="text-left text-xs text-gray-400">
                  <th class="py-1">Curso</th>
                  <th class="py-1 text-right">Matrículas</th>
                  <th class="py-1 text-right">Em aberto</th>
                  <th class="py-1 text-right">A vencer</th>
                  <th class="py-1 text-right">Vencido</th>
                  <th class="py-1 text-right">Atraso médio</th>
                </tr>
              </thead>
              <tbody>
                @for (c of v.porCurso; track c.cursoId) {
                  <tr class="border-t">
                    <td class="py-1 pr-3">{{ c.cursoNome }}</td>
                    <td class="py-1 text-right">{{ c.matriculas | number }}</td>
                    <td class="py-1 text-right">{{ c.valorAberto | currency: "BRL" }}</td>
                    <td class="py-1 text-right text-blue-700">
                      {{ c.valorAVencer | currency: "BRL" }}
                    </td>
                    <td class="py-1 text-right text-red-700">
                      {{ c.valorVencido | currency: "BRL" }}
                    </td>
                    <td class="py-1 text-right text-gray-500">
                      {{ c.diasMedioAtraso ? (c.diasMedioAtraso | number: "1.0-0") + " d" : "—" }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section class="ef-card p-4">
            <p class="text-sm font-medium text-gray-700 mb-3">Maiores valores vencidos por aluno</p>
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs text-gray-400">
                  <th class="py-1">Aluno</th>
                  <th class="py-1 text-right">Parcelas</th>
                  <th class="py-1 text-right">Vencido</th>
                  <th class="py-1 text-right">Maior atraso</th>
                </tr>
              </thead>
              <tbody>
                @for (a of v.maioresDevedores; track a.alunoId) {
                  <tr class="border-t">
                    <td class="py-1 pr-3">{{ a.nome }}</td>
                    <td class="py-1 text-right">{{ a.parcelas | number }}</td>
                    <td class="py-1 text-right text-red-700">
                      {{ a.valorVencido | currency: "BRL" }}
                    </td>
                    <td class="py-1 text-right text-gray-500">
                      {{ a.maiorAtrasoDias | number }} d
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td class="py-2 text-gray-500" colspan="4">Sem valores vencidos.</td>
                  </tr>
                }
              </tbody>
            </table>
          </section>

          <section class="ef-card p-4">
            <p class="text-sm font-medium text-gray-700 mb-3">Matrículas por situação</p>
            <div class="space-y-2">
              @for (s of v.matriculasPorSituacao; track s.situacao) {
                <div class="flex justify-between text-sm">
                  <span>{{ s.situacao }}</span>
                  <span class="text-gray-600">{{ s.matriculas | number }}</span>
                </div>
              }
            </div>
          </section>
        </div>
      </div>
    }
  `,
})
export class DashboardVisaoGeralComponent implements OnInit {
  private readonly service = inject(DashboardService);

  readonly d = signal<DashboardVisaoGeral | null>(null);
  readonly carregando = signal(false);

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando.set(true);
    this.service.visaoGeral().subscribe({
      next: (dados) => {
        this.d.set(dados);
        this.carregando.set(false);
      },
      error: () => this.carregando.set(false),
    });
  }

  /** "2026-03" → "mar/26". */
  mesCurto(mes: string): string {
    const [ano, numero] = mes.split("-");
    return `${MESES[Number(numero) - 1]}/${ano.slice(2)}`;
  }

  pct(valor: number, maximo: number): number {
    return maximo > 0 ? Math.max(valor > 0 ? 3 : 0, Math.round((valor / maximo) * 100)) : 0;
  }

  prazo(dias: number): string {
    if (dias === 0) return "—";
    const abs = Math.abs(Math.round(dias));
    return dias > 0 ? `${abs} d após o vencimento` : `${abs} d antes do vencimento`;
  }

  maxMatriculas = (v: DashboardVisaoGeral) =>
    Math.max(0, ...v.matriculasPorMes.map((m) => m.matriculas));
  maxAlunosNovos = (v: DashboardVisaoGeral) =>
    Math.max(0, ...v.alunosNovosPorMes.map((m) => m.alunos));
  maxRecebido = (v: DashboardVisaoGeral) => Math.max(0, ...v.recebidoPorMes.map((m) => m.valor));
  maxAVencer = (v: DashboardVisaoGeral) => Math.max(0, ...v.aVencerPorMes.map((m) => m.valor));
  maxFaixa = (v: DashboardVisaoGeral) => Math.max(0, ...v.faixasAtraso.map((f) => f.valor));
}
