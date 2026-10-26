import { DatePipe } from "@angular/common";
import { Component, DestroyRef, inject, OnInit, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSnackBar } from "@angular/material/snack-bar";
import { debounceTime, distinctUntilChanged } from "rxjs";
import { AuthService } from "../../core/auth/auth.service";
import { Aluno, ContadoresAlunos, SituacaoFinanceiraAluno } from "../../core/models/aluno.model";
import { Curso } from "../../core/models/curso.model";
import { AlunosService } from "../../core/services/alunos.service";
import { CursosService } from "../../core/services/cursos.service";
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from "../../shared/components/confirm-dialog.component";
import { PaginacaoComponent } from "../../shared/components/paginacao.component";
import { formatarCpf } from "../../shared/utils/cpf.util";
import { iniciaisDe } from "../../shared/utils/iniciais";
import { DocumentosLegadoDialogComponent } from "./documentos-legado-dialog.component";
import { ImportarLegadoDialogComponent } from "./importar-legado-dialog.component";
import { ImportarLegadoLoteDialogComponent } from "./importar-legado-lote-dialog.component";
import { ImportarTitulosLoteDialogComponent } from "./importar-titulos-lote-dialog.component";

type Aba = "TODOS" | SituacaoFinanceiraAluno;

const ABAS: { chave: Aba; rotulo: string }[] = [
  { chave: "TODOS", rotulo: "Todos" },
  { chave: "EM_DIA", rotulo: "Em dia" },
  { chave: "EM_ATRASO", rotulo: "Com pendências" },
  { chave: "SEM_MATRICULA", rotulo: "Sem matrícula" },
];

const SITUACOES = {
  EM_DIA: { rotulo: "Em dia", classe: "ef-pill ef-pill-ok" },
  EM_ATRASO: { rotulo: "Em atraso", classe: "ef-pill ef-pill-bad" },
  SEM_MATRICULA: { rotulo: "Sem matrícula", classe: "ef-pill" },
} as const;

/** Lista de alunos (padrão docs/especificacao): contadores, abas por situação, filtros e tabela. */
@Component({
  selector: "app-alunos-list",
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    PaginacaoComponent,
  ],
  template: `
    <div class="ef-page">
      <div class="ef-page-header">
        <div>
          <h1 class="ef-title">Alunos</h1>
          <p class="ef-subtitle">
            Gerencie cadastros, matrículas e a situação financeira dos alunos.
          </p>
        </div>
        <div class="flex flex-wrap gap-3">
          @if (authService.temPerfil("ADMINISTRADOR", "FINANCEIRO")) {
            <a mat-stroked-button routerLink="/importacao">
              <mat-icon>upload</mat-icon> Importar alunos
            </a>
          }
          <a mat-flat-button color="primary" routerLink="/alunos/novo">
            <mat-icon>add</mat-icon> Novo aluno
          </a>
        </div>
      </div>

      <div class="ef-kpis" data-testid="contadores">
        <div class="ef-kpi">
          <div class="ef-kpi-label">Todos os alunos</div>
          <div class="ef-kpi-value">{{ numero(contadores()?.total) }}</div>
        </div>
        <div class="ef-kpi">
          <div class="ef-kpi-label">Com matrícula</div>
          <div class="ef-kpi-value">
            {{ numero(contadores()?.comMatricula) }}
          </div>
        </div>
        <div class="ef-kpi">
          <div class="ef-kpi-label">Com pendências</div>
          <div class="ef-kpi-value">
            {{ numero(contadores()?.comPendencias) }}
          </div>
        </div>
      </div>

      <section class="ef-card overflow-hidden">
        <div class="ef-tabs" role="tablist">
          @for (a of abas; track a.chave) {
            <button
              type="button"
              role="tab"
              class="ef-tab"
              [attr.aria-selected]="aba() === a.chave"
              (click)="mudarAba(a.chave)"
            >
              {{ a.rotulo }}
            </button>
          }
        </div>

        <div class="flex flex-wrap items-center gap-3 p-4">
          <label
            class="flex min-w-[260px] flex-1 items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 focus-within:border-brand-600"
          >
            <mat-icon class="text-muted">search</mat-icon>
            <input
              [formControl]="busca"
              type="search"
              placeholder="Buscar por nome, CPF ou e-mail"
              aria-label="Buscar alunos"
              class="w-full border-0 bg-transparent text-sm outline-none"
            />
          </label>
          <select
            class="w-[240px] max-w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm"
            aria-label="Filtrar por curso"
            [value]="cursoId()"
            (change)="mudarCurso($any($event.target).value)"
          >
            <option value="">Todos os cursos</option>
            @for (c of cursos(); track c.id) {
              <option [value]="c.id" [selected]="c.id === cursoId()">{{ c.nome }}</option>
            }
          </select>
        </div>

        @if (carregando()) {
          <mat-progress-bar mode="indeterminate"></mat-progress-bar>
        }

        <div class="overflow-x-auto">
          <table class="ef-table" data-testid="tabela-alunos">
            <thead>
              <tr>
                <th>Aluno</th>
                <th>
                  CPF
                  <button
                    type="button"
                    class="ml-1 inline-flex h-6 w-6 items-center justify-center rounded border-0 bg-transparent align-middle text-muted"
                    [attr.aria-label]="cpfVisivel() ? 'Ocultar CPF' : 'Mostrar CPF'"
                    [title]="cpfVisivel() ? 'Ocultar CPF' : 'Mostrar CPF'"
                    (click)="cpfVisivel.set(!cpfVisivel())"
                  >
                    <mat-icon class="!h-[18px] !w-[18px] !text-[18px]">{{
                      cpfVisivel() ? "visibility_off" : "visibility"
                    }}</mat-icon>
                  </button>
                </th>
                <th>Curso</th>
                <th>Situação financeira</th>
                <th>Última matrícula</th>
                <th class="w-[1%]"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              @for (a of alunos(); track a.id) {
                <tr class="group">
                  <td>
                    <div class="flex items-center gap-3">
                      <span class="ef-avatar">{{ iniciais(a.nome) }}</span>
                      <div class="leading-tight">
                        <a
                          [routerLink]="['/alunos', a.id]"
                          class="font-medium text-brand-700 no-underline hover:underline"
                          >{{ a.nome }}</a
                        >
                        <div class="text-xs text-muted">Código {{ a.codigo || "—" }}</div>
                      </div>
                    </div>
                  </td>
                  <td class="whitespace-nowrap tabular-nums">{{ cpf(a.cpf) }}</td>
                  <td>{{ a.ultimaMatricula?.cursoNome || "—" }}</td>
                  <td>
                    @if (a.situacaoFinanceira; as s) {
                      <span [class]="situacao(s).classe">{{ situacao(s).rotulo }}</span>
                    }
                  </td>
                  <td class="whitespace-nowrap">
                    {{
                      a.ultimaMatricula?.dataMatricula
                        ? (a.ultimaMatricula?.dataMatricula | date: "dd/MM/yyyy" : "UTC")
                        : "—"
                    }}
                  </td>
                  <td class="whitespace-nowrap text-right">
                    <a
                      mat-stroked-button
                      [routerLink]="['/alunos', a.id]"
                      class="mr-1 !hidden !h-9 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 sm:!inline-flex"
                      >Ver cadastro</a
                    >
                    <button
                      mat-icon-button
                      type="button"
                      [matMenuTriggerFor]="acoes"
                      [matMenuTriggerData]="{ aluno: a }"
                      [attr.aria-label]="'Ações de ' + a.nome"
                    >
                      <mat-icon>more_vert</mat-icon>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>

          @if (!carregando() && alunos().length === 0) {
            <p class="m-0 p-8 text-center text-muted">Nenhum aluno encontrado.</p>
          }
        </div>

        <app-paginacao
          class="block border-t border-line"
          rotuloItens="alunos"
          [total]="total()"
          [pagina]="pagina()"
          [tamanho]="tamanho()"
          (paginaAlterada)="mudarPagina($event)"
          (tamanhoAlterado)="mudarTamanho($event)"
        />
      </section>

      @if (authService.temPerfil("ADMINISTRADOR", "FINANCEIRO")) {
        <section class="ef-card mt-4 flex flex-wrap items-center gap-4 p-4">
          <span
            class="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-700"
          >
            <mat-icon>storage</mat-icon>
          </span>
          <div class="min-w-[240px] flex-1">
            <p class="m-0 font-semibold">Integração com sistema anterior</p>
            <p class="m-0 text-sm text-muted">
              Consulte ou importe cadastros, matrículas e títulos antigos quando necessário.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button mat-stroked-button type="button" (click)="consultarLegado()">
              <mat-icon>travel_explore</mat-icon> Consultar CPF no legado
            </button>
            <button mat-stroked-button type="button" (click)="buscarTodosLegado()">
              <mat-icon>cloud_download</mat-icon> Buscar todos do legado
            </button>
            <button
              mat-stroked-button
              type="button"
              title="Consulta o legado e grava só os títulos que ainda não foram importados"
              (click)="buscarTitulosNaoImportados()"
            >
              <mat-icon>receipt_long</mat-icon> Buscar títulos não importados
            </button>
          </div>
        </section>
      }
    </div>

    <mat-menu #acoes="matMenu">
      <ng-template matMenuContent let-aluno="aluno">
        <a mat-menu-item [routerLink]="['/alunos', aluno.id]">
          <mat-icon>edit</mat-icon> Editar cadastro
        </a>
        @if (authService.temPerfil("ADMINISTRADOR", "FINANCEIRO")) {
          <a mat-menu-item [routerLink]="['/alunos', aluno.id, 'titulos']">
            <mat-icon>receipt_long</mat-icon> Ver títulos
          </a>
          <button mat-menu-item type="button" (click)="buscarDocumentosLegado(aluno)">
            <mat-icon>cloud_download</mat-icon> Buscar documentos no legado
          </button>
        }
        <button mat-menu-item type="button" class="!text-red-700" (click)="remover(aluno)">
          <mat-icon class="!text-red-700">delete</mat-icon> Remover
        </button>
      </ng-template>
    </mat-menu>
  `,
})
export class AlunosListComponent implements OnInit {
  private readonly service = inject(AlunosService);
  private readonly cursosService = inject(CursosService);
  private readonly dialog = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly authService = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);

  readonly abas = ABAS;
  readonly busca = new FormControl("", { nonNullable: true });
  readonly aba = signal<Aba>("TODOS");
  readonly cursoId = signal("");
  readonly alunos = signal<Aluno[]>([]);
  readonly cursos = signal<Curso[]>([]);
  readonly contadores = signal<ContadoresAlunos | null>(null);
  readonly total = signal(0);
  readonly pagina = signal(1);
  readonly tamanho = signal(20);
  readonly carregando = signal(false);
  /** O CPF aparece mascarado (***.***.***-**) até o usuário pedir para mostrar. */
  readonly cpfVisivel = signal(false);

  ngOnInit(): void {
    this.cursosService.listar({ pageSize: 100 }).subscribe((r) => this.cursos.set(r.data));
    this.atualizarContadores();

    // A busca da barra superior chega por ?busca=… (mesmo com esta tela já aberta).
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((q) => {
      const vindaDeFora = q.get("busca") ?? "";
      if (vindaDeFora !== this.busca.value) this.busca.setValue(vindaDeFora, { emitEvent: false });
      this.pagina.set(1);
      this.carregar();
    });
    this.busca.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.pagina.set(1);
        this.carregar();
      });
  }

  numero(valor: number | undefined): string {
    return valor === undefined ? "—" : valor.toLocaleString("pt-BR");
  }

  cpf(valor: string): string {
    return this.cpfVisivel() ? formatarCpf(valor) : "***.***.***-**";
  }

  iniciais(nome: string): string {
    return iniciaisDe(nome);
  }

  situacao(s: SituacaoFinanceiraAluno): { rotulo: string; classe: string } {
    return SITUACOES[s];
  }

  mudarAba(aba: Aba): void {
    this.aba.set(aba);
    this.pagina.set(1);
    this.carregar();
  }

  mudarCurso(cursoId: string): void {
    this.cursoId.set(cursoId);
    this.pagina.set(1);
    this.carregar();
  }

  mudarPagina(pagina: number): void {
    this.pagina.set(pagina);
    this.carregar();
  }

  mudarTamanho(tamanho: number): void {
    this.tamanho.set(tamanho);
    this.pagina.set(1);
    this.carregar();
  }

  private carregar(): void {
    this.carregando.set(true);
    const aba = this.aba();
    this.service
      .listar({
        busca: this.busca.value.trim() || undefined,
        situacao: aba === "TODOS" ? undefined : aba,
        cursoId: this.cursoId() || undefined,
        page: this.pagina(),
        pageSize: this.tamanho(),
      })
      .subscribe({
        next: (res) => {
          this.alunos.set(res.data);
          this.total.set(res.total);
          this.carregando.set(false);
        },
        error: () => this.carregando.set(false),
      });
  }

  private atualizarContadores(): void {
    this.service.contadores().subscribe((c) => this.contadores.set(c));
  }

  consultarLegado(): void {
    this.dialog
      .open(ImportarLegadoDialogComponent, { width: "700px", maxHeight: "90vh" })
      .afterClosed()
      .subscribe((importou) => {
        if (importou) this.recarregar();
      });
  }

  /** Busca no legado os documentos do aluno e baixa os arquivos para apps/documentos. */
  buscarDocumentosLegado(aluno: Aluno): void {
    this.dialog.open(DocumentosLegadoDialogComponent, {
      width: "760px",
      maxHeight: "90vh",
      data: { id: aluno.id, nome: aluno.nome },
    });
  }

  /** Busca em lote: todos os alunos do legado (varredura + importação em segundo plano). */
  buscarTodosLegado(): void {
    this.dialog
      .open(ImportarLegadoLoteDialogComponent, {
        width: "720px",
        maxHeight: "90vh",
        disableClose: false,
      })
      .afterClosed()
      .subscribe(() => this.recarregar());
  }

  /** Busca em lote dos títulos que faltam, de todos os alunos (segundo plano). */
  buscarTitulosNaoImportados(): void {
    this.dialog.open(ImportarTitulosLoteDialogComponent, { width: "720px", maxHeight: "90vh" });
  }

  remover(aluno: Aluno): void {
    const data: ConfirmDialogData = {
      titulo: "Remover aluno",
      mensagem: `Deseja remover o aluno "${aluno.nome}"? Esta ação não pode ser desfeita.`,
      confirmarTexto: "Remover",
    };
    this.dialog
      .open(ConfirmDialogComponent, { data, width: "440px" })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.service.remover(aluno.id).subscribe(() => {
          this.snackBar.open("Aluno removido", "Fechar", { duration: 3000 });
          this.recarregar();
        });
      });
  }

  private recarregar(): void {
    this.carregar();
    this.atualizarContadores();
  }
}
