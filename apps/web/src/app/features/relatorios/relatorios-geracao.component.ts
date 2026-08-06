import { Component, inject, OnDestroy, OnInit } from "@angular/core";
import { CurrencyPipe, DatePipe } from "@angular/common";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatMenuModule } from "@angular/material/menu";
import { MatSelectModule } from "@angular/material/select";
import { MatTableModule } from "@angular/material/table";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Subscription, interval, switchMap, takeWhile } from "rxjs";
import { RelatoriosService } from "../../core/services/relatorios.service";
import { CursosService } from "../../core/services/cursos.service";
import { CobrancaService } from "../../core/services/cobranca.service";
import { ConfiguracoesService } from "../../core/services/configuracoes.service";
import {
  FiltrosRelatorio,
  MatriculaElegivel,
  RelatorioInadimplencia,
  TipoTituloProtesto,
} from "../../core/models/relatorio.model";
import { Curso } from "../../core/models/curso.model";
import { SituacaoCobranca, Tag } from "../../core/models/cobranca.model";
import { RelatorioDetalheDialogComponent } from "./relatorio-detalhe-dialog.component";
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from "../../shared/components/confirm-dialog.component";
import { extrairNomeArquivo, salvarBlobComoArquivo } from "../../shared/utils/download.util";

const TAMANHO_PAGINA_HISTORICO = 10;

@Component({
  selector: "app-relatorios-geracao",
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    MatProgressBarModule,
    MatDialogModule,
    MatMenuModule,
  ],
  template: `
    <h1 class="text-2xl font-medium mb-4">Relatório de inadimplência</h1>

    <div class="bg-white rounded-xl border p-5 mb-5">
      <p class="text-xs font-medium text-gray-600 mb-3">Financeiro</p>
      <form [formGroup]="filtros" class="grid grid-cols-2 md:grid-cols-4 gap-3 items-start">
        <mat-form-field appearance="outline">
          <mat-label>Dias de atraso mínimo</mat-label>
          <input matInput type="number" min="0" formControlName="diasAtraso" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Valor mínimo</mat-label>
          <input matInput type="number" min="0" formControlName="valorMinimo" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Curso</mat-label>
          <mat-select formControlName="cursoId">
            <mat-option [value]="undefined">Todos os cursos</mat-option>
            @for (curso of cursos; track curso.id) {
              <mat-option [value]="curso.id">{{ curso.nome }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <p class="text-xs font-medium text-gray-600 col-span-2 md:col-span-4 mb-0 mt-1">
          Cobrança
        </p>
        <mat-form-field appearance="outline">
          <mat-label>Incluir situação</mat-label>
          <mat-select formControlName="situacaoCobrancaId">
            <mat-option [value]="undefined">Todas as situações</mat-option>
            @for (situacao of situacoes; track situacao.id) {
              <mat-option [value]="situacao.id">{{ situacao.nome }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Possui a TAG</mat-label>
          <mat-select formControlName="tagId">
            <mat-option [value]="undefined">Qualquer TAG</mat-option>
            @for (tag of tags; track tag.id) {
              <mat-option [value]="tag.id">{{ tag.nome }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>TCD assinado</mat-label>
          <mat-select formControlName="tcdAssinado">
            <mat-option [value]="undefined">Todos</mat-option>
            <mat-option [value]="true">Sim</mat-option>
            <mat-option [value]="false">Não</mat-option>
          </mat-select>
        </mat-form-field>
        <div class="flex items-center">
          <mat-checkbox formControlName="ignorarSituacoesTratadas">
            Excluir situações já tratadas
          </mat-checkbox>
        </div>
        <div class="flex items-center">
          <mat-checkbox formControlName="incluirParcelasVencidasRecentes">
            Incluir parcelas só vencidas (menos que o mínimo) no mesmo documento
          </mat-checkbox>
        </div>
        <mat-form-field appearance="outline">
          <mat-label>Gerar protesto com</mat-label>
          <mat-select formControlName="tipoTituloProtesto">
            <mat-option value="AMBOS">Mensalidade e Renegociação</mat-option>
            <mat-option value="MENSALIDADE">Somente Mensalidade</mat-option>
            <mat-option value="RENEGOCIACAO">Somente Renegociação</mat-option>
          </mat-select>
        </mat-form-field>
        @if (filtros.controls.tipoTituloProtesto.value === "AMBOS") {
          <div class="flex items-center">
            <mat-checkbox formControlName="separarDocumentosPorTipo">
              Separar em dois documentos (um de Mensalidade, um de Renegociação)
            </mat-checkbox>
          </div>
        }
      </form>
      <button mat-raised-button color="primary" type="button" (click)="buscarElegiveis()">
        <mat-icon>search</mat-icon> Buscar elegíveis
      </button>
      <p class="text-[11px] text-gray-400 mt-3 mb-0">
        Deixe em branco para usar os padrões configurados no sistema. "Excluir situações já
        tratadas" ignora matrículas cuja situação atual está marcada como
        "não participa de novos relatórios", além de sempre ignorar matrículas com a situação
        "Quitado". Por padrão, o documento de protesto só inclui parcelas vencidas há mais do que
        o mínimo de dias configurado — "Incluir parcelas só vencidas" também inclui, no mesmo
        documento, as parcelas da matrícula que estão vencidas mas ainda dentro desse mínimo.
      </p>
    </div>

    @if (carregandoElegiveis) {
      <mat-progress-bar mode="indeterminate" class="mb-3"></mat-progress-bar>
    }

    @if (buscou) {
      @if (elegiveis.length > 0) {
        <div class="flex flex-wrap justify-between items-center gap-2 bg-blue-50 rounded px-4 py-2 mb-3">
          <span class="text-sm text-blue-900 font-medium">
            {{ selecionados.size }} de {{ elegiveis.length }} alunos selecionados
          </span>
          <div class="flex flex-wrap gap-2 items-center">
            <mat-form-field appearance="outline" class="!w-44" subscriptSizing="dynamic">
              <mat-select
                placeholder="Alterar situação"
                (selectionChange)="situacaoLote = $event.value"
              >
                @for (situacao of situacoes; track situacao.id) {
                  <mat-option [value]="situacao.id">{{ situacao.nome }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" class="!w-40" subscriptSizing="dynamic">
              <mat-select placeholder="Inserir TAG" (selectionChange)="tagLote = $event.value">
                @for (tag of tags; track tag.id) {
                  <mat-option [value]="tag.id">{{ tag.nome }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <button
              mat-stroked-button
              [disabled]="selecionados.size === 0 || (!situacaoLote && !tagLote)"
              (click)="aplicarLote()"
            >
              Aplicar
            </button>
            <button
              mat-raised-button
              color="primary"
              [disabled]="selecionados.size === 0 || gerando"
              (click)="gerarRelatorio()"
            >
              <mat-icon>description</mat-icon> Gerar Word em lote
            </button>
          </div>
        </div>

        <div class="bg-white rounded shadow-sm overflow-x-auto mb-6 w-full">
          <table mat-table [dataSource]="elegiveis" class="w-full table-compact">
            <ng-container matColumnDef="selecionar">
              <th mat-header-cell *matHeaderCellDef>
                <mat-checkbox
                  [checked]="todosSelecionados()"
                  [indeterminate]="algunsSelecionados()"
                  (change)="alternarTodos($event.checked)"
                ></mat-checkbox>
              </th>
              <td mat-cell *matCellDef="let e">
                <mat-checkbox
                  [checked]="selecionados.has(e.matriculaId)"
                  (change)="alternarSelecao(e.matriculaId)"
                ></mat-checkbox>
              </td>
            </ng-container>
            <ng-container matColumnDef="nome">
              <th mat-header-cell *matHeaderCellDef>Nome</th>
              <td mat-cell *matCellDef="let e">{{ e.alunoNome }}</td>
            </ng-container>
            <ng-container matColumnDef="curso">
              <th mat-header-cell *matHeaderCellDef>Curso</th>
              <td mat-cell *matCellDef="let e">{{ e.cursoNome }}</td>
            </ng-container>
            <ng-container matColumnDef="parcelas">
              <th mat-header-cell *matHeaderCellDef>Parcelas</th>
              <td mat-cell *matCellDef="let e">{{ e.quantidadeParcelasVencidas }}</td>
            </ng-container>
            <ng-container matColumnDef="diasAtraso">
              <th mat-header-cell *matHeaderCellDef>Dias de atraso</th>
              <td mat-cell *matCellDef="let e">{{ e.diasAtrasoMaximo }}</td>
            </ng-container>
            <ng-container matColumnDef="total">
              <th mat-header-cell *matHeaderCellDef>Total devedor</th>
              <td mat-cell *matCellDef="let e">{{ e.valorTotal | currency: "BRL" }}</td>
            </ng-container>
            <ng-container matColumnDef="situacao">
              <th mat-header-cell *matHeaderCellDef>Situação</th>
              <td mat-cell *matCellDef="let e">
                <span class="px-2 py-0.5 rounded text-xs bg-gray-100">{{
                  e.situacaoCobrancaNome || "—"
                }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="documento">
              <th mat-header-cell *matHeaderCellDef>Documento</th>
              <td mat-cell *matCellDef="let e">
                @if (documentosGerados.has(e.matriculaId)) {
                  <button
                    mat-stroked-button
                    class="!min-w-0 !px-2 !h-7 !text-xs"
                    [matMenuTriggerFor]="menuDocumento"
                  >
                    <mat-icon class="!text-base !w-4 !h-4">download</mat-icon> Baixar
                  </button>
                  <mat-menu #menuDocumento="matMenu">
                    <button mat-menu-item (click)="baixarDocumentoGerado(e.matriculaId, 'docx')">
                      Word (.docx)
                    </button>
                    <button mat-menu-item (click)="baixarDocumentoGerado(e.matriculaId, 'pdf')">
                      PDF
                    </button>
                  </mat-menu>
                } @else {
                  <span class="text-gray-400 text-xs">—</span>
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="acoes">
              <th mat-header-cell *matHeaderCellDef class="text-right">Ficha</th>
              <td mat-cell *matCellDef="let e" class="text-right">
                <a
                  mat-icon-button
                  [routerLink]="['/cobranca/matriculas', e.matriculaId]"
                  aria-label="Ver ficha de cobrança"
                >
                  <mat-icon>receipt_long</mat-icon>
                </a>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="colunasElegiveis"></tr>
            <tr mat-row *matRowDef="let row; columns: colunasElegiveis"></tr>
          </table>
        </div>
      } @else {
        <p class="p-4 text-center text-gray-500 mb-6">
          Nenhum aluno elegível encontrado para os filtros informados.
        </p>
      }
    }

    <div>
      <p class="text-xs font-medium text-gray-600 mb-3">Histórico de relatórios gerados</p>

      @if (carregandoHistorico) {
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      }

      <div class="bg-white rounded shadow-sm overflow-x-auto w-full">
        <table mat-table [dataSource]="historico" class="w-full table-compact">
          <ng-container matColumnDef="data">
            <th mat-header-cell *matHeaderCellDef>Data</th>
            <td mat-cell *matCellDef="let r">{{ r.data | date: "dd/MM/yyyy HH:mm" }}</td>
          </ng-container>
          <ng-container matColumnDef="curso">
            <th mat-header-cell *matHeaderCellDef>Curso</th>
            <td mat-cell *matCellDef="let r">{{ r.curso?.nome || "Todos" }}</td>
          </ng-container>
          <ng-container matColumnDef="totalElegiveis">
            <th mat-header-cell *matHeaderCellDef>Elegíveis</th>
            <td mat-cell *matCellDef="let r">{{ r.totalElegiveis }}</td>
          </ng-container>
          <ng-container matColumnDef="totalDocumentosGerados">
            <th mat-header-cell *matHeaderCellDef>Documentos gerados</th>
            <td mat-cell *matCellDef="let r">
              <div class="flex items-center gap-2">
                <span>{{ r.totalDocumentosGerados }} / {{ r.totalElegiveis }}</span>
                @if (r.totalDocumentosGerados > 0) {
                  <button
                    mat-stroked-button
                    class="!min-w-0 !px-2 !h-7 !text-xs"
                    [matMenuTriggerFor]="menuDocumentos"
                  >
                    <mat-icon class="!text-base !w-4 !h-4">download</mat-icon> Documentos
                  </button>
                  <mat-menu #menuDocumentos="matMenu">
                    <button mat-menu-item (click)="baixarTodos(r, 'docx')">
                      Baixar todos (Word)
                    </button>
                    <button mat-menu-item (click)="baixarTodos(r, 'pdf')">
                      Baixar todos (PDF)
                    </button>
                  </mat-menu>
                }
              </div>
            </td>
          </ng-container>
          <ng-container matColumnDef="acoes">
            <th mat-header-cell *matHeaderCellDef class="text-right">Ações</th>
            <td mat-cell *matCellDef="let r" class="text-right">
              <button
                mat-icon-button
                [matMenuTriggerFor]="menuAcoes"
                aria-label="Ações do relatório"
              >
                <mat-icon>more_vert</mat-icon>
              </button>
              <mat-menu #menuAcoes="matMenu">
                <button mat-menu-item (click)="verDetalhes(r)">
                  <mat-icon>visibility</mat-icon>
                  <span>Ver detalhes</span>
                </button>
                <button
                  mat-menu-item
                  [disabled]="r.totalDocumentosGerados === 0"
                  (click)="baixarTodos(r, 'docx')"
                >
                  <mat-icon>download</mat-icon>
                  <span>Baixar todos (Word)</span>
                </button>
                <button
                  mat-menu-item
                  [disabled]="r.totalDocumentosGerados === 0"
                  (click)="baixarTodos(r, 'pdf')"
                >
                  <mat-icon>download</mat-icon>
                  <span>Baixar todos (PDF)</span>
                </button>
                <button mat-menu-item (click)="excluirRegistro(r)">
                  <mat-icon color="warn">delete</mat-icon>
                  <span>Excluir do histórico</span>
                </button>
              </mat-menu>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="colunasHistorico"></tr>
          <tr mat-row *matRowDef="let row; columns: colunasHistorico"></tr>
        </table>

        @if (!carregandoHistorico && historico.length === 0) {
          <p class="p-6 text-center text-gray-500">Nenhum relatório gerado ainda.</p>
        }

        @if (!carregandoHistorico && historico.length < historicoTotal) {
          <div class="flex justify-center p-3">
            <button mat-stroked-button [disabled]="carregandoMaisHistorico" (click)="carregarMaisHistorico()">
              @if (carregandoMaisHistorico) {
                Carregando...
              } @else {
                Carregar mais ({{ historico.length }} de {{ historicoTotal }})
              }
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class RelatoriosGeracaoComponent implements OnInit, OnDestroy {
  private readonly service = inject(RelatoriosService);
  private readonly cursosService = inject(CursosService);
  private readonly cobrancaService = inject(CobrancaService);
  private readonly configuracoesService = inject(ConfiguracoesService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly filtros = this.fb.nonNullable.group({
    diasAtraso: this.fb.control<number | undefined>(undefined),
    valorMinimo: this.fb.control<number | undefined>(undefined),
    cursoId: this.fb.control<string | undefined>(undefined),
    situacaoCobrancaId: this.fb.control<string | undefined>(undefined),
    tagId: this.fb.control<string | undefined>(undefined),
    tcdAssinado: this.fb.control<boolean | undefined>(undefined),
    ignorarSituacoesTratadas: this.fb.nonNullable.control(true),
    incluirParcelasVencidasRecentes: this.fb.nonNullable.control(false),
    tipoTituloProtesto: this.fb.nonNullable.control<TipoTituloProtesto>("AMBOS"),
    separarDocumentosPorTipo: this.fb.nonNullable.control(false),
  });

  cursos: Curso[] = [];
  situacoes: SituacaoCobranca[] = [];
  tags: Tag[] = [];
  elegiveis: MatriculaElegivel[] = [];
  selecionados = new Set<string>();
  situacaoLote?: string;
  tagLote?: string;
  colunasElegiveis = [
    "selecionar",
    "nome",
    "curso",
    "parcelas",
    "diasAtraso",
    "total",
    "situacao",
    "documento",
    "acoes",
  ];
  carregandoElegiveis = false;
  gerando = false;
  buscou = false;

  /** matriculaId -> relatorioId, só das matrículas que tiveram documento
   * gerado com sucesso na última geração desta sessão (PRD: mostrar um botão
   * de download direto na grade de elegíveis assim que o documento sai). */
  documentosGerados = new Map<string, string>();

  historico: RelatorioInadimplencia[] = [];
  historicoTotal = 0;
  historicoPage = 1;
  colunasHistorico = ["data", "curso", "totalElegiveis", "totalDocumentosGerados", "acoes"];
  carregandoHistorico = false;
  carregandoMaisHistorico = false;

  private pollingSub?: Subscription;

  ngOnInit(): void {
    this.cursosService.listar({ pageSize: 100 }).subscribe((res) => (this.cursos = res.data));
    this.cobrancaService.listarSituacoes(true).subscribe((res) => (this.situacoes = res));
    this.cobrancaService.listarTags().subscribe((res) => (this.tags = res));
    this.carregarHistorico();
    this.configuracoesService.obter().subscribe((config) => {
      this.filtros.controls.tipoTituloProtesto.setValue(config.tipoTituloProtestoDefault, {
        emitEvent: false,
      });
      this.restaurarFiltrosDaUrl();
    });
  }

  /**
   * Restaura filtros/busca a partir da query string — permite que, ao voltar
   * da ficha de cobrança (botão "Voltar"), a pesquisa anterior seja mantida
   * em vez de reiniciar a tela do zero.
   */
  private restaurarFiltrosDaUrl(): void {
    const qp = this.route.snapshot.queryParamMap;
    if (qp.keys.length === 0) return;

    this.filtros.patchValue(
      {
        diasAtraso: qp.get("diasAtraso") ? Number(qp.get("diasAtraso")) : undefined,
        valorMinimo: qp.get("valorMinimo") ? Number(qp.get("valorMinimo")) : undefined,
        cursoId: qp.get("cursoId") ?? undefined,
        situacaoCobrancaId: qp.get("situacaoCobrancaId") ?? undefined,
        tagId: qp.get("tagId") ?? undefined,
        tcdAssinado: qp.get("tcdAssinado") ? qp.get("tcdAssinado") === "true" : undefined,
        ignorarSituacoesTratadas: qp.get("ignorarSituacoesTratadas") !== "false",
        incluirParcelasVencidasRecentes: qp.get("incluirParcelasVencidasRecentes") === "true",
        tipoTituloProtesto:
          (qp.get("tipoTituloProtesto") as TipoTituloProtesto | null) ??
          this.filtros.controls.tipoTituloProtesto.value,
        separarDocumentosPorTipo: qp.get("separarDocumentosPorTipo") === "true",
      },
      { emitEvent: false },
    );
    this.buscarElegiveis();
  }

  /** Reflete os filtros atuais na URL (sem empilhar histórico) para que o
   * botão "Voltar" da ficha de cobrança retorne para esta mesma busca. */
  private sincronizarQueryParams(): void {
    const v = this.valoresFiltro();
    const queryParams: Record<string, string> = {
      ignorarSituacoesTratadas: String(v.ignorarSituacoesTratadas),
      incluirParcelasVencidasRecentes: String(v.incluirParcelasVencidasRecentes),
      tipoTituloProtesto: String(v.tipoTituloProtesto),
      separarDocumentosPorTipo: String(v.separarDocumentosPorTipo),
    };
    if (v.diasAtraso !== undefined) queryParams["diasAtraso"] = String(v.diasAtraso);
    if (v.valorMinimo !== undefined) queryParams["valorMinimo"] = String(v.valorMinimo);
    if (v.cursoId) queryParams["cursoId"] = v.cursoId;
    if (v.situacaoCobrancaId) queryParams["situacaoCobrancaId"] = v.situacaoCobrancaId;
    if (v.tagId) queryParams["tagId"] = v.tagId;
    if (v.tcdAssinado !== undefined) queryParams["tcdAssinado"] = String(v.tcdAssinado);

    this.router.navigate([], { relativeTo: this.route, queryParams, replaceUrl: true });
  }

  ngOnDestroy(): void {
    this.pollingSub?.unsubscribe();
  }

  private valoresFiltro(): FiltrosRelatorio {
    const bruto = this.filtros.getRawValue();
    return {
      diasAtraso: bruto.diasAtraso ?? undefined,
      valorMinimo: bruto.valorMinimo ?? undefined,
      cursoId: bruto.cursoId ?? undefined,
      situacaoCobrancaId: bruto.situacaoCobrancaId ?? undefined,
      tagId: bruto.tagId ?? undefined,
      tcdAssinado: bruto.tcdAssinado ?? undefined,
      ignorarSituacoesTratadas: bruto.ignorarSituacoesTratadas,
      incluirParcelasVencidasRecentes: bruto.incluirParcelasVencidasRecentes,
      tipoTituloProtesto: bruto.tipoTituloProtesto,
      separarDocumentosPorTipo: bruto.separarDocumentosPorTipo,
    };
  }

  buscarElegiveis(): void {
    this.selecionados.clear();
    this.documentosGerados.clear();
    this.sincronizarQueryParams();
    this.buscarElegiveisPreservandoSelecao();
  }

  /** Reconsulta os elegíveis sem descartar a seleção atual — usado após ações
   * em lote, que não devem forçar o usuário a reselecionar tudo de novo.
   * Matrículas que saíram da lista (ex.: mudaram de situação e passaram a ser
   * filtradas por "excluir situações já tratadas") são removidas da seleção. */
  private buscarElegiveisPreservandoSelecao(): void {
    this.carregandoElegiveis = true;
    this.buscou = true;

    this.service.previaElegiveis(this.valoresFiltro()).subscribe({
      next: (res) => {
        this.elegiveis = res.data;
        const idsAtuais = new Set(this.elegiveis.map((e) => e.matriculaId));
        this.selecionados = new Set(
          Array.from(this.selecionados).filter((id) => idsAtuais.has(id)),
        );
        this.carregandoElegiveis = false;
      },
      error: () => (this.carregandoElegiveis = false),
    });
  }

  alternarSelecao(matriculaId: string): void {
    if (this.selecionados.has(matriculaId)) this.selecionados.delete(matriculaId);
    else this.selecionados.add(matriculaId);
  }

  alternarTodos(marcar: boolean): void {
    this.selecionados = marcar ? new Set(this.elegiveis.map((e) => e.matriculaId)) : new Set();
  }

  todosSelecionados(): boolean {
    return this.elegiveis.length > 0 && this.selecionados.size === this.elegiveis.length;
  }

  algunsSelecionados(): boolean {
    return this.selecionados.size > 0 && !this.todosSelecionados();
  }

  aplicarLote(): void {
    this.cobrancaService
      .aplicarLote({
        matriculaIds: Array.from(this.selecionados),
        situacaoCobrancaId: this.situacaoLote,
        tagIds: this.tagLote ? [this.tagLote] : undefined,
      })
      .subscribe((resultado) => {
        this.snackBar.open(
          `Aplicado em ${resultado.sucesso} de ${resultado.total} matrículas`,
          "Fechar",
          { duration: 4000 },
        );
        this.buscarElegiveisPreservandoSelecao();
      });
  }

  gerarRelatorio(): void {
    this.gerando = true;
    this.documentosGerados.clear();
    this.service.gerar(this.valoresFiltro(), Array.from(this.selecionados)).subscribe({
      next: ({ id: relatorioId, jobId }) => {
        this.snackBar.open(
          "Geração enfileirada. Os documentos aparecerão no histórico quando prontos.",
          "Fechar",
          { duration: 5000 },
        );
        this.selecionados.clear();
        this.carregarHistorico();

        if (jobId) this.acompanharGeracao(jobId, relatorioId);
        else this.gerando = false;
      },
      error: () => (this.gerando = false),
    });
  }

  private acompanharGeracao(jobId: string, relatorioId: string): void {
    this.pollingSub?.unsubscribe();
    this.pollingSub = interval(1500)
      .pipe(
        switchMap(() => this.service.statusJob(jobId)),
        takeWhile((status) => status.estado !== "completed" && status.estado !== "failed", true),
      )
      .subscribe({
        next: (status) => {
          if (status.estado === "completed") {
            this.gerando = false;
            this.snackBar.open("Geração de documentos concluída", "Fechar", { duration: 4000 });
            this.carregarHistorico();
            this.marcarDocumentosGerados(relatorioId);
          }

          if (status.estado === "failed") {
            this.gerando = false;
            this.snackBar.open(
              `Falha na geração: ${status.erro ?? "erro desconhecido"}`,
              "Fechar",
              { duration: 6000 },
            );
            this.carregarHistorico();
          }
        },
        error: () => (this.gerando = false),
      });
  }

  /** Recarrega o histórico do zero, mostrando só a primeira página (últimos
   * 10 relatórios) — usado ao entrar na tela e depois de gerar um novo
   * relatório, para não acumular páginas antigas sobre um estado que já mudou. */
  carregarHistorico(): void {
    this.carregandoHistorico = true;
    this.historicoPage = 1;
    this.service.listar({ page: 1, pageSize: TAMANHO_PAGINA_HISTORICO }).subscribe({
      next: (res) => {
        this.historico = res.data;
        this.historicoTotal = res.total;
        this.carregandoHistorico = false;
      },
      error: () => (this.carregandoHistorico = false),
    });
  }

  /** Busca a próxima página e acrescenta ao final da lista já carregada — o
   * usuário só vê os últimos 10 até clicar em "Carregar mais". */
  carregarMaisHistorico(): void {
    this.carregandoMaisHistorico = true;
    const proximaPagina = this.historicoPage + 1;
    this.service.listar({ page: proximaPagina, pageSize: TAMANHO_PAGINA_HISTORICO }).subscribe({
      next: (res) => {
        this.historico = [...this.historico, ...res.data];
        this.historicoTotal = res.total;
        this.historicoPage = proximaPagina;
        this.carregandoMaisHistorico = false;
      },
      error: () => (this.carregandoMaisHistorico = false),
    });
  }

  /** Exclui o registro do histórico e os documentos (.docx/.pdf) já gerados
   * por ele em disco (apps/api/src/modules/relatorios/relatorios.service.ts). */
  excluirRegistro(relatorio: RelatorioInadimplencia): void {
    const data: ConfirmDialogData = {
      titulo: "Excluir do histórico",
      mensagem: `Deseja excluir este relatório do histórico? Os ${relatorio.totalDocumentosGerados} documento(s) já gerados também serão apagados. Esta ação não pode ser desfeita.`,
      confirmarTexto: "Excluir",
    };
    this.dialog
      .open(ConfirmDialogComponent, { data, width: "460px" })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.service.excluir(relatorio.id).subscribe(() => {
          this.historico = this.historico.filter((r) => r.id !== relatorio.id);
          this.historicoTotal = Math.max(0, this.historicoTotal - 1);
          this.snackBar.open("Relatório excluído do histórico", "Fechar", { duration: 3000 });
        });
      });
  }

  /** Depois que a geração conclui, marca na grade de elegíveis quais
   * matrículas ganharam documento — permite baixar direto ali, sem precisar
   * abrir o histórico. */
  private marcarDocumentosGerados(relatorioId: string): void {
    this.service.buscarPorId(relatorioId).subscribe((relatorio) => {
      for (const item of relatorio.itens ?? []) {
        if (item.documentoGerado) this.documentosGerados.set(item.matriculaId, relatorioId);
      }
    });
  }

  baixarDocumentoGerado(matriculaId: string, formato: "docx" | "pdf"): void {
    const relatorioId = this.documentosGerados.get(matriculaId);
    if (!relatorioId) return;
    this.service.baixarDocumento(relatorioId, matriculaId, formato).subscribe((resp) => {
      const nome = extrairNomeArquivo(
        resp.headers.get("content-disposition"),
        `documento.${formato}`,
      );
      salvarBlobComoArquivo(resp.body as Blob, nome);
    });
  }

  verDetalhes(relatorio: RelatorioInadimplencia): void {
    this.service.buscarPorId(relatorio.id).subscribe((completo) => {
      this.dialog.open(RelatorioDetalheDialogComponent, {
        data: { relatorio: completo },
        width: "640px",
      });
    });
  }

  /** Baixa, um após o outro, todos os documentos já gerados deste relatório —
   * evita ter que abrir "Ver detalhes" e clicar item por item. */
  baixarTodos(relatorio: RelatorioInadimplencia, formato: "docx" | "pdf"): void {
    this.service.buscarPorId(relatorio.id).subscribe((completo) => {
      const itensComDocumento = (completo.itens ?? []).filter((item) => item.documentoGerado);

      if (itensComDocumento.length === 0) {
        this.snackBar.open("Nenhum documento gerado neste relatório ainda", "Fechar", {
          duration: 4000,
        });
        return;
      }

      itensComDocumento.forEach((item, indice) => {
        setTimeout(() => {
          this.service.baixarDocumento(completo.id, item.matriculaId, formato).subscribe((resp) => {
            const nome = extrairNomeArquivo(
              resp.headers.get("content-disposition"),
              `documento-${indice + 1}.${formato}`,
            );
            salvarBlobComoArquivo(resp.body as Blob, nome);
          });
        }, indice * 400);
      });
    });
  }
}
