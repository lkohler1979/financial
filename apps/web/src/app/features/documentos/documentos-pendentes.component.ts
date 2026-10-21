import { DatePipe } from "@angular/common";
import { Component, inject, OnInit } from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatDialog } from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSelectModule } from "@angular/material/select";
import { MatSnackBar } from "@angular/material/snack-bar";
import { debounceTime, distinctUntilChanged, merge } from "rxjs";
import {
  DocumentoListado,
  SituacaoDeferimentoDocumento,
  TipoDocumento,
} from "../../core/models/documento.model";
import { Curso } from "../../core/models/curso.model";
import { CursosService } from "../../core/services/cursos.service";
import { DocumentosService, FiltrosDocumentos } from "../../core/services/documentos.service";
import { DocumentoVisualizadorDialogComponent } from "../../shared/components/documento-visualizador-dialog.component";
import { formatarCpf } from "../../shared/utils/cpf.util";
import { salvarBlobComoArquivo } from "../../shared/utils/download.util";

const SITUACOES: { valor: SituacaoDeferimentoDocumento | ""; rotulo: string }[] = [
  { valor: "", rotulo: "Todos" },
  { valor: "PENDENTE", rotulo: "Pendentes" },
  { valor: "DEFERIDO", rotulo: "Deferidos" },
  { valor: "INDEFERIDO", rotulo: "Indeferidos" },
];

const CLASSE: Record<SituacaoDeferimentoDocumento, string> = {
  DEFERIDO: "bg-green-100 text-green-800",
  INDEFERIDO: "bg-red-100 text-red-800",
  PENDENTE: "bg-amber-100 text-amber-800",
};

/** Máximo de documentos por download em lote (o mesmo limite da API). */
const MAX_LOTE = 500;

/**
 * Documentos: consulta de todos os arquivos enviados (pelo aluno, pela equipe ou importados do
 * legado), com filtros por situação, tipo, curso, período e aluno. Cada linha abre o visualizador,
 * baixa o arquivo ou leva à matrícula; também dá para baixar vários de uma vez em um ZIP
 * (os marcados, ou todos os que casam com o filtro).
 */
@Component({
  selector: "app-documentos-pendentes",
  standalone: true,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSelectModule,
  ],
  template: `
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h1 class="text-2xl font-medium m-0">Documentos</h1>
      <div class="flex items-center gap-2 flex-wrap">
        @if (selecionados.size > 0) {
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="baixando"
            (click)="baixarSelecionados()"
          >
            <mat-icon>folder_zip</mat-icon> Baixar selecionados ({{ selecionados.size }})
          </button>
        }
        <button
          mat-stroked-button
          type="button"
          [disabled]="baixando || total === 0"
          [title]="
            total > maxLote
              ? 'São mais de ' + maxLote + ' documentos: refine o filtro para baixar'
              : 'Baixa em um ZIP todos os documentos que aparecem nesta consulta'
          "
          (click)="baixarTodosDoFiltro()"
        >
          <mat-icon>download</mat-icon> Baixar todos do filtro ({{ total }})
        </button>
        <button mat-stroked-button type="button" (click)="carregar()">
          <mat-icon>refresh</mat-icon> Atualizar
        </button>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2 mb-3">
      @for (s of situacoes; track s.valor) {
        <button
          type="button"
          class="px-3 py-1 rounded-full border text-sm"
          [class]="situacao === s.valor ? 'bg-blue-700 text-white border-blue-700' : 'bg-white'"
          (click)="filtrar(s.valor)"
        >
          {{ s.rotulo }}
          <span class="text-xs opacity-80">({{ contagem(s.valor) }})</span>
        </button>
      }
    </div>

    <div class="flex flex-wrap items-start gap-2 mb-3">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-72">
        <mat-label>Buscar por nome, CPF ou código</mat-label>
        <input matInput [formControl]="busca" />
        <mat-icon matSuffix>search</mat-icon>
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-56">
        <mat-label>Tipo de documento</mat-label>
        <mat-select [formControl]="tipoId">
          <mat-option value="">Todos</mat-option>
          @for (t of tipos; track t.id) {
            <mat-option [value]="t.id">{{ t.nome }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-72">
        <mat-label>Curso</mat-label>
        <mat-select [formControl]="cursoId">
          <mat-option value="">Todos</mat-option>
          @for (c of cursos; track c.id) {
            <mat-option [value]="c.id">{{ c.nome }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-40">
        <mat-label>Enviado de</mat-label>
        <input matInput type="date" [formControl]="de" />
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-40">
        <mat-label>Enviado até</mat-label>
        <input matInput type="date" [formControl]="ate" />
      </mat-form-field>

      @if (temFiltro()) {
        <button mat-button type="button" (click)="limparFiltros()">Limpar filtros</button>
      }
    </div>

    @if (carregando || baixando) {
      <mat-progress-bar mode="indeterminate"></mat-progress-bar>
    }

    <div class="bg-white rounded-lg border p-4 overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-gray-400">
            <th class="py-1 pr-2 w-10">
              <mat-checkbox
                aria-label="Selecionar todos desta página"
                [checked]="todosDaPaginaMarcados()"
                [indeterminate]="algunsDaPaginaMarcados()"
                (change)="marcarPagina($event.checked)"
              ></mat-checkbox>
            </th>
            <th class="pr-3">Cód. aluno</th>
            <th class="pr-3">Aluno</th>
            <th class="pr-3">CPF</th>
            <th class="pr-3">Matrícula</th>
            <th class="pr-3">Documento</th>
            <th class="pr-3">Situação</th>
            <th class="pr-3">Anexado em</th>
            <th class="text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          @for (d of documentos; track d.id) {
            <tr class="border-t align-top">
              <td class="py-1 pr-2">
                <mat-checkbox
                  [aria-label]="'Selecionar ' + d.tipo.nome + ' de ' + d.aluno.nome"
                  [checked]="selecionados.has(d.id)"
                  (change)="marcar(d.id, $event.checked)"
                ></mat-checkbox>
              </td>
              <td class="py-2 pr-3">{{ d.aluno.codigo || "—" }}</td>
              <td class="pr-3">{{ d.aluno.nome }}</td>
              <td class="pr-3 whitespace-nowrap">{{ formatarCpf(d.aluno.cpf) }}</td>
              <td class="pr-3">
                @for (m of matriculasDe(d); track m.id) {
                  <a class="block text-blue-700" [routerLink]="['/matriculas', m.id]">
                    {{ m.numeroMatricula || "s/ número" }}
                    <span class="text-xs text-gray-500">· {{ m.curso.nome }}</span>
                  </a>
                } @empty {
                  —
                }
              </td>
              <td class="pr-3">{{ d.tipo.nome }}</td>
              <td class="pr-3 whitespace-nowrap">
                <span class="px-2 py-0.5 rounded text-xs" [class]="classe(d)">
                  {{ rotulo(d) }}
                </span>
                @if (d.deferidoEm) {
                  <span class="block text-xs text-gray-500">
                    {{ d.deferidoEm | date: "dd/MM/yyyy" }}
                  </span>
                }
              </td>
              <td class="pr-3 whitespace-nowrap">{{ d.anexadoEm | date: "dd/MM/yyyy HH:mm" }}</td>
              <td class="text-right whitespace-nowrap">
                <button
                  mat-icon-button
                  type="button"
                  aria-label="Visualizar documento"
                  title="Visualizar"
                  (click)="visualizar(d)"
                >
                  <mat-icon>visibility</mat-icon>
                </button>
                <button
                  mat-icon-button
                  type="button"
                  aria-label="Baixar documento"
                  title="Baixar"
                  (click)="baixar(d)"
                >
                  <mat-icon>download</mat-icon>
                </button>
                @if (matriculaId(d); as id) {
                  <a mat-stroked-button [routerLink]="['/matriculas', id]">Conferir</a>
                }
              </td>
            </tr>
          } @empty {
            @if (!carregando) {
              <tr>
                <td colspan="9" class="py-4 text-gray-400">Nenhum documento encontrado.</td>
              </tr>
            }
          }
        </tbody>
      </table>
      <mat-paginator
        [length]="total"
        [pageIndex]="page - 1"
        [pageSize]="pageSize"
        [pageSizeOptions]="[20, 50, 100]"
        (page)="mudarPagina($event)"
      ></mat-paginator>
    </div>
  `,
})
export class DocumentosPendentesComponent implements OnInit {
  private readonly service = inject(DocumentosService);
  private readonly cursosService = inject(CursosService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly formatarCpf = formatarCpf;
  protected readonly maxLote = MAX_LOTE;

  readonly situacoes = SITUACOES;
  readonly busca = new FormControl("", { nonNullable: true });
  readonly tipoId = new FormControl("", { nonNullable: true });
  readonly cursoId = new FormControl("", { nonNullable: true });
  readonly de = new FormControl("", { nonNullable: true });
  readonly ate = new FormControl("", { nonNullable: true });

  tipos: TipoDocumento[] = [];
  cursos: Curso[] = [];
  documentos: DocumentoListado[] = [];
  totais: Record<SituacaoDeferimentoDocumento, number> = {
    PENDENTE: 0,
    DEFERIDO: 0,
    INDEFERIDO: 0,
  };
  situacao: SituacaoDeferimentoDocumento | "" = "";
  total = 0;
  page = 1;
  pageSize = 20;
  carregando = false;
  baixando = false;
  /** Documentos marcados para o ZIP (mantidos ao trocar de página). */
  readonly selecionados = new Set<string>();

  ngOnInit(): void {
    this.service.listarTipos().subscribe((tipos) => (this.tipos = tipos));
    this.cursosService.listar({ pageSize: 100 }).subscribe((r) => (this.cursos = r.data));

    this.busca.valueChanges.pipe(debounceTime(400), distinctUntilChanged()).subscribe(() => {
      this.refiltrar();
    });
    merge(
      this.tipoId.valueChanges,
      this.cursoId.valueChanges,
      this.de.valueChanges,
      this.ate.valueChanges,
    )
      .pipe(debounceTime(200))
      .subscribe(() => this.refiltrar());
    this.carregar();
  }

  /** Os filtros atuais (os mesmos da lista valem para o download "todos do filtro"). */
  private filtros(): FiltrosDocumentos {
    return {
      situacao: this.situacao,
      busca: this.busca.value,
      tipoId: this.tipoId.value,
      cursoId: this.cursoId.value,
      de: this.de.value,
      ate: this.ate.value,
    };
  }

  private refiltrar(): void {
    this.page = 1;
    this.selecionados.clear();
    this.carregar();
  }

  temFiltro(): boolean {
    return Boolean(
      this.busca.value ||
      this.tipoId.value ||
      this.cursoId.value ||
      this.de.value ||
      this.ate.value ||
      this.situacao,
    );
  }

  limparFiltros(): void {
    this.busca.setValue("", { emitEvent: false });
    this.tipoId.setValue("", { emitEvent: false });
    this.cursoId.setValue("", { emitEvent: false });
    this.de.setValue("", { emitEvent: false });
    this.ate.setValue("", { emitEvent: false });
    this.situacao = "";
    this.refiltrar();
  }

  carregar(): void {
    this.carregando = true;
    this.service.listar({ ...this.filtros(), page: this.page, pageSize: this.pageSize }).subscribe({
      next: (pagina) => {
        this.documentos = pagina.data;
        this.total = pagina.total;
        this.totais = pagina.totais;
        this.carregando = false;
      },
      error: () => (this.carregando = false),
    });
  }

  filtrar(situacao: SituacaoDeferimentoDocumento | ""): void {
    this.situacao = situacao;
    this.refiltrar();
  }

  mudarPagina(evento: PageEvent): void {
    this.page = evento.pageIndex + 1;
    this.pageSize = evento.pageSize;
    this.carregar();
  }

  contagem(situacao: SituacaoDeferimentoDocumento | ""): number {
    return situacao
      ? this.totais[situacao]
      : this.totais.PENDENTE + this.totais.DEFERIDO + this.totais.INDEFERIDO;
  }

  // ---- seleção e download em lote

  marcar(id: string, marcado: boolean): void {
    if (marcado) this.selecionados.add(id);
    else this.selecionados.delete(id);
  }

  marcarPagina(marcado: boolean): void {
    for (const d of this.documentos) this.marcar(d.id, marcado);
  }

  todosDaPaginaMarcados(): boolean {
    return this.documentos.length > 0 && this.documentos.every((d) => this.selecionados.has(d.id));
  }

  algunsDaPaginaMarcados(): boolean {
    return (
      !this.todosDaPaginaMarcados() && this.documentos.some((d) => this.selecionados.has(d.id))
    );
  }

  baixarSelecionados(): void {
    this.baixarLote({ ids: [...this.selecionados] });
  }

  baixarTodosDoFiltro(): void {
    if (this.total > MAX_LOTE) {
      this.snackBar.open(
        `São ${this.total} documentos; o download em lote aceita até ${MAX_LOTE}. Refine o filtro (curso, tipo ou período).`,
        "Fechar",
        { duration: 7000 },
      );
      return;
    }
    this.baixarLote({ filtros: this.filtros() });
  }

  private baixarLote(selecao: { ids?: string[]; filtros?: FiltrosDocumentos }): void {
    this.baixando = true;
    this.service.baixarLote(selecao).subscribe({
      next: (resposta) => {
        this.baixando = false;
        const nome = /filename="?([^";]+)"?/.exec(
          resposta.headers.get("Content-Disposition") ?? "",
        )?.[1];
        salvarBlobComoArquivo(resposta.body as Blob, nome ?? "documentos.zip");
        const ausentes = Number(resposta.headers.get("X-Documentos-Ausentes") ?? 0);
        if (ausentes > 0) {
          this.snackBar.open(
            `${ausentes} arquivo(s) não estavam no servidor — veja _arquivos-nao-encontrados.txt no ZIP.`,
            "Fechar",
            { duration: 8000 },
          );
        }
      },
      // A mensagem do erro (lote grande demais, nada encontrado…) é exibida pelo interceptor.
      error: () => (this.baixando = false),
    });
  }

  // ---- linha

  classe(d: DocumentoListado): string {
    return CLASSE[d.situacaoDeferimento];
  }

  rotulo(d: DocumentoListado): string {
    return { DEFERIDO: "Deferido", INDEFERIDO: "Indeferido", PENDENTE: "Pendente" }[
      d.situacaoDeferimento
    ];
  }

  /** Documento de matrícula mostra a própria; o de aluno vale para todas as matrículas dele. */
  matriculasDe(d: DocumentoListado) {
    return d.matricula
      ? d.aluno.matriculas.filter((m) => m.id === d.matricula!.id)
      : d.aluno.matriculas;
  }

  /** "Conferir" abre a matrícula do documento, ou a mais recente do aluno. */
  matriculaId(d: DocumentoListado): string | undefined {
    return (d.matricula ?? d.aluno.matriculas[0])?.id;
  }

  visualizar(d: DocumentoListado): void {
    this.dialog.open(DocumentoVisualizadorDialogComponent, {
      width: "900px",
      maxWidth: "95vw",
      data: { id: d.id, nome: d.arquivoNome ?? "documento", mime: d.arquivoMime },
    });
  }

  baixar(d: DocumentoListado): void {
    this.service
      .baixar(d.id)
      .subscribe((blob) => salvarBlobComoArquivo(blob, d.arquivoNome ?? "documento"));
  }
}
