import { Component, inject, OnInit } from "@angular/core";
import { DatePipe, NgClass } from "@angular/common";
import { RouterLink } from "@angular/router";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { MatTableModule } from "@angular/material/table";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSelectModule } from "@angular/material/select";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { debounceTime, distinctUntilChanged } from "rxjs";
import { MatriculasService } from "../../core/services/matriculas.service";
import {
  classeSituacaoMatricula,
  Matricula,
  rotuloSituacaoMatricula,
  SITUACOES_DOCUMENTACAO,
  SituacaoMatriculaOpcao,
} from "../../core/models/matricula.model";
import { formatarCpf } from "../../shared/utils/cpf.util";
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

@Component({
  selector: "app-matriculas-list",
  standalone: true,
  imports: [
    DatePipe,
    NgClass,
    RouterLink,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSelectModule,
    MatDialogModule,
  ],
  template: `
    <div class="flex items-center justify-between mb-4">
      <h1 class="ef-title">Matrículas</h1>
      <div class="flex items-center gap-2 flex-wrap">
        @if (authService.temPerfil("ADMINISTRADOR", "FINANCEIRO")) {
          @if (selecionadas.size > 0) {
            <button
              mat-flat-button
              color="primary"
              type="button"
              title="Busca no sistema legado os documentos dos alunos das matrículas marcadas"
              (click)="buscarDocumentosEmLote(true)"
            >
              <mat-icon>cloud_download</mat-icon> Buscar documentos no legado ({{
                selecionadas.size
              }}
              marcadas)
            </button>
          }
          <button
            mat-stroked-button
            type="button"
            [disabled]="total === 0"
            title="Busca no sistema legado os documentos dos alunos de todas as matrículas desta consulta"
            (click)="buscarDocumentosEmLote(false)"
          >
            <mat-icon>cloud_download</mat-icon> Buscar documentos de todas do filtro ({{ total }})
          </button>
        }
        <a mat-raised-button color="primary" routerLink="/matriculas/cadastro">
          <mat-icon>add</mat-icon> Nova matrícula
        </a>
      </div>
    </div>

    <form
      [formGroup]="filtros"
      class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 items-start mb-3"
    >
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Nome do aluno</mat-label>
        <input matInput formControlName="alunoNome" />
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>CPF</mat-label>
        <input matInput formControlName="alunoCpf" />
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Situação</mat-label>
        <mat-select formControlName="situacao">
          <mat-option [value]="undefined">Todas</mat-option>
          @for (s of situacoesMatricula; track s.codigo) {
            <mat-option [value]="s.codigo">{{ s.nome }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
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

    @if (carregando) {
      <mat-progress-bar mode="indeterminate"></mat-progress-bar>
    }

    <div class="ef-card overflow-x-auto mt-2 w-full">
      <table mat-table [dataSource]="matriculas" class="w-full table-compact">
        <ng-container matColumnDef="selecionar">
          <th mat-header-cell *matHeaderCellDef class="w-10">
            <mat-checkbox
              aria-label="Selecionar todas desta página"
              [checked]="todasDaPaginaMarcadas()"
              [indeterminate]="algumasDaPaginaMarcadas()"
              (change)="marcarPagina($event.checked)"
            ></mat-checkbox>
          </th>
          <td mat-cell *matCellDef="let m">
            <mat-checkbox
              [aria-label]="'Selecionar a matrícula de ' + (m.aluno?.nome || 'aluno')"
              [checked]="selecionadas.has(m.id)"
              (change)="marcar(m.id, $event.checked)"
            ></mat-checkbox>
          </td>
        </ng-container>
        <ng-container matColumnDef="aluno">
          <th mat-header-cell *matHeaderCellDef>Aluno</th>
          <td mat-cell *matCellDef="let m">
            {{ m.aluno?.nome || m.alunoId }}
            @if (m.aluno?.codigo) {
              <span class="text-xs text-gray-400 block">Cód. {{ m.aluno?.codigo }}</span>
            }
          </td>
        </ng-container>
        <ng-container matColumnDef="cpf">
          <th mat-header-cell *matHeaderCellDef>CPF</th>
          <td mat-cell *matCellDef="let m" class="whitespace-nowrap">
            {{ m.aluno?.cpf ? formatarCpf(m.aluno.cpf) : "—" }}
          </td>
        </ng-container>
        <ng-container matColumnDef="celular">
          <th mat-header-cell *matHeaderCellDef>Celular</th>
          <td mat-cell *matCellDef="let m" class="whitespace-nowrap">
            {{ m.aluno?.telefone1 || m.aluno?.telefone2 || "—" }}
          </td>
        </ng-container>
        <ng-container matColumnDef="email">
          <th mat-header-cell *matHeaderCellDef>E-mail</th>
          <td mat-cell *matCellDef="let m">{{ m.aluno?.email || "—" }}</td>
        </ng-container>
        <ng-container matColumnDef="curso">
          <th mat-header-cell *matHeaderCellDef>Curso</th>
          <td mat-cell *matCellDef="let m">{{ m.curso?.nome || m.cursoId }}</td>
        </ng-container>
        <ng-container matColumnDef="numero">
          <th mat-header-cell *matHeaderCellDef>Matrícula</th>
          <td mat-cell *matCellDef="let m">{{ m.numeroMatricula || "—" }}</td>
        </ng-container>
        <ng-container matColumnDef="data">
          <th mat-header-cell *matHeaderCellDef>Data</th>
          <td mat-cell *matCellDef="let m">
            {{ m.dataMatricula ? (m.dataMatricula | date: "dd/MM/yyyy") : "—" }}
          </td>
        </ng-container>
        <ng-container matColumnDef="situacao">
          <th mat-header-cell *matHeaderCellDef>Situação</th>
          <td mat-cell *matCellDef="let m">
            <span
              class="px-2 py-0.5 rounded text-xs whitespace-nowrap"
              [class]="classeSituacao(m.situacao)"
              >{{ rotuloSituacao(m.situacao) }}</span
            >
          </td>
        </ng-container>
        <ng-container matColumnDef="documentacao">
          <th mat-header-cell *matHeaderCellDef>Documentação</th>
          <td mat-cell *matCellDef="let m">
            <button
              type="button"
              class="px-2 py-0.5 rounded text-xs whitespace-nowrap cursor-pointer border-0"
              [class]="situacaoDocumentacao(m).classe"
              title="Ver os documentos desta matrícula"
              (click)="abrirDocumentos(m)"
            >
              {{ situacaoDocumentacao(m).rotulo }}
            </button>
          </td>
        </ng-container>
        <ng-container matColumnDef="parcelas">
          <th mat-header-cell *matHeaderCellDef>Parcelas</th>
          <td mat-cell *matCellDef="let m" class="whitespace-nowrap">
            <div class="flex gap-1 flex-wrap">
              @for (badge of badgesParcelas(m); track badge.label) {
                <span class="px-2 py-0.5 rounded text-xs" [ngClass]="badge.classe">{{
                  badge.label
                }}</span>
              }
              @if (badgesParcelas(m).length === 0) {
                <span class="text-gray-400 text-xs">—</span>
              }
            </div>
          </td>
        </ng-container>
        <ng-container matColumnDef="acoes">
          <th mat-header-cell *matHeaderCellDef class="text-right">Ações</th>
          <td mat-cell *matCellDef="let m" class="text-right whitespace-nowrap">
            <a
              mat-icon-button
              [routerLink]="['/cobranca/matriculas', m.id]"
              aria-label="Ficha de cobrança"
            >
              <mat-icon>receipt_long</mat-icon>
            </a>
            <button
              mat-icon-button
              type="button"
              aria-label="Documentos da matrícula"
              title="Ver os documentos (visualizar e baixar)"
              (click)="abrirDocumentos(m)"
            >
              <mat-icon>folder_open</mat-icon>
            </button>
            @if (authService.temPerfil("ADMINISTRADOR", "FINANCEIRO")) {
              <button
                mat-icon-button
                type="button"
                aria-label="Contrato de prestação de serviços"
                title="Gerar, visualizar e enviar o contrato para assinatura"
                (click)="abrirContrato(m)"
              >
                <mat-icon [class.text-green-600]="m.contratoAssinado">draw</mat-icon>
              </button>
              <button
                mat-icon-button
                type="button"
                aria-label="Buscar documentos no legado"
                title="Buscar os documentos do aluno no sistema legado e baixar os arquivos"
                (click)="buscarDocumentosLegado(m)"
              >
                <mat-icon>cloud_download</mat-icon>
              </button>
            }
            <a mat-icon-button [routerLink]="['/matriculas', m.id]" aria-label="Editar">
              <mat-icon>edit</mat-icon>
            </a>
            <button mat-icon-button color="warn" (click)="remover(m)" aria-label="Remover">
              <mat-icon>delete</mat-icon>
            </button>
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="colunas"></tr>
        <tr mat-row *matRowDef="let row; columns: colunas"></tr>
      </table>

      @if (!carregando && matriculas.length === 0) {
        <p class="p-6 text-center text-gray-500">Nenhuma matrícula encontrada.</p>
      }

      <mat-paginator
        [length]="total"
        [pageSize]="pageSize"
        [pageIndex]="page - 1"
        [pageSizeOptions]="[20, 50, 100]"
        (page)="mudarPagina($event)"
      ></mat-paginator>
    </div>
  `,
})
export class MatriculasListComponent implements OnInit {
  private readonly service = inject(MatriculasService);
  private readonly cobrancaService = inject(CobrancaService);
  private readonly dialog = inject(MatDialog);
  readonly authService = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly filtros = this.fb.nonNullable.group({
    alunoNome: this.fb.control<string | undefined>(undefined),
    alunoCpf: this.fb.control<string | undefined>(undefined),
    situacao: this.fb.control<string | undefined>(undefined),
    situacaoCobrancaId: this.fb.control<string | undefined>(undefined),
    tagId: this.fb.control<string | undefined>(undefined),
    contratoAssinado: this.fb.control<boolean | undefined>(undefined),
    tcdAssinado: this.fb.control<boolean | undefined>(undefined),
    situacaoDocumentacao: this.fb.control<string | undefined>(undefined),
    dataMatriculaInicio: this.fb.control<string | undefined>(undefined),
    dataMatriculaFim: this.fb.control<string | undefined>(undefined),
  });

  colunas = [
    "selecionar",
    "aluno",
    "cpf",
    "celular",
    "email",
    "curso",
    "numero",
    "data",
    "situacao",
    "documentacao",
    "parcelas",
    "acoes",
  ];
  situacoesMatricula: SituacaoMatriculaOpcao[] = [];
  protected readonly situacoesDocumentacao = SITUACOES_DOCUMENTACAO;
  protected readonly formatarCpf = formatarCpf;
  protected readonly rotuloSituacao = rotuloSituacaoMatricula;
  protected readonly classeSituacao = classeSituacaoMatricula;
  matriculas: Matricula[] = [];
  situacoesCobranca: SituacaoCobranca[] = [];
  tags: Tag[] = [];
  total = 0;
  page = 1;
  pageSize = 20;
  carregando = false;

  ngOnInit(): void {
    this.service.situacoes().subscribe((res) => (this.situacoesMatricula = res));
    this.cobrancaService.listarSituacoes(true).subscribe((res) => (this.situacoesCobranca = res));
    this.cobrancaService.listarTags().subscribe((res) => (this.tags = res));
    this.carregar();
    this.filtros.valueChanges.pipe(debounceTime(400), distinctUntilChanged()).subscribe(() => {
      this.page = 1;
      this.selecionadas.clear();
      this.carregar();
    });
  }

  carregar(): void {
    this.carregando = true;
    const valores = this.filtros.getRawValue();
    this.service
      .listar({
        alunoNome: valores.alunoNome || undefined,
        alunoCpf: valores.alunoCpf || undefined,
        situacao: valores.situacao || undefined,
        situacaoCobrancaId: valores.situacaoCobrancaId || undefined,
        tagId: valores.tagId || undefined,
        contratoAssinado: valores.contratoAssinado ?? undefined,
        tcdAssinado: valores.tcdAssinado ?? undefined,
        situacaoDocumentacao: valores.situacaoDocumentacao || undefined,
        dataMatriculaInicio: valores.dataMatriculaInicio || undefined,
        dataMatriculaFim: valores.dataMatriculaFim || undefined,
        page: this.page,
        pageSize: this.pageSize,
      })
      .subscribe({
        next: (res) => {
          this.matriculas = res.data;
          this.total = res.total;
          this.carregando = false;
        },
        error: () => (this.carregando = false),
      });
  }

  /** Contagem de parcelas por situação, para os badges do grid (item 4 do PENDENCIAS.md). */
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
    for (const m of this.matriculas) this.marcar(m.id, marcada);
  }

  todasDaPaginaMarcadas(): boolean {
    return this.matriculas.length > 0 && this.matriculas.every((m) => this.selecionadas.has(m.id));
  }

  algumasDaPaginaMarcadas(): boolean {
    return (
      !this.todasDaPaginaMarcadas() && this.matriculas.some((m) => this.selecionadas.has(m.id))
    );
  }

  /** Abre a busca em lote: das matrículas marcadas, ou de todas as que casam com o filtro atual. */
  buscarDocumentosEmLote(marcadas: boolean): void {
    const v = this.filtros.getRawValue();
    const dados: DadosDocumentosLegadoLote = marcadas
      ? {
          matriculaIds: [...this.selecionadas],
          quantidade: this.selecionadas.size,
          origem: "marcadas",
        }
      : {
          filtros: {
            alunoNome: v.alunoNome || undefined,
            alunoCpf: v.alunoCpf || undefined,
            situacao: v.situacao || undefined,
            situacaoCobrancaId: v.situacaoCobrancaId || undefined,
            tagId: v.tagId || undefined,
            contratoAssinado: v.contratoAssinado ?? undefined,
            tcdAssinado: v.tcdAssinado ?? undefined,
            situacaoDocumentacao: v.situacaoDocumentacao || undefined,
            dataMatriculaInicio: v.dataMatriculaInicio || undefined,
            dataMatriculaFim: v.dataMatriculaFim || undefined,
          },
          quantidade: this.total,
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

  mudarPagina(evento: PageEvent): void {
    this.page = evento.pageIndex + 1;
    this.pageSize = evento.pageSize;
    this.carregar();
  }

  remover(matricula: Matricula): void {
    const data: ConfirmDialogData = {
      titulo: "Remover matrícula",
      mensagem: `Deseja remover a matrícula de "${matricula.aluno?.nome ?? "aluno"}"?`,
      confirmarTexto: "Remover",
    };
    this.dialog
      .open(ConfirmDialogComponent, { data, width: "420px" })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.service.remover(matricula.id).subscribe(() => {
          this.snackBar.open("Matrícula removida", "Fechar", { duration: 3000 });
          this.carregar();
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
      .subscribe(() => this.carregar());
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
