import { Component, inject, OnInit } from "@angular/core";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatChipsModule } from "@angular/material/chips";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatAutocompleteModule } from "@angular/material/autocomplete";
import { MatSelectModule } from "@angular/material/select";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSnackBar } from "@angular/material/snack-bar";
import { debounceTime, switchMap } from "rxjs";
import { MatriculasService } from "../../core/services/matriculas.service";
import { AlunosService } from "../../core/services/alunos.service";
import { CursosService } from "../../core/services/cursos.service";
import { CobrancaService } from "../../core/services/cobranca.service";
import { MatriculaPayload } from "../../core/models/matricula.model";
import { Aluno } from "../../core/models/aluno.model";
import { Curso } from "../../core/models/curso.model";
import { SituacaoCobranca, Tag } from "../../core/models/cobranca.model";
import { formatarCpf } from "../../shared/utils/cpf.util";

const SITUACOES = ["ATIVA", "TRANCADA", "CANCELADA", "CONCLUIDA"];

@Component({
  selector: "app-matricula-form",
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatChipsModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatProgressBarModule,
  ],
  template: `
    <div class="flex items-center gap-2 mb-4">
      <a mat-icon-button routerLink="/matriculas" aria-label="Voltar">
        <mat-icon>arrow_back</mat-icon>
      </a>
      <h1 class="text-2xl font-medium m-0">
        {{ editando ? "Editar matrícula" : "Nova matrícula" }}
      </h1>
    </div>

    @if (carregando) {
      <mat-progress-bar mode="indeterminate"></mat-progress-bar>
    }

    <form [formGroup]="form" (ngSubmit)="salvar()" class="bg-white rounded shadow-sm p-6 max-w-3xl">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4">
        <mat-form-field appearance="outline">
          <mat-label>Aluno</mat-label>
          <input
            matInput
            formControlName="aluno"
            [matAutocomplete]="autoAluno"
            placeholder="Buscar por nome ou CPF"
          />
          <mat-autocomplete #autoAluno="matAutocomplete" [displayWith]="exibirAluno">
            @for (a of alunos; track a.id) {
              <mat-option [value]="a">{{ a.nome }} — {{ formatarCpf(a.cpf) }}</mat-option>
            }
          </mat-autocomplete>
          @if (form.controls.aluno.hasError("required") || form.controls.aluno.hasError("obj")) {
            <mat-error>Selecione um aluno da lista</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Curso</mat-label>
          <input
            matInput
            formControlName="curso"
            [matAutocomplete]="autoCurso"
            placeholder="Buscar por nome ou código"
          />
          <mat-autocomplete #autoCurso="matAutocomplete" [displayWith]="exibirCurso">
            @for (c of cursos; track c.id) {
              <mat-option [value]="c">{{ c.codigo }} — {{ c.nome }}</mat-option>
            }
          </mat-autocomplete>
          @if (form.controls.curso.hasError("required") || form.controls.curso.hasError("obj")) {
            <mat-error>Selecione um curso da lista</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Número da matrícula</mat-label>
          <input matInput formControlName="numeroMatricula" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Data da matrícula</mat-label>
          <input matInput type="date" formControlName="dataMatricula" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Situação</mat-label>
          <mat-select formControlName="situacao">
            @for (s of situacoes; track s) {
              <mat-option [value]="s">{{ s }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <div class="flex items-center">
          <mat-slide-toggle formControlName="contratoAssinado">Contrato assinado</mat-slide-toggle>
        </div>

        <div class="flex items-center">
          <mat-slide-toggle formControlName="tcdAssinado">TCD assinado</mat-slide-toggle>
        </div>
      </div>

      <mat-form-field appearance="outline" class="w-full">
        <mat-label>Observações</mat-label>
        <textarea matInput formControlName="observacoes" rows="3"></textarea>
      </mat-form-field>

      @if (editando) {
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4 mt-2">
          <div>
            <p class="text-xs font-medium text-gray-600 mb-2">Situação de cobrança</p>
            <mat-form-field appearance="outline" class="w-full">
              <mat-select
                [formControl]="situacaoCobrancaControl"
                (selectionChange)="mudarSituacaoCobranca($event.value)"
              >
                @for (situacao of situacoesCobranca; track situacao.id) {
                  <mat-option [value]="situacao.id">{{ situacao.nome }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>

          <div>
            <p class="text-xs font-medium text-gray-600 mb-2">Tags (para busca posterior)</p>
            <div class="flex gap-2 flex-wrap items-center">
              <mat-chip-set>
                @for (tag of tagsAtuais; track tag.id) {
                  <mat-chip [removable]="true" (removed)="removerTag(tag)">
                    {{ tag.nome }}
                    <mat-icon matChipRemove aria-label="Remover tag">cancel</mat-icon>
                  </mat-chip>
                }
              </mat-chip-set>
              <mat-form-field appearance="outline" class="!w-48 !text-xs" subscriptSizing="dynamic">
                <input
                  matInput
                  [formControl]="novaTagControl"
                  [matAutocomplete]="autoTag"
                  placeholder="Digite e Enter"
                  (keydown.enter)="$event.preventDefault(); confirmarNovaTag()"
                />
                <mat-autocomplete #autoTag="matAutocomplete" (optionSelected)="confirmarNovaTag()">
                  @for (tag of tagsFiltradas(); track tag.id) {
                    <mat-option [value]="tag.nome">{{ tag.nome }}</mat-option>
                  }
                </mat-autocomplete>
              </mat-form-field>
            </div>
          </div>
        </div>
      }

      <div class="flex justify-end gap-2 mt-2">
        <a mat-button routerLink="/matriculas">Cancelar</a>
        <button mat-raised-button color="primary" type="submit" [disabled]="salvando">
          Salvar
        </button>
      </div>
    </form>
  `,
})
export class MatriculaFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(MatriculasService);
  private readonly alunosService = inject(AlunosService);
  private readonly cursosService = inject(CursosService);
  private readonly cobrancaService = inject(CobrancaService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly formatarCpf = formatarCpf;
  readonly situacoes = SITUACOES;

  editando = false;
  carregando = false;
  salvando = false;
  private id: string | null = null;

  alunos: Aluno[] = [];
  cursos: Curso[] = [];

  situacoesCobranca: SituacaoCobranca[] = [];
  todasTags: Tag[] = [];
  tagsAtuais: Tag[] = [];
  readonly situacaoCobrancaControl = new FormControl<string | undefined>(undefined);
  readonly novaTagControl = new FormControl("", { nonNullable: true });

  readonly form = this.fb.group({
    aluno: this.fb.control<Aluno | string | null>(null, [Validators.required, objetoValidator]),
    curso: this.fb.control<Curso | string | null>(null, [Validators.required, objetoValidator]),
    numeroMatricula: [""],
    dataMatricula: [""],
    situacao: ["ATIVA"],
    contratoAssinado: [false],
    tcdAssinado: [false],
    observacoes: [""],
  });

  ngOnInit(): void {
    this.form.controls.aluno.valueChanges
      .pipe(
        debounceTime(300),
        switchMap((valor) =>
          this.alunosService.listar({
            busca: typeof valor === "string" ? valor : undefined,
            pageSize: 10,
          }),
        ),
      )
      .subscribe((res) => (this.alunos = res.data));

    this.form.controls.curso.valueChanges
      .pipe(
        debounceTime(300),
        switchMap((valor) =>
          this.cursosService.listar({
            busca: typeof valor === "string" ? valor : undefined,
            pageSize: 10,
          }),
        ),
      )
      .subscribe((res) => (this.cursos = res.data));

    this.id = this.route.snapshot.paramMap.get("id");
    this.editando = !!this.id;

    if (this.editando && this.id) {
      this.carregando = true;
      this.service.buscarPorId(this.id).subscribe({
        next: (m) => {
          this.form.patchValue({
            aluno: m.aluno
              ? ({ id: m.alunoId, cpf: m.aluno.cpf, nome: m.aluno.nome } as Aluno)
              : null,
            curso: m.curso
              ? ({ id: m.cursoId, codigo: m.curso.codigo, nome: m.curso.nome } as Curso)
              : null,
            numeroMatricula: m.numeroMatricula ?? "",
            dataMatricula: m.dataMatricula ? m.dataMatricula.substring(0, 10) : "",
            situacao: m.situacao,
            contratoAssinado: m.contratoAssinado,
            tcdAssinado: m.tcdAssinado,
            observacoes: m.observacoes ?? "",
          });
          this.carregando = false;
        },
        error: () => (this.carregando = false),
      });

      this.cobrancaService.listarSituacoes(true).subscribe((res) => (this.situacoesCobranca = res));
      this.cobrancaService.listarTags().subscribe((res) => (this.todasTags = res));
      this.carregarFichaCobranca();
    }
  }

  private carregarFichaCobranca(): void {
    if (!this.id) return;
    this.cobrancaService.obterFicha(this.id).subscribe((ficha) => {
      this.situacaoCobrancaControl.setValue(ficha.matricula.situacaoCobrancaId ?? undefined, {
        emitEvent: false,
      });
      this.tagsAtuais = ficha.tags;
    });
  }

  mudarSituacaoCobranca(situacaoCobrancaId: string): void {
    if (!this.id) return;
    this.cobrancaService.mudarSituacao(this.id, situacaoCobrancaId).subscribe();
  }

  tagsFiltradas(): Tag[] {
    const idsAtuais = new Set(this.tagsAtuais.map((t) => t.id));
    const termo = this.novaTagControl.value.trim().toLowerCase();
    return this.todasTags.filter(
      (t) => !idsAtuais.has(t.id) && (!termo || t.nome.toLowerCase().includes(termo)),
    );
  }

  /** Adiciona a TAG digitada — reaproveita se já existir (por nome, sem
   * diferenciar caixa) ou cria uma nova antes de associar (pedido do
   * usuário: TAG de texto livre, para busca posterior). */
  confirmarNovaTag(): void {
    if (!this.id) return;
    const nome = this.novaTagControl.value.trim();
    if (!nome) return;
    this.novaTagControl.setValue("");

    const existente = this.todasTags.find((t) => t.nome.toLowerCase() === nome.toLowerCase());
    if (existente) {
      this.adicionarTag(existente.id);
      return;
    }

    this.cobrancaService.criarTag(nome).subscribe({
      next: (tag) => {
        this.todasTags = [...this.todasTags, tag];
        this.adicionarTag(tag.id);
      },
      error: () => {
        this.cobrancaService.listarTags().subscribe((tags) => {
          this.todasTags = tags;
          const achada = tags.find((t) => t.nome.toLowerCase() === nome.toLowerCase());
          if (achada) this.adicionarTag(achada.id);
          else this.snackBar.open("Não foi possível adicionar a TAG", "Fechar", { duration: 3000 });
        });
      },
    });
  }

  private adicionarTag(tagId: string): void {
    if (!this.id) return;
    this.cobrancaService.adicionarTag(this.id, tagId).subscribe(() => this.carregarFichaCobranca());
  }

  removerTag(tag: Tag): void {
    if (!this.id) return;
    this.cobrancaService
      .removerTag(this.id, tag.id)
      .subscribe(() => this.carregarFichaCobranca());
  }

  exibirAluno(aluno: Aluno | string | null): string {
    return aluno && typeof aluno !== "string" ? aluno.nome : "";
  }

  exibirCurso(curso: Curso | string | null): string {
    return curso && typeof curso !== "string" ? `${curso.codigo} — ${curso.nome}` : "";
  }

  salvar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const bruto = this.form.getRawValue();
    const aluno = bruto.aluno as Aluno;
    const curso = bruto.curso as Curso;

    const payload: MatriculaPayload = {
      alunoId: aluno.id,
      cursoId: curso.id,
      numeroMatricula: bruto.numeroMatricula || undefined,
      dataMatricula: bruto.dataMatricula || undefined,
      situacao: bruto.situacao || undefined,
      contratoAssinado: bruto.contratoAssinado ?? false,
      tcdAssinado: bruto.tcdAssinado ?? false,
      observacoes: bruto.observacoes || undefined,
    };

    this.salvando = true;
    const requisicao =
      this.editando && this.id
        ? this.service.atualizar(this.id, payload)
        : this.service.criar(payload);

    requisicao.subscribe({
      next: () => {
        this.snackBar.open("Matrícula salva", "Fechar", { duration: 3000 });
        this.router.navigate(["/matriculas"]);
      },
      error: () => (this.salvando = false),
    });
  }
}

// Garante que o valor selecionado é um objeto (aluno/curso), não texto livre.
function objetoValidator(control: { value: unknown }) {
  const v = control.value;
  if (v === null || v === undefined || v === "") return null;
  return typeof v === "object" ? null : { obj: true };
}
