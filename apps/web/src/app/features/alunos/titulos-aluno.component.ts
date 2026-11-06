import { CurrencyPipe, DatePipe, NgClass } from "@angular/common";
import { Component, computed, inject, input, OnInit, signal } from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSelectModule } from "@angular/material/select";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Parcela } from "../../core/models/parcela.model";
import {
  ResultadoTitulosDoAluno,
  TituloAluno,
  TitulosDoAluno,
} from "../../core/models/titulo-aluno.model";
import { ConfiguracoesService } from "../../core/services/configuracoes.service";
import { FinanceiroService } from "../../core/services/financeiro.service";
import { ImportacaoLegadoService } from "../../core/services/importacao-legado.service";
import { calcularEncargos, ConfigEncargos, estadoDaParcela } from "../cobranca/estado-parcela";
import {
  classeDaSituacao,
  itensDoTotalizador,
  situacaoAutomatica,
  totaisDaFicha,
} from "../cobranca/ficha-totais";
import { ParcelaDetalhesDialogComponent } from "../cobranca/parcela-detalhes-dialog.component";
import { formatarCpf } from "../../shared/utils/cpf.util";
import {
  filtrarParcelas,
  FiltrosFicha,
  opcoesDosFiltros,
  SEM_FILTROS,
  temFiltro,
} from "../cobranca/ficha-filtros";
import { opcoesDeMatricula, pertenceAMatricula } from "./aluno-financeiro";
import { GerarCobrancaProtestoDialogComponent } from "./gerar-cobranca-protesto-dialog.component";

/**
 * Todos os títulos de um aluno (por CPF): as parcelas de todas as matrículas e os títulos do legado
 * que não têm matrícula no Ethos. A ficha de cobrança de uma matrícula continua mostrando só as
 * parcelas dela; esta tela é a visão completa do aluno, no mesmo formato.
 */
@Component({
  selector: "app-titulos-aluno",
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    NgClass,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    MatSelectModule,
  ],
  template: `
    @if (carregando()) {
      <mat-progress-bar mode="indeterminate" class="mb-4"></mat-progress-bar>
    }
    @if (dados(); as d) {
      <div
        class="flex flex-wrap items-start justify-between gap-3 mb-4"
        [class.!justify-end]="embutido()"
      >
        <div [class.hidden]="embutido()">
          <a mat-button routerLink="/alunos" class="!-ml-3"
            ><mat-icon>arrow_back</mat-icon> Alunos</a
          >
          <h1 class="ef-title">Títulos de {{ d.aluno.nome }}</h1>
          <p class="text-sm text-gray-500 m-0">
            CPF {{ cpf(d.aluno.cpf) }} · {{ d.titulos.length }} título(s) no total
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            mat-stroked-button
            type="button"
            data-testid="gerar-cobranca"
            (click)="abrirGerar('COBRANCA')"
            title="Gera as cobranças (boleto, Pix ou cartão) da matrícula/curso escolhido ou de todos"
          >
            <mat-icon>request_quote</mat-icon> Gerar cobrança
          </button>
          <button
            mat-stroked-button
            type="button"
            data-testid="gerar-protesto"
            (click)="abrirGerar('PROTESTO')"
            title="Gera o documento de protesto da matrícula/curso escolhido ou de todos"
          >
            <mat-icon>gavel</mat-icon> Gerar protesto
          </button>
          <button
            mat-stroked-button
            type="button"
            [disabled]="atualizando()"
            (click)="atualizarDoLegado()"
            title="Consulta o legado por CPF e grava os títulos que ainda não foram importados"
          >
            <mat-icon>cloud_download</mat-icon> Buscar títulos no legado
          </button>
        </div>
      </div>
      @if (atualizando()) {
        <mat-progress-bar mode="indeterminate" class="mb-3"></mat-progress-bar>
      }

      <div class="ef-card mb-3 p-3" data-testid="filtros-titulos">
        <div class="flex flex-wrap items-end gap-3">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="!w-64">
            <mat-label>Matrícula / curso</mat-label>
            <mat-select
              data-testid="filtro-matricula"
              [value]="matriculaFiltro()"
              (selectionChange)="matriculaFiltro.set($event.value)"
            >
              <mat-option value="">Todas as matrículas</mat-option>
              @for (o of opcoesMatricula(); track o.id) {
                <mat-option [value]="o.id">{{ o.rotulo }} ({{ o.titulos }})</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="!w-56">
            <mat-label>Tipo de título</mat-label>
            <mat-select
              data-testid="filtro-tipo"
              [value]="filtros().tipo"
              (selectionChange)="mudarFiltro('tipo', $event.value)"
            >
              <mat-option value="">Todos</mat-option>
              @for (o of opcoesFiltro().tipos; track o) {
                <mat-option [value]="o">{{ o }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="!w-48">
            <mat-label>Estado da parcela</mat-label>
            <mat-select
              data-testid="filtro-estado"
              [value]="filtros().estado"
              (selectionChange)="mudarFiltro('estado', $event.value)"
            >
              <mat-option value="">Todos</mat-option>
              @for (o of opcoesFiltro().estados; track o) {
                <mat-option [value]="o">{{ o }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="!w-52">
            <mat-label>Situação</mat-label>
            <mat-select
              data-testid="filtro-situacao"
              [value]="filtros().situacao"
              (selectionChange)="mudarFiltro('situacao', $event.value)"
            >
              <mat-option value="">Todas</mat-option>
              @for (o of opcoesFiltro().situacoes; track o) {
                <mat-option [value]="o">{{ o }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          @if (filtrando()) {
            <button mat-button type="button" data-testid="limpar-filtros" (click)="limparFiltros()">
              Limpar filtros
            </button>
          }
          <span class="text-xs text-gray-500 pb-2" data-testid="contador-titulos">
            {{ visiveis().length }} de {{ d.titulos.length }} título(s)
          </span>
        </div>
      </div>

      <div class="ef-card mb-3 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="ef-table ef-table-compact" data-testid="titulos-do-aluno">
            <thead>
              <tr>
                <th class="ef-col-principal">Matrícula / curso</th>
                <th class="py-1 font-medium">Parcela</th>
                <th class="py-1 font-medium">Título</th>
                <th class="py-1 font-medium">Vencimento</th>
                <th class="py-1 font-medium">Tipo de título</th>
                <th class="py-1 font-medium">Estado da parcela</th>
                <th class="py-1 font-medium">Situação</th>
                <th class="py-1 font-medium text-right">Valor</th>
                <th class="py-1 font-medium text-right">Valor pago</th>
                <th class="py-1 font-medium text-right">Multa</th>
                <th class="py-1 font-medium text-right">Juros</th>
                <th class="py-1 font-medium text-right">Total</th>
                <th class="py-1 font-medium">Detalhes</th>
              </tr>
            </thead>
            @for (t of visiveis(); track t.id) {
              <tr>
                <td class="ef-col-principal">
                  @if (t.origem === "MATRICULA" && t.matricula) {
                    <a
                      class="text-blue-700 hover:underline"
                      [routerLink]="['/cobranca/matriculas', t.matricula.id]"
                      title="Abrir a ficha de cobrança desta matrícula"
                      >{{ t.matricula.curso.nome }}</a
                    >
                  } @else {
                    <div>{{ t.cursoLegadoNome || "—" }}</div>
                    <span
                      class="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800"
                      title="O aluno não tem matrícula neste curso no Ethos: o título só aparece aqui"
                      >Sem matrícula</span
                    >
                  }
                </td>
                <td class="py-1">{{ t.parcela }}</td>
                <td class="py-1">{{ t.codTitulo }}</td>
                <td class="py-1">{{ t.vencimento | date: "dd/MM/yyyy" : "UTC" }}</td>
                <td class="py-1">{{ t.tipoTitulo || "—" }}</td>
                <td class="py-1">
                  <span class="px-2 py-0.5 rounded text-xs" [ngClass]="estado(t).classe">{{
                    estado(t).rotulo
                  }}</span>
                </td>
                <td class="py-1">
                  @if (situacao(t); as s) {
                    <span
                      class="px-2 py-0.5 rounded text-xs whitespace-nowrap"
                      [ngClass]="classeSituacao(s)"
                      >{{ s }}</span
                    >
                  } @else {
                    {{ t.situacaoCobranca?.nome || "—" }}
                  }
                </td>
                <td class="py-1 text-right">{{ t.valor | currency: "BRL" }}</td>
                <td class="py-1 text-right">{{ t.valorPago | currency: "BRL" }}</td>
                <td class="py-1 text-right">{{ encargos(t).multa | currency: "BRL" }}</td>
                <td class="py-1 text-right">{{ encargos(t).juros | currency: "BRL" }}</td>
                <td class="py-1 text-right">{{ encargos(t).total | currency: "BRL" }}</td>
                <td class="py-1 text-center">
                  <button
                    mat-icon-button
                    type="button"
                    aria-label="Detalhes do título"
                    title="Detalhes do título (todos os campos)"
                    (click)="abrirDetalhes(t)"
                  >
                    <mat-icon>info</mat-icon>
                  </button>
                </td>
              </tr>
            }
            @if (visiveis().length === 0) {
              <tr>
                <td class="text-gray-400 py-2" colspan="13">Nenhum título para mostrar.</td>
              </tr>
            }
          </table>
        </div>
      </div>

      @if (visiveis().length > 0) {
        <div class="ef-card mb-3 p-4" data-testid="totalizador">
          <h2 class="ef-card-title !text-base">Totalizador</h2>
          <dl class="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm m-0">
            @for (item of totalizador(); track item.rotulo) {
              <div [class.font-semibold]="item.destaque">
                <dt class="text-xs text-gray-500">{{ item.rotulo }}</dt>
                <dd class="m-0">
                  {{ item.moeda ? (item.valor | currency: "BRL") : item.valor }}
                </dd>
              </div>
            }
          </dl>
          <p class="text-[11px] text-gray-400 mt-2">
            Soma os títulos mostrados acima. Considera os devedores (em aberto e protestados).
            Vencidos: vencimento anterior a hoje. Pagos: pagos e renegociados.
          </p>
        </div>
      }
    }
  `,
})
export class TitulosAlunoComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly financeiro = inject(FinanceiroService);
  private readonly importacao = inject(ImportacaoLegadoService);
  private readonly configuracoes = inject(ConfiguracoesService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  /** Dentro da aba Financeiro do cadastro do aluno: sem o título e o link de voltar. */
  readonly embutido = input(false);

  readonly dados = signal<TitulosDoAluno | null>(null);
  readonly carregando = signal(true);
  readonly atualizando = signal(false);
  /** "" = todas as matrículas; SEM_MATRICULA = só os do legado sem matrícula; ou o id da matrícula. */
  readonly matriculaFiltro = signal("");
  readonly filtros = signal<FiltrosFicha>({ ...SEM_FILTROS });
  private readonly config = signal<ConfigEncargos>({
    diasAtrasoMinimo: 0,
    multaPercentual: 0,
    jurosDiarioPercentual: 0,
    jurosContarDiaGeracao: true,
  });

  private alunoId = "";

  readonly opcoesMatricula = computed(() => opcoesDeMatricula(this.dados()?.titulos ?? []));

  /** Títulos da matrícula escolhida (antes dos filtros de tipo, estado e situação). */
  private readonly daMatricula = computed(() => {
    const m = this.matriculaFiltro();
    return (this.dados()?.titulos ?? []).filter((t) => pertenceAMatricula(t, m));
  });

  /** As opções dos filtros são só as que existem nos títulos da matrícula escolhida. */
  readonly opcoesFiltro = computed(() =>
    opcoesDosFiltros(this.daMatricula(), (t) => this.estado(t).rotulo, new Date()),
  );

  readonly visiveis = computed(() =>
    filtrarParcelas(this.daMatricula(), this.filtros(), (t) => this.estado(t).rotulo, new Date()),
  );

  readonly filtrando = computed(() => this.matriculaFiltro() !== "" || temFiltro(this.filtros()));

  readonly totalizador = computed(() =>
    itensDoTotalizador(
      totaisDaFicha(this.visiveis(), (t) => this.encargos(t as TituloAluno), new Date()),
    ),
  );

  ngOnInit(): void {
    this.alunoId = this.route.snapshot.paramMap.get("id") ?? "";
    this.configuracoes.obter().subscribe((c) =>
      this.config.set({
        diasAtrasoMinimo: c.diasAtraso,
        multaPercentual: c.multaPercentual,
        jurosDiarioPercentual: c.jurosDiarioPercentual,
        jurosContarDiaGeracao: c.jurosContarDiaGeracao,
      }),
    );
    this.carregar();
  }

  mudarFiltro(campo: keyof FiltrosFicha, valor: string): void {
    this.filtros.update((f) => ({ ...f, [campo]: valor }));
  }

  limparFiltros(): void {
    this.matriculaFiltro.set("");
    this.filtros.set({ ...SEM_FILTROS });
  }

  /** Gerar cobrança/protesto da matrícula/curso escolhido no filtro, ou de todas se for "todas". */
  abrirGerar(modo: "COBRANCA" | "PROTESTO"): void {
    const d = this.dados();
    if (!d) return;
    const m = this.matriculaFiltro();
    const escolhida = this.opcoesMatricula().find((o) => o.id === m);
    this.dialog
      .open(GerarCobrancaProtestoDialogComponent, {
        width: "560px",
        maxWidth: "95vw",
        data: {
          modo,
          titulos: d.titulos,
          matriculaId: m,
          escopo: escolhida ? escolhida.rotulo : "Todas as matrículas do aluno",
        },
      })
      .afterClosed()
      .subscribe((mudou) => {
        if (mudou) this.carregar();
      });
  }

  cpf(valor: string): string {
    return formatarCpf(valor);
  }

  estado(t: TituloAluno): { rotulo: string; classe: string } {
    return estadoDaParcela(t, this.config().diasAtrasoMinimo, new Date());
  }

  encargos(t: TituloAluno): { multa: number; juros: number; total: number } {
    return calcularEncargos(t, this.config(), new Date());
  }

  situacao(t: TituloAluno): string | null {
    return situacaoAutomatica(t, new Date());
  }

  classeSituacao(situacao: string): string {
    return classeDaSituacao(situacao);
  }

  abrirDetalhes(t: TituloAluno): void {
    this.dialog.open(ParcelaDetalhesDialogComponent, {
      width: "860px",
      maxWidth: "95vw",
      data: { parcela: t as unknown as Parcela, estado: this.estado(t).rotulo },
    });
  }

  /** Consulta o legado por CPF e grava o que falta; depois recarrega a lista. */
  atualizarDoLegado(): void {
    this.atualizando.set(true);
    this.importacao.importarTitulosDoAluno(this.alunoId).subscribe({
      next: (r) => {
        this.atualizando.set(false);
        this.snackBar.open(this.resumo(r), "Fechar", { duration: 8000 });
        this.carregar();
      },
      error: () => this.atualizando.set(false),
    });
  }

  private resumo(r: ResultadoTitulosDoAluno): string {
    if (!r.encontradoNoLegado) return "Aluno não encontrado no legado (pelo CPF)";
    const partes = [`${r.titulosNoLegado} título(s) no legado`, `${r.jaImportados} já importados`];
    if (r.parcelasNovas) partes.push(`${r.parcelasNovas} novo(s) em matrícula`);
    if (r.titulosSemMatricula) partes.push(`${r.titulosSemMatricula} sem matrícula`);
    if (r.ignorados) partes.push(`${r.ignorados} ignorado(s) (sem vencimento)`);
    return partes.join(" · ");
  }

  private carregar(): void {
    this.carregando.set(true);
    this.financeiro.titulosDoAluno(this.alunoId).subscribe({
      next: (d) => {
        this.dados.set(d);
        this.carregando.set(false);
      },
      error: () => this.carregando.set(false),
    });
  }
}
