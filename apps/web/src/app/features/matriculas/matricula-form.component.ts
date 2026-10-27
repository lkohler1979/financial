import { DatePipe } from "@angular/common";
import { Component, inject, OnInit, signal } from "@angular/core";
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
import { AuthService } from "../../core/auth/auth.service";
import { DocumentosMatriculaComponent } from "./documentos-matricula.component";
import { SituacaoMatriculaComponent } from "./situacao-matricula.component";
import { SacadoMatriculaComponent } from "./sacado-matricula.component";
import { SacadoPayload } from "../../core/models/sacado.model";
import { AlunosService } from "../../core/services/alunos.service";
import { CursosService } from "../../core/services/cursos.service";
import { CobrancaService } from "../../core/services/cobranca.service";
import {
  AgenteEducacional,
  Matricula,
  MatriculaPayload,
  pillSituacaoMatricula,
  rotuloSituacaoMatricula,
} from "../../core/models/matricula.model";
import { Aluno } from "../../core/models/aluno.model";
import { Curso } from "../../core/models/curso.model";
import { SituacaoCobranca, Tag } from "../../core/models/cobranca.model";
import { formatarCnpj, formatarCpf } from "../../shared/utils/cpf.util";
import { iniciaisDe } from "../../shared/utils/iniciais";

type Aba = "dados" | "situacao" | "documentos";

@Component({
  selector: "app-matricula-form",
  standalone: true,
  imports: [
    RouterLink,
    DatePipe,
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
    DocumentosMatriculaComponent,
    SituacaoMatriculaComponent,
    SacadoMatriculaComponent,
  ],
  template: `
    <div class="ef-page">
      <a
        routerLink="/matriculas"
        class="mb-3 inline-flex items-center gap-2 text-sm font-medium text-brand-700 no-underline hover:underline"
      >
        <mat-icon class="!h-5 !w-5 !text-[20px]">arrow_back</mat-icon> Voltar para matrículas
      </a>

      <div class="ef-page-header !mb-2">
        <div>
          <h1 class="ef-title">{{ editando ? "Cadastro da matrícula" : "Nova matrícula" }}</h1>
          <p class="ef-subtitle">
            {{
              editando
                ? "Mantenha os dados, a cobrança e os documentos da matrícula."
                : "Escolha o aluno e o curso e, se quiser, já configure a cobrança."
            }}
          </p>
        </div>
        @if (matricula()?.numeroMatricula; as numero) {
          <span class="rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-muted">
            Matrícula <strong class="ml-1 text-ink">{{ numero }}</strong>
          </span>
        }
      </div>

      @if (editando) {
        <div class="ef-tabs mb-5 !px-0" role="tablist">
          <button
            type="button"
            role="tab"
            class="ef-tab"
            [attr.aria-selected]="aba() === 'dados'"
            (click)="aba.set('dados')"
          >
            Dados da matrícula
          </button>
          <button
            type="button"
            role="tab"
            class="ef-tab"
            [attr.aria-selected]="aba() === 'situacao'"
            (click)="aba.set('situacao')"
          >
            Situação
          </button>
          <button
            type="button"
            role="tab"
            class="ef-tab"
            [attr.aria-selected]="aba() === 'documentos'"
            (click)="aba.set('documentos')"
          >
            Documentos
          </button>
        </div>
      }

      @if (carregando) {
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      }

      <!-- ===== Dados da matrícula ===== -->
      <div
        [class.hidden]="aba() !== 'dados'"
        [class]="
          editando ? 'grid items-start gap-5 lg:grid-cols-[1fr_320px]' : 'grid items-start gap-5'
        "
      >
        <form
          [formGroup]="form"
          (ngSubmit)="salvar()"
          class="ef-card min-w-0 p-6"
          aria-label="Dados da matrícula"
        >
          <h2 class="ef-card-title"><mat-icon>school</mat-icon> Aluno e curso</h2>
          <div class="grid grid-cols-1 gap-x-4 md:grid-cols-6">
            <mat-form-field appearance="outline" class="md:col-span-3">
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
              @if (
                form.controls.aluno.hasError("required") || form.controls.aluno.hasError("obj")
              ) {
                <mat-error>Selecione um aluno da lista</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline" class="md:col-span-3">
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
              @if (
                form.controls.curso.hasError("required") || form.controls.curso.hasError("obj")
              ) {
                <mat-error>Selecione um curso da lista</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline" class="md:col-span-2" subscriptSizing="dynamic">
              <mat-label>Número da matrícula</mat-label>
              <input
                matInput
                formControlName="numeroMatricula"
                placeholder="Gerado automaticamente"
              />
              <mat-hint>Em branco = gerado (ano + 5 dígitos)</mat-hint>
            </mat-form-field>

            <mat-form-field appearance="outline" class="md:col-span-2" subscriptSizing="dynamic">
              <mat-label>Data da matrícula</mat-label>
              <input matInput type="date" formControlName="dataMatricula" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="md:col-span-2" subscriptSizing="dynamic">
              <mat-label>Agente educacional</mat-label>
              <mat-select formControlName="agenteEducacionalId">
                <mat-option value="">—</mat-option>
                @for (a of agentes; track a.id) {
                  <mat-option [value]="a.id">{{ a.nome }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>

          <hr class="my-5 border-0 border-t border-line" />
          <h2 class="ef-card-title"><mat-icon>draw</mat-icon> Contrato</h2>
          <div class="flex flex-wrap gap-x-10 gap-y-3">
            <mat-slide-toggle formControlName="contratoAssinado"
              >Contrato assinado</mat-slide-toggle
            >
            <mat-slide-toggle formControlName="tcdAssinado">TCD assinado</mat-slide-toggle>
          </div>

          <hr class="my-5 border-0 border-t border-line" />
          <h2 class="ef-card-title"><mat-icon>payments</mat-icon> Cobrança</h2>
          <p class="mb-3 mt-0 text-sm text-muted">
            Opcional. Preenchendo valor e nº de parcelas{{
              editando ? "." : ", as parcelas mensais são geradas automaticamente ao salvar."
            }}
          </p>
          <div class="grid grid-cols-1 gap-x-4 md:grid-cols-6">
            <mat-form-field appearance="outline" class="md:col-span-2">
              <mat-label>Valor do curso</mat-label>
              <input matInput type="number" min="0" step="0.01" formControlName="valorCurso" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="md:col-span-2">
              <mat-label>Número de parcelas</mat-label>
              <input matInput type="number" min="1" max="360" formControlName="numeroParcelas" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="md:col-span-2">
              <mat-label>Dia de vencimento</mat-label>
              <input matInput type="number" min="1" max="28" formControlName="diaVencimento" />
            </mat-form-field>
          </div>

          @if (editando) {
            <div class="-mt-2">
              @if (quantidadeParcelas > 0) {
                <p class="m-0 text-sm text-muted">
                  {{ quantidadeParcelas }} parcela(s) já gerada(s) para esta matrícula — veja na
                  Ficha de Cobrança.
                </p>
              } @else {
                <button
                  mat-stroked-button
                  type="button"
                  [disabled]="gerandoParcelas"
                  (click)="gerarParcelas()"
                >
                  <mat-icon>receipt_long</mat-icon>
                  {{ gerandoParcelas ? "Gerando..." : "Gerar parcelas" }}
                </button>
                <p class="mb-0 mt-1 text-xs text-muted">
                  Salve a matrícula com valor, número de parcelas e dia de vencimento preenchidos
                  antes de gerar.
                </p>
              }
            </div>

            <hr class="my-5 border-0 border-t border-line" />
            <h2 class="ef-card-title"><mat-icon>sell</mat-icon> Situação de cobrança e tags</h2>
            <div class="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Situação de cobrança</mat-label>
                <mat-select
                  [formControl]="situacaoCobrancaControl"
                  (selectionChange)="mudarSituacaoCobranca($event.value)"
                >
                  @for (situacao of situacoesCobranca; track situacao.id) {
                    <mat-option [value]="situacao.id">{{ situacao.nome }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <div>
                <p class="mb-2 mt-0 text-sm text-muted">Tags (para busca posterior)</p>
                <div class="flex flex-wrap items-center gap-2">
                  <mat-chip-set>
                    @for (tag of tagsAtuais; track tag.id) {
                      <mat-chip [removable]="true" (removed)="removerTag(tag)">
                        {{ tag.nome }}
                        <mat-icon matChipRemove aria-label="Remover tag">cancel</mat-icon>
                      </mat-chip>
                    }
                  </mat-chip-set>
                  <mat-form-field
                    appearance="outline"
                    class="!w-48 !text-xs"
                    subscriptSizing="dynamic"
                  >
                    <input
                      matInput
                      [formControl]="novaTagControl"
                      [matAutocomplete]="autoTag"
                      placeholder="Digite e Enter"
                      (keydown.enter)="$event.preventDefault(); confirmarNovaTag()"
                    />
                    <mat-autocomplete
                      #autoTag="matAutocomplete"
                      (optionSelected)="confirmarNovaTag()"
                    >
                      @for (tag of tagsFiltradas(); track tag.id) {
                        <mat-option [value]="tag.nome">{{ tag.nome }}</mat-option>
                      }
                    </mat-autocomplete>
                  </mat-form-field>
                </div>
              </div>
            </div>

            @if (id) {
              <hr class="my-5 border-0 border-t border-line" />
              <h2 class="ef-card-title">
                <mat-icon>account_balance_wallet</mat-icon> Responsável financeiro
              </h2>
              <div class="flex flex-wrap items-center gap-3">
                @if (sacadoNome) {
                  <span class="text-sm"
                    ><strong>{{ sacadoNome }}</strong> — {{ sacadoDocumento }} (cobrança e nota
                    fiscal saem em nome dele)</span
                  >
                } @else {
                  <span class="text-sm text-muted"
                    >O próprio aluno (padrão) — a nota fiscal sai no nome dele</span
                  >
                }
                <button
                  mat-stroked-button
                  type="button"
                  class="ml-auto"
                  (click)="alterandoSacado = !alterandoSacado"
                >
                  {{ alterandoSacado ? "Fechar" : "Alterar responsável" }}
                </button>
              </div>

              @if (alterandoSacado) {
                <app-sacado-matricula (alterado)="aoMudarSacado($event)"></app-sacado-matricula>
                <p class="mt-2 text-xs text-amber-700">
                  Cobranças (boleto/Pix) já emitidas continuam no nome do responsável anterior; só
                  as próximas saem no nome do novo.
                </p>
                <div class="mt-2 flex gap-2">
                  <button
                    mat-flat-button
                    color="primary"
                    type="button"
                    [disabled]="!sacadoNovoValido || salvandoSacado"
                    (click)="salvarSacado()"
                  >
                    Salvar responsável
                  </button>
                </div>
              }
            }
          }

          <hr class="my-5 border-0 border-t border-line" />
          <h2 class="ef-card-title"><mat-icon>notes</mat-icon> Observações</h2>
          <mat-form-field appearance="outline" class="w-full" subscriptSizing="dynamic">
            <mat-label>Observações</mat-label>
            <textarea matInput formControlName="observacoes" rows="3"></textarea>
          </mat-form-field>

          <div class="ef-form-footer">
            <span class="text-sm text-muted"
              ><span class="text-red-600">*</span> Campos obrigatórios</span
            >
            <span class="flex-1"></span>
            <a mat-stroked-button routerLink="/matriculas">Cancelar</a>
            <button mat-flat-button color="primary" type="submit" [disabled]="salvando">
              <mat-icon>check</mat-icon> {{ editando ? "Salvar alterações" : "Criar matrícula" }}
            </button>
          </div>
        </form>

        @if (editando && matricula(); as m) {
          <aside class="grid gap-3" aria-label="Resumo da matrícula">
            <section class="ef-card p-5">
              <div class="flex items-center gap-4">
                <span class="ef-avatar ef-avatar-lg">{{ iniciais(m.aluno?.nome) }}</span>
                <div class="min-w-0">
                  <a
                    [routerLink]="['/alunos', m.alunoId]"
                    class="break-words text-lg font-semibold leading-tight text-brand-700 no-underline hover:underline"
                    >{{ m.aluno?.nome || "Aluno" }}</a
                  >
                  <p class="m-0 text-sm text-muted">{{ m.curso?.nome }}</p>
                </div>
              </div>

              <hr class="my-4 border-0 border-t border-line" />
              <dl class="m-0 grid gap-3 text-sm">
                <div>
                  <dt class="text-muted">Situação da matrícula</dt>
                  <dd class="m-0 mt-1">
                    <span [class]="pillSituacao(m.situacao)">{{ rotuloSituacao(m.situacao) }}</span>
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">Data da matrícula</dt>
                  <dd class="m-0 text-base font-medium">
                    {{ m.dataMatricula ? (m.dataMatricula | date: "dd/MM/yyyy" : "UTC") : "—" }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">Contrato e TCD</dt>
                  <dd class="m-0 mt-1 flex flex-wrap gap-2">
                    <span
                      [class]="m.contratoAssinado ? 'ef-pill ef-pill-ok' : 'ef-pill ef-pill-warn'"
                      >Contrato {{ m.contratoAssinado ? "assinado" : "pendente" }}</span
                    >
                    <span [class]="m.tcdAssinado ? 'ef-pill ef-pill-ok' : 'ef-pill ef-pill-warn'"
                      >TCD {{ m.tcdAssinado ? "assinado" : "pendente" }}</span
                    >
                  </dd>
                </div>
              </dl>

              <hr class="my-4 border-0 border-t border-line" />
              <h2 class="ef-card-title !mb-3"><mat-icon>credit_card</mat-icon> Parcelas</h2>
              @if (m.resumoParcelas; as r) {
                <div class="flex flex-wrap gap-1.5" data-testid="resumo-parcelas">
                  @if (r.vencidas > 0) {
                    <span class="ef-chip bg-orange-100 text-orange-700"
                      >{{ r.vencidas }} vencida(s)</span
                    >
                  }
                  @if (r.emAberto > 0) {
                    <span class="ef-chip bg-blue-100 text-blue-700"
                      >{{ r.emAberto }} aberta(s)</span
                    >
                  }
                  @if (r.pagas > 0) {
                    <span class="ef-chip bg-green-100 text-green-700">{{ r.pagas }} paga(s)</span>
                  }
                  @if (r.renegociadas > 0) {
                    <span class="ef-chip bg-purple-100 text-purple-700"
                      >{{ r.renegociadas }} renegociada(s)</span
                    >
                  }
                  @if (r.protestadas > 0) {
                    <span class="ef-chip bg-red-100 text-red-800"
                      >{{ r.protestadas }} protestada(s)</span
                    >
                  }
                  @if (r.canceladas > 0) {
                    <span class="ef-chip bg-gray-100 text-gray-500"
                      >{{ r.canceladas }} cancelada(s)</span
                    >
                  }
                </div>
              } @else {
                <p class="m-0 text-sm text-muted">
                  {{
                    quantidadeParcelas > 0
                      ? quantidadeParcelas + " parcela(s) gerada(s)."
                      : "Nenhuma parcela gerada."
                  }}
                </p>
              }
              @if (auth.temPerfil("ADMINISTRADOR")) {
                <a
                  mat-stroked-button
                  class="mt-4 !w-full"
                  [routerLink]="['/cobranca/matriculas', m.id]"
                >
                  <mat-icon>receipt_long</mat-icon> Abrir ficha de cobrança
                </a>
              }
            </section>
          </aside>
        }
      </div>

      <!-- ===== Situação ===== -->
      @if (editando && id && situacaoAtual && aba() === "situacao") {
        <app-situacao-matricula
          [matriculaId]="id"
          [situacaoInicial]="situacaoAtual"
        ></app-situacao-matricula>
      }

      <!-- ===== Documentos ===== -->
      @if (editando && id && aba() === "documentos") {
        <section class="ef-card p-6">
          <h2 class="ef-card-title !mb-0">
            <mat-icon>folder_open</mat-icon> Documentos da matrícula
          </h2>
          <app-documentos-matricula [matriculaId]="id"></app-documentos-matricula>
        </section>
      }
    </div>
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
  protected readonly pillSituacao = pillSituacaoMatricula;
  protected readonly rotuloSituacao = rotuloSituacaoMatricula;

  readonly aba = signal<Aba>("dados");
  /** A matrícula carregada (resumo lateral); nula em matrícula nova. */
  readonly matricula = signal<Matricula | null>(null);

  iniciais(nome: string | undefined): string {
    return iniciaisDe(nome ?? "");
  }
  /** Situação carregada da matrícula (a troca é feita pelo componente próprio). */
  situacaoAtual = "";
  sacadoNome = "";
  sacadoDocumento = "";
  alterandoSacado = false;
  salvandoSacado = false;
  sacadoNovo: SacadoPayload | null = null;
  sacadoNovoValido = true;

  aoMudarSacado(evento: { sacado: SacadoPayload | null; valido: boolean }): void {
    this.sacadoNovo = evento.sacado;
    this.sacadoNovoValido = evento.valido;
  }

  /** "O próprio aluno" (sacado nulo) remove o responsável; senão grava o novo. */
  salvarSacado(): void {
    if (!this.id) return;
    this.salvandoSacado = true;
    this.service
      .alterarSacado(this.id, this.sacadoNovo ? { sacado: this.sacadoNovo } : { sacadoId: null })
      .subscribe({
        next: (m) => {
          this.salvandoSacado = false;
          this.alterandoSacado = false;
          this.sacadoNome = m.sacado?.nome ?? "";
          this.sacadoDocumento = m.sacado
            ? m.sacado.tipoPessoa === "FISICA"
              ? formatarCpf(m.sacado.cpfCnpj)
              : formatarCnpj(m.sacado.cpfCnpj)
            : "";
          const emitidas = m.cobrancasEmitidasNoSacadoAnterior;
          this.snackBar.open(
            emitidas > 0
              ? `Responsável alterado. Atenção: ${emitidas} cobrança(s) já emitida(s) continuam no nome do anterior.`
              : "Responsável alterado",
            "Fechar",
            { duration: emitidas > 0 ? 10000 : 3000 },
          );
        },
        error: () => (this.salvandoSacado = false),
      });
  }

  editando = false;
  carregando = false;
  salvando = false;
  gerandoParcelas = false;
  quantidadeParcelas = 0;
  id: string | null = null;
  agentes: AgenteEducacional[] = [];
  readonly auth = inject(AuthService);

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
    contratoAssinado: [false],
    tcdAssinado: [false],
    observacoes: [""],
    agenteEducacionalId: [""],
    valorCurso: this.fb.control<number | undefined>(undefined),
    numeroParcelas: this.fb.control<number | undefined>(undefined),
    diaVencimento: this.fb.control<number | undefined>(undefined),
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

    // Ao escolher um curso (não ao digitar), sugere o valor padrão dele no
    // campo "Valor do curso" — só se o campo ainda estiver vazio, pra nunca
    // sobrescrever um valor já digitado/negociado pelo usuário.
    this.form.controls.curso.valueChanges.subscribe((valor) => {
      if (valor && typeof valor !== "string" && valor.valorPadrao != null) {
        if (this.form.controls.valorCurso.value === undefined) {
          this.form.controls.valorCurso.setValue(valor.valorPadrao);
        }
      }
    });

    this.id = this.route.snapshot.paramMap.get("id");
    this.editando = !!this.id;
    this.service.listarAgentes().subscribe((agentes) => (this.agentes = agentes));
    // Matrícula nova: quem está cadastrando é o agente educacional por padrão.
    if (!this.editando) {
      this.form.controls.agenteEducacionalId.setValue(this.auth.usuario()?.id ?? "");
    }

    if (this.editando && this.id) {
      this.carregando = true;
      this.service.buscarPorId(this.id).subscribe({
        next: (m) => {
          this.matricula.set(m);
          this.carregarResumoParcelas(m);
          this.situacaoAtual = m.situacao;
          this.sacadoNome = m.sacado?.nome ?? "";
          this.sacadoDocumento = m.sacado
            ? m.sacado.tipoPessoa === "FISICA"
              ? formatarCpf(m.sacado.cpfCnpj)
              : formatarCnpj(m.sacado.cpfCnpj)
            : "";
          this.form.patchValue({
            aluno: m.aluno
              ? ({ id: m.alunoId, cpf: m.aluno.cpf, nome: m.aluno.nome } as Aluno)
              : null,
            curso: m.curso
              ? ({ id: m.cursoId, codigo: m.curso.codigo, nome: m.curso.nome } as Curso)
              : null,
            numeroMatricula: m.numeroMatricula ?? "",
            dataMatricula: m.dataMatricula ? m.dataMatricula.substring(0, 10) : "",
            contratoAssinado: m.contratoAssinado,
            tcdAssinado: m.tcdAssinado,
            observacoes: m.observacoes ?? "",
            agenteEducacionalId: m.agenteEducacionalId ?? "",
            valorCurso: m.valorCurso ?? undefined,
            numeroParcelas: m.numeroParcelas ?? undefined,
            diaVencimento: m.diaVencimento ?? undefined,
          });
          this.quantidadeParcelas = m.quantidadeParcelas ?? 0;
          this.carregando = false;
        },
        error: () => (this.carregando = false),
      });

      this.cobrancaService.listarSituacoes(true).subscribe((res) => (this.situacoesCobranca = res));
      this.cobrancaService.listarTags().subscribe((res) => (this.todasTags = res));
      this.carregarFichaCobranca();
    }
  }

  /** A busca por id não traz o resumo de parcelas (só a lista traz): pega da lista do aluno. */
  private carregarResumoParcelas(m: Matricula): void {
    this.service.listar({ alunoId: m.alunoId, pageSize: 100 }).subscribe((res) => {
      const resumo = res.data.find((x) => x.id === m.id)?.resumoParcelas;
      if (resumo)
        this.matricula.update((atual) => (atual ? { ...atual, resumoParcelas: resumo } : atual));
    });
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
    this.cobrancaService.removerTag(this.id, tag.id).subscribe(() => this.carregarFichaCobranca());
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
      contratoAssinado: bruto.contratoAssinado ?? false,
      tcdAssinado: bruto.tcdAssinado ?? false,
      observacoes: bruto.observacoes || undefined,
      agenteEducacionalId: bruto.agenteEducacionalId || undefined,
      // Salvo em criação e edição — mas só dispara geração automática na
      // criação (ver matriculas.service.ts). Na edição, fica guardado para
      // o botão "Gerar parcelas" usar depois.
      valorCurso: bruto.valorCurso ?? undefined,
      numeroParcelas: bruto.numeroParcelas ?? undefined,
      diaVencimento: bruto.diaVencimento ?? undefined,
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

  gerarParcelas(): void {
    if (!this.id) return;
    this.gerandoParcelas = true;
    this.service.gerarParcelas(this.id).subscribe({
      next: ({ parcelasGeradas }) => {
        this.gerandoParcelas = false;
        this.quantidadeParcelas = parcelasGeradas;
        this.snackBar.open(`${parcelasGeradas} parcela(s) gerada(s)`, "Fechar", {
          duration: 3000,
        });
      },
      error: (erro) => {
        this.gerandoParcelas = false;
        const mensagem = erro?.error?.mensagem ?? "Não foi possível gerar as parcelas";
        this.snackBar.open(mensagem, "Fechar", { duration: 5000 });
      },
    });
  }
}

// Garante que o valor selecionado é um objeto (aluno/curso), não texto livre.
function objetoValidator(control: { value: unknown }) {
  const v = control.value;
  if (v === null || v === undefined || v === "") return null;
  return typeof v === "object" ? null : { obj: true };
}
