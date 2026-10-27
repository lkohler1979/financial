import { Component, DestroyRef, inject, OnInit, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { DatePipe, NgClass } from "@angular/common";
import { RouterLink } from "@angular/router";
import { FormBuilder, FormControl, ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatMenuModule } from "@angular/material/menu";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSelectModule } from "@angular/material/select";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { debounceTime, merge } from "rxjs";
import { MatriculasService } from "../../core/services/matriculas.service";
import { CursosService } from "../../core/services/cursos.service";
import { Curso } from "../../core/models/curso.model";
import {
  ContadoresMatriculas,
  Matricula,
  pillSituacaoMatricula,
  rotuloSituacaoMatricula,
  SITUACOES_DOCUMENTACAO,
  SituacaoDocumentacao,
  SituacaoMatriculaOpcao,
} from "../../core/models/matricula.model";
import { formatarCpf } from "../../shared/utils/cpf.util";
import { iniciaisDe } from "../../shared/utils/iniciais";
import { AuthService } from "../../core/auth/auth.service";
import { DocumentosLegadoDialogComponent } from "../alunos/documentos-legado-dialog.component";
import { ContratoMatriculaDialogComponent } from "./contrato-matricula-dialog.component";
import {
  DadosDocumentosLegadoLote,
  DocumentosLegadoLoteDialogComponent,
} from "./documentos-legado-lote-dialog.component";
import { DocumentosMatriculaDialogComponent } from "./documentos-matricula-dialog.component";
import { CobrancaService } from "../../core/services/cobranca.service";
import { SituacaoCobranca, Tag } from "../../core/models/cobranca.model";
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from "../../shared/components/confirm-dialog.component";
import { PaginacaoComponent } from "../../shared/components/paginacao.component";

type Aba = "TODAS" | "ATIVAS" | "AGUARDANDO" | "EM_ATRASO" | "SEM_CONTRATO";

const ABAS: { chave: Aba; rotulo: string }[] = [
  { chave: "TODAS", rotulo: "Todas" },
  { chave: "ATIVAS", rotulo: "Ativas" },
  { chave: "AGUARDANDO", rotulo: "Aguardando pagamento" },
  { chave: "EM_ATRASO", rotulo: "Com parcelas vencidas" },
  { chave: "SEM_CONTRATO", rotulo: "Sem contrato assinado" },
];

/** Filtros da lista (e da busca de documentos "de todas do filtro"), no formato da API. */
export interface FiltrosDaLista {
  alunoNome?: string;
  alunoCpf?: string;
  cursoId?: string;
  situacao?: string;
  situacaoCobrancaId?: string;
  tagId?: string;
  contratoAssinado?: boolean;
  tcdAssinado?: boolean;
  comParcelaVencida?: boolean;
  situacaoDocumentacao?: string;
  dataMatriculaInicio?: string;
  dataMatriculaFim?: string;
}

/** Lista de matrículas (padrão docs/especificacao): contadores, abas, filtros e tabela. */
@Component({
  selector: "app-matriculas-list",
  standalone: true,
  imports: [
    DatePipe,
    NgClass,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatMenuModule,
    MatProgressBarModule,
    MatSelectModule,
    MatDialogModule,
    PaginacaoComponent,
  ],
  template: `
    <div class="ef-page">
      <div class="ef-page-header">
        <div>
          <h1 class="ef-title">Matrículas</h1>
          <p class="ef-subtitle">
            Acompanhe matrículas, contratos, documentação e a situação das parcelas.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          @if (authService.temPerfil("ADMINISTRADOR", "FINANCEIRO")) {
            <button mat-stroked-button type="button" [matMenuTriggerFor]="lote">
              Ações em lote <mat-icon iconPositionEnd>expand_more</mat-icon>
            </button>
            <mat-menu #lote="matMenu">
              <button
                mat-menu-item
                type="button"
                [disabled]="total() === 0"
                title="Busca no sistema legado os documentos dos alunos de todas as matrículas desta consulta"
                (click)="buscarDocumentosEmLote(false)"
              >
                <mat-icon>cloud_download</mat-icon>
                Buscar documentos no legado (todas do filtro: {{ total() }})
              </button>
            </mat-menu>
          }
          <a mat-flat-button color="primary" routerLink="/matriculas/cadastro">
            <mat-icon>add</mat-icon> Nova matrícula
          </a>
        </div>
      </div>

      <div class="ef-kpis" data-testid="contadores">
        <div class="ef-kpi">
          <div class="ef-kpi-label">Todas as matrículas</div>
          <div class="ef-kpi-value">{{ numero(contadores()?.total) }}</div>
        </div>
        <div class="ef-kpi">
          <div class="ef-kpi-label">Ativas</div>
          <div class="ef-kpi-value">{{ numero(contadores()?.ativas) }}</div>
        </div>
        <div class="ef-kpi">
          <div class="ef-kpi-label">Com parcelas vencidas</div>
          <div class="ef-kpi-value">{{ numero(contadores()?.comParcelaVencida) }}</div>
        </div>
        <div class="ef-kpi">
          <div class="ef-kpi-label">Documentação incompleta</div>
          <div class="ef-kpi-value">{{ numero(contadores()?.documentacaoIncompleta) }}</div>
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
              placeholder="Buscar por nome ou CPF do aluno"
              aria-label="Buscar matrículas por nome ou CPF do aluno"
              class="w-full border-0 bg-transparent text-sm outline-none"
            />
          </label>
          <select
            class="w-[220px] max-w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm"
            aria-label="Filtrar por curso"
            [value]="filtros.controls.cursoId.value ?? ''"
            (change)="filtros.controls.cursoId.setValue($any($event.target).value || undefined)"
          >
            <option value="">Todos os cursos</option>
            @for (c of cursos(); track c.id) {
              <option [value]="c.id" [selected]="c.id === filtros.controls.cursoId.value">
                {{ c.nome }}
              </option>
            }
          </select>
          <select
            class="w-[200px] max-w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm"
            aria-label="Filtrar por situação"
            [value]="filtros.controls.situacao.value ?? ''"
            (change)="filtros.controls.situacao.setValue($any($event.target).value || undefined)"
          >
            <option value="">Todas as situações</option>
            @for (s of situacoesMatricula; track s.codigo) {
              <option [value]="s.codigo" [selected]="s.codigo === filtros.controls.situacao.value">
                {{ s.nome }}
              </option>
            }
          </select>
          <button
            mat-stroked-button
            type="button"
            [attr.aria-expanded]="maisFiltros()"
            (click)="maisFiltros.set(!maisFiltros())"
          >
            <mat-icon>filter_list</mat-icon> Filtros
            @if (filtrosAvancadosAtivos() > 0) {
              <span
                class="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-700 px-1.5 text-xs text-white"
                >{{ filtrosAvancadosAtivos() }}</span
              >
            }
          </button>
          @if (temFiltro()) {
            <button mat-button type="button" (click)="limparFiltros()">Limpar</button>
          }
        </div>

        @if (maisFiltros()) {
          <form
            [formGroup]="filtros"
            class="grid grid-cols-2 items-start gap-3 border-t border-line bg-[#fafbfc] p-4 sm:grid-cols-3 lg:grid-cols-4"
          >
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Situação de cobrança</mat-label>
              <mat-select formControlName="situacaoCobrancaId">
                <mat-option [value]="undefined">Todas</mat-option>
                @for (situacao of situacoesCobranca; track situacao.id) {
                  <mat-option [value]="situacao.id">{{ situacao.nome }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>TAG</mat-label>
              <mat-select formControlName="tagId">
                <mat-option [value]="undefined">Todas</mat-option>
                @for (tag of tags; track tag.id) {
                  <mat-option [value]="tag.id">{{ tag.nome }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Documentação</mat-label>
              <mat-select formControlName="situacaoDocumentacao">
                <mat-option [value]="undefined">Todas</mat-option>
                @for (s of situacoesDocumentacao; track s.valor) {
                  <mat-option [value]="s.valor">{{ s.rotulo }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Contrato assinado</mat-label>
              <mat-select formControlName="contratoAssinado">
                <mat-option [value]="undefined">Todos</mat-option>
                <mat-option [value]="true">Sim</mat-option>
                <mat-option [value]="false">Não</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>TCD assinado</mat-label>
              <mat-select formControlName="tcdAssinado">
                <mat-option [value]="undefined">Todos</mat-option>
                <mat-option [value]="true">Sim</mat-option>
                <mat-option [value]="false">Não</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Matrícula de</mat-label>
              <input matInput type="date" formControlName="dataMatriculaInicio" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Matrícula até</mat-label>
              <input matInput type="date" formControlName="dataMatriculaFim" />
            </mat-form-field>
          </form>
        }

        @if (selecionadas.size > 0 && authService.temPerfil("ADMINISTRADOR", "FINANCEIRO")) {
          <div
            class="flex flex-wrap items-center gap-3 border-t border-line bg-brand-50 px-4 py-2.5 text-sm"
            role="status"
          >
            <strong>{{ selecionadas.size }} marcada(s)</strong>
            <button
              mat-flat-button
              color="primary"
              type="button"
              title="Busca no sistema legado os documentos dos alunos das matrículas marcadas"
              (click)="buscarDocumentosEmLote(true)"
            >
              <mat-icon>cloud_download</mat-icon> Buscar documentos no legado
            </button>
            <button mat-button type="button" (click)="limparSelecao()">Limpar seleção</button>
          </div>
        }

        @if (carregando()) {
          <mat-progress-bar mode="indeterminate"></mat-progress-bar>
        }

        <div class="overflow-x-auto">
          <table class="ef-table ef-table-compact" data-testid="tabela-matriculas">
            <thead>
              <tr>
                <th class="w-10">
                  <mat-checkbox
                    aria-label="Selecionar todas desta página"
                    [checked]="todasDaPaginaMarcadas()"
                    [indeterminate]="algumasDaPaginaMarcadas()"
                    (change)="marcarPagina($event.checked)"
                  ></mat-checkbox>
                </th>
                <th class="ef-col-principal">
                  Aluno
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
                <th>Matrícula</th>
                <th>Situação</th>
                <th>Documentação</th>
                <th>Contrato</th>
                <th>Parcelas</th>
                <th class="w-[1%]"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              @for (m of matriculas(); track m.id) {
                <tr class="group">
                  <td>
                    <mat-checkbox
                      [aria-label]="'Selecionar a matrícula de ' + (m.aluno?.nome || 'aluno')"
                      [checked]="selecionadas.has(m.id)"
                      (change)="marcar(m.id, $event.checked)"
                    ></mat-checkbox>
                  </td>
                  <td class="ef-col-principal">
                    <div class="flex items-center gap-3">
                      <span class="ef-avatar">{{ iniciais(m.aluno?.nome) }}</span>
                      <div class="leading-tight">
                        <a
                          [routerLink]="['/alunos', m.alunoId]"
                          class="font-medium text-brand-700 no-underline hover:underline"
                          >{{ m.aluno?.nome || m.alunoId }}</a
                        >
                        <div class="text-xs tabular-nums text-muted">
                          CPF {{ cpf(m.aluno?.cpf) }}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{{ m.curso?.nome || m.cursoId }}</td>
                  <td class="whitespace-nowrap leading-tight">
                    <div>{{ m.numeroMatricula || "—" }}</div>
                    <div class="text-xs text-muted">
                      {{ m.dataMatricula ? (m.dataMatricula | date: "dd/MM/yyyy" : "UTC") : "—" }}
                    </div>
                  </td>
                  <td>
                    <span [class]="pillSituacao(m.situacao)">{{ rotuloSituacao(m.situacao) }}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      [class]="
                        pillDocumentacao(m.situacaoDocumentacao) + ' cursor-pointer border-0'
                      "
                      title="Ver os documentos desta matrícula"
                      (click)="abrirDocumentos(m)"
                    >
                      {{ situacaoDocumentacao(m).rotulo }}
                    </button>
                  </td>
                  <td class="leading-tight">
                    <span
                      [class]="m.contratoAssinado ? 'ef-pill ef-pill-ok' : 'ef-pill ef-pill-warn'"
                      >{{ m.contratoAssinado ? "Assinado" : "Pendente" }}</span
                    >
                    <div class="mt-1 text-xs text-muted">
                      TCD {{ m.tcdAssinado ? "assinado" : "pendente" }}
                    </div>
                  </td>
                  <td>
                    <div class="flex flex-wrap gap-1">
                      @for (badge of badgesParcelas(m); track badge.label) {
                        <span class="ef-chip" [ngClass]="badge.classe">{{ badge.label }}</span>
                      }
                      @if (badgesParcelas(m).length === 0) {
                        <span class="text-xs text-muted">—</span>
                      }
                    </div>
                  </td>
                  <td class="whitespace-nowrap text-right">
                    <button
                      mat-icon-button
                      type="button"
                      [matMenuTriggerFor]="acoes"
                      [matMenuTriggerData]="{ m: m }"
                      [attr.aria-label]="'Ações da matrícula de ' + (m.aluno?.nome || 'aluno')"
                    >
                      <mat-icon>more_vert</mat-icon>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>

          @if (!carregando() && matriculas().length === 0) {
            <p class="m-0 p-8 text-center text-muted">Nenhuma matrícula encontrada.</p>
          }
        </div>

        <app-paginacao
          class="block border-t border-line"
          rotuloItens="matrículas"
          [total]="total()"
          [pagina]="pagina()"
          [tamanho]="tamanho()"
          (paginaAlterada)="mudarPagina($event)"
          (tamanhoAlterado)="mudarTamanho($event)"
        />
      </section>
    </div>

    <mat-menu #acoes="matMenu">
      <ng-template matMenuContent let-m="m">
        <a mat-menu-item [routerLink]="['/matriculas', m.id]">
          <mat-icon>edit</mat-icon> Editar matrícula
        </a>
        @if (authService.temPerfil("ADMINISTRADOR")) {
          <a mat-menu-item [routerLink]="['/cobranca/matriculas', m.id]">
            <mat-icon>receipt_long</mat-icon> Ficha de cobrança
          </a>
        }
        <button mat-menu-item type="button" (click)="abrirDocumentos(m)">
          <mat-icon>folder_open</mat-icon> Documentos
        </button>
        @if (authService.temPerfil("ADMINISTRADOR", "FINANCEIRO")) {
          <button mat-menu-item type="button" (click)="abrirContrato(m)">
            <mat-icon>draw</mat-icon> Contrato de prestação de serviços
          </button>
          <button mat-menu-item type="button" (click)="buscarDocumentosLegado(m)">
            <mat-icon>cloud_download</mat-icon> Buscar documentos no legado
          </button>
        }
        <button mat-menu-item type="button" class="!text-red-700" (click)="remover(m)">
          <mat-icon class="!text-red-700">delete</mat-icon> Remover
        </button>
      </ng-template>
    </mat-menu>
  `,
})
export class MatriculasListComponent implements OnInit {
  private readonly service = inject(MatriculasService);
  private readonly cobrancaService = inject(CobrancaService);
  private readonly cursosService = inject(CursosService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  readonly authService = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly abas = ABAS;
  readonly aba = signal<Aba>("TODAS");
  readonly busca = new FormControl("", { nonNullable: true });
  readonly filtros = this.fb.nonNullable.group({
    cursoId: this.fb.control<string | undefined>(undefined),
    situacao: this.fb.control<string | undefined>(undefined),
    situacaoCobrancaId: this.fb.control<string | undefined>(undefined),
    tagId: this.fb.control<string | undefined>(undefined),
    contratoAssinado: this.fb.control<boolean | undefined>(undefined),
    tcdAssinado: this.fb.control<boolean | undefined>(undefined),
    situacaoDocumentacao: this.fb.control<string | undefined>(undefined),
    dataMatriculaInicio: this.fb.control<string | undefined>(undefined),
    dataMatriculaFim: this.fb.control<string | undefined>(undefined),
  });

  situacoesMatricula: SituacaoMatriculaOpcao[] = [];
  protected readonly situacoesDocumentacao = SITUACOES_DOCUMENTACAO;
  protected readonly rotuloSituacao = rotuloSituacaoMatricula;
  situacoesCobranca: SituacaoCobranca[] = [];
  tags: Tag[] = [];

  readonly matriculas = signal<Matricula[]>([]);
  readonly cursos = signal<Curso[]>([]);
  readonly contadores = signal<ContadoresMatriculas | null>(null);
  readonly total = signal(0);
  readonly pagina = signal(1);
  readonly tamanho = signal(20);
  readonly carregando = signal(false);
  readonly maisFiltros = signal(false);
  /** O CPF aparece mascarado (***.***.***-**) até o usuário pedir para mostrar. */
  readonly cpfVisivel = signal(false);

  ngOnInit(): void {
    this.service.situacoes().subscribe((res) => (this.situacoesMatricula = res));
    this.cobrancaService.listarSituacoes(true).subscribe((res) => (this.situacoesCobranca = res));
    this.cobrancaService.listarTags().subscribe((res) => (this.tags = res));
    this.cursosService.listar({ pageSize: 100 }).subscribe((r) => this.cursos.set(r.data));
    this.atualizarContadores();
    this.carregar();
    merge(this.busca.valueChanges, this.filtros.valueChanges)
      .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.pagina.set(1);
        this.selecionadas.clear();
        this.carregar();
      });
  }

  numero(valor: number | undefined): string {
    return valor === undefined ? "—" : valor.toLocaleString("pt-BR");
  }

  cpf(valor: string | undefined): string {
    if (!valor) return "—";
    return this.cpfVisivel() ? formatarCpf(valor) : "***.***.***-**";
  }

  iniciais(nome: string | undefined): string {
    return iniciaisDe(nome ?? "");
  }

  protected readonly pillSituacao = pillSituacaoMatricula;

  pillDocumentacao(situacao: SituacaoDocumentacao): string {
    if (situacao === "DOCUMENTACAO_COMPLETA") return "ef-pill ef-pill-ok";
    if (situacao === "SEM_DOCUMENTOS") return "ef-pill ef-pill-bad";
    return "ef-pill ef-pill-warn";
  }

  /** Filtros avançados em uso (o número do botão "Filtros"). */
  filtrosAvancadosAtivos(): number {
    const v = this.filtros.getRawValue();
    return [
      v.situacaoCobrancaId,
      v.tagId,
      v.situacaoDocumentacao,
      v.contratoAssinado,
      v.tcdAssinado,
      v.dataMatriculaInicio,
      v.dataMatriculaFim,
    ].filter((x) => x !== undefined && x !== null && x !== "").length;
  }

  temFiltro(): boolean {
    const v = this.filtros.getRawValue();
    return (
      this.busca.value.trim() !== "" ||
      !!v.cursoId ||
      !!v.situacao ||
      this.filtrosAvancadosAtivos() > 0 ||
      this.aba() !== "TODAS"
    );
  }

  limparFiltros(): void {
    this.aba.set("TODAS");
    this.busca.setValue("", { emitEvent: false });
    this.filtros.reset({}, { emitEvent: false });
    this.pagina.set(1);
    this.selecionadas.clear();
    this.carregar();
  }

  mudarAba(aba: Aba): void {
    this.aba.set(aba);
    this.pagina.set(1);
    this.selecionadas.clear();
    this.carregar();
  }

  /**
   * Os filtros no formato da API: a busca (CPF se só tem dígitos e pontuação; senão nome), os
   * campos e o filtro rápido da aba escolhida.
   */
  valoresDosFiltros(): FiltrosDaLista {
    const v = this.filtros.getRawValue();
    const texto = this.busca.value.trim();
    const pareceCpf = /^[\d.\-\s]+$/.test(texto) && texto.replace(/\D/g, "").length >= 3;
    const filtros: FiltrosDaLista = {
      alunoNome: texto && !pareceCpf ? texto : undefined,
      alunoCpf: texto && pareceCpf ? texto : undefined,
      cursoId: v.cursoId || undefined,
      situacao: v.situacao || undefined,
      situacaoCobrancaId: v.situacaoCobrancaId || undefined,
      tagId: v.tagId || undefined,
      contratoAssinado: v.contratoAssinado ?? undefined,
      tcdAssinado: v.tcdAssinado ?? undefined,
      situacaoDocumentacao: v.situacaoDocumentacao || undefined,
      dataMatriculaInicio: v.dataMatriculaInicio || undefined,
      dataMatriculaFim: v.dataMatriculaFim || undefined,
    };
    switch (this.aba()) {
      case "ATIVAS":
        filtros.situacao = "ATIVA";
        break;
      case "AGUARDANDO":
        filtros.situacao = "AGUARDANDO_PAGAMENTO";
        break;
      case "EM_ATRASO":
        filtros.comParcelaVencida = true;
        break;
      case "SEM_CONTRATO":
        filtros.contratoAssinado = false;
        break;
    }
    return filtros;
  }

  carregar(): void {
    this.carregando.set(true);
    this.service
      .listar({ ...this.valoresDosFiltros(), page: this.pagina(), pageSize: this.tamanho() })
      .subscribe({
        next: (res) => {
          this.matriculas.set(res.data);
          this.total.set(res.total);
          this.carregando.set(false);
        },
        error: () => this.carregando.set(false),
      });
  }

  private atualizarContadores(): void {
    this.service.contadores().subscribe((c) => this.contadores.set(c));
  }

  /** Contagem de parcelas por situação, para os selos do grid (item 4 do PENDENCIAS.md). */
  badgesParcelas(m: Matricula): Array<{ label: string; classe: string }> {
    const r = m.resumoParcelas;
    if (!r) return [];

    const badges: Array<{ label: string; classe: string }> = [];
    if (r.vencidas > 0) {
      badges.push({
        label: `${r.vencidas} vencida${r.vencidas > 1 ? "s" : ""}`,
        classe: "bg-orange-100 text-orange-700",
      });
    }
    if (r.protestadas > 0) {
      badges.push({
        label: `${r.protestadas} protestada${r.protestadas > 1 ? "s" : ""}`,
        classe: "bg-red-100 text-red-800",
      });
    }
    if (r.emAberto > 0) {
      badges.push({
        label: `${r.emAberto} aberta${r.emAberto > 1 ? "s" : ""}`,
        classe: "bg-blue-100 text-blue-700",
      });
    }
    if (r.renegociadas > 0) {
      badges.push({
        label: `${r.renegociadas} renegociada${r.renegociadas > 1 ? "s" : ""}`,
        classe: "bg-purple-100 text-purple-700",
      });
    }
    if (r.pagas > 0) {
      badges.push({
        label: `${r.pagas} paga${r.pagas > 1 ? "s" : ""}`,
        classe: "bg-green-100 text-green-700",
      });
    }
    if (r.canceladas > 0) {
      badges.push({
        label: `${r.canceladas} cancelada${r.canceladas > 1 ? "s" : ""}`,
        classe: "bg-gray-100 text-gray-500",
      });
    }
    return badges;
  }

  // ---- seleção e busca de documentos no legado em lote

  /** Matrículas marcadas (mantidas ao trocar de página; zeradas ao mudar o filtro). */
  readonly selecionadas = new Set<string>();

  marcar(id: string, marcada: boolean): void {
    if (marcada) this.selecionadas.add(id);
    else this.selecionadas.delete(id);
  }

  marcarPagina(marcada: boolean): void {
    for (const m of this.matriculas()) this.marcar(m.id, marcada);
  }

  limparSelecao(): void {
    this.selecionadas.clear();
  }

  todasDaPaginaMarcadas(): boolean {
    const m = this.matriculas();
    return m.length > 0 && m.every((x) => this.selecionadas.has(x.id));
  }

  algumasDaPaginaMarcadas(): boolean {
    return (
      !this.todasDaPaginaMarcadas() && this.matriculas().some((m) => this.selecionadas.has(m.id))
    );
  }

  /** Abre a busca em lote: das matrículas marcadas, ou de todas as que casam com o filtro atual. */
  buscarDocumentosEmLote(marcadas: boolean): void {
    const dados: DadosDocumentosLegadoLote = marcadas
      ? {
          matriculaIds: [...this.selecionadas],
          quantidade: this.selecionadas.size,
          origem: "marcadas",
        }
      : {
          filtros: this.valoresDosFiltros(),
          quantidade: this.total(),
          origem: "do filtro atual",
        };
    this.dialog
      .open(DocumentosLegadoLoteDialogComponent, {
        width: "760px",
        maxWidth: "95vw",
        maxHeight: "90vh",
        data: dados,
      })
      .afterClosed()
      // A situação da documentação das linhas muda com a busca.
      .subscribe(() => this.carregar());
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

  remover(matricula: Matricula): void {
    const data: ConfirmDialogData = {
      titulo: "Remover matrícula",
      mensagem: `Deseja remover a matrícula de "${matricula.aluno?.nome ?? "aluno"}"?`,
      confirmarTexto: "Remover",
    };
    this.dialog
      .open(ConfirmDialogComponent, { data, width: "440px" })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.service.remover(matricula.id).subscribe(() => {
          this.snackBar.open("Matrícula removida", "Fechar", { duration: 3000 });
          this.carregar();
          this.atualizarContadores();
        });
      });
  }

  /** Lista de documentos da matrícula, com visualizar e baixar. */
  abrirDocumentos(m: Matricula): void {
    this.dialog
      .open(DocumentosMatriculaDialogComponent, {
        width: "980px",
        maxWidth: "95vw",
        maxHeight: "90vh",
        data: {
          matriculaId: m.id,
          aluno: m.aluno?.nome ?? "aluno",
          numeroMatricula: m.numeroMatricula ?? null,
          curso: m.curso?.nome ?? null,
        },
      })
      // Conferir/baixar documentos ali dentro muda a situação da documentação desta linha.
      .afterClosed()
      .subscribe(() => {
        this.carregar();
        this.atualizarContadores();
      });
  }

  situacaoDocumentacao(m: Matricula) {
    return (
      SITUACOES_DOCUMENTACAO.find((s) => s.valor === m.situacaoDocumentacao) ??
      SITUACOES_DOCUMENTACAO[0]
    );
  }

  /** Contrato de prestação de serviços: gerar, visualizar e enviar para assinatura. */
  abrirContrato(m: Matricula): void {
    this.dialog.open(ContratoMatriculaDialogComponent, {
      width: "980px",
      maxWidth: "95vw",
      maxHeight: "92vh",
      data: {
        matriculaId: m.id,
        aluno: m.aluno?.nome ?? "aluno",
        numeroMatricula: m.numeroMatricula ?? null,
        curso: m.curso?.nome ?? null,
      },
    });
  }

  /** Busca no legado os documentos do aluno da matrícula e baixa os arquivos. */
  buscarDocumentosLegado(m: Matricula): void {
    this.dialog.open(DocumentosLegadoDialogComponent, {
      width: "760px",
      maxHeight: "90vh",
      data: { id: m.alunoId, nome: m.aluno?.nome ?? "aluno" },
    });
  }
}
