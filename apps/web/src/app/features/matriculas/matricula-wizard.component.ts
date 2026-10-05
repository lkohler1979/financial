import { CurrencyPipe } from "@angular/common";
import { Component, inject, OnInit } from "@angular/core";
import { FormsModule, ReactiveFormsModule, Validators, FormBuilder } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSelectModule } from "@angular/material/select";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatStepperModule } from "@angular/material/stepper";
import { AuthService } from "../../core/auth/auth.service";
import { AlunoPayload } from "../../core/models/aluno.model";
import { Curso } from "../../core/models/curso.model";
import { AgenteEducacional } from "../../core/models/matricula.model";
import { TipoCobranca } from "../../core/models/tipo-cobranca.model";
import { AlunosService } from "../../core/services/alunos.service";
import { CursosService } from "../../core/services/cursos.service";
import { MatriculasService } from "../../core/services/matriculas.service";
import { TiposCobrancaService } from "../../core/services/tipos-cobranca.service";
import { normalizarCpf, validarCpf } from "../../shared/utils/cpf.util";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR",
  "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];
const GENEROS = ["Feminino", "Masculino", "Outro", "Prefiro não informar"];

/** Uma linha da tela de pagamento — um tipo de cobrança (Mensalidade, Taxa...). */
interface LinhaCobranca {
  tipo: TipoCobranca;
  gerar: boolean;
  numeroParcelas: number;
  primeiroVencimento: string;
  valorEditado: number | null;
  editandoValor: boolean;
}

function hojeIso(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/**
 * Cadastro de matrícula em 3 passos (pedido do usuário, 2026-10-05, baseado
 * nas telas do Universa): 1) dados pessoais, 2) contato e endereço, 3) curso
 * e pagamento. Se o CPF já existe, os dados do aluno são carregados e
 * atualizados; senão o aluno é criado junto com a matrícula.
 */
@Component({
  selector: "app-matricula-wizard",
  standalone: true,
  imports: [
    CurrencyPipe,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatStepperModule,
  ],
  template: `
    <div class="flex items-center gap-2 mb-4">
      <a mat-icon-button routerLink="/matriculas" aria-label="Voltar"
        ><mat-icon>arrow_back</mat-icon></a
      >
      <h1 class="text-2xl font-medium m-0">Nova matrícula</h1>
    </div>

    @if (enviando) {
      <mat-progress-bar mode="indeterminate"></mat-progress-bar>
    }

    <div class="bg-white rounded shadow-sm p-4 max-w-5xl">
      <mat-stepper [linear]="true" #stepper>
        <mat-step [stepControl]="pessoal" label="Dados pessoais">
          <form [formGroup]="pessoal" class="pt-3">
            <p class="text-xs font-medium text-gray-600 border-b pb-1 mb-3">DADOS PESSOAIS DO ALUNO</p>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-x-4">
              <mat-form-field appearance="outline">
                <mat-label>CPF</mat-label>
                <input matInput formControlName="cpf" maxlength="14" (blur)="buscarAluno()" />
                @if (pessoal.controls.cpf.hasError("cpf")) {
                  <mat-error>CPF inválido</mat-error>
                }
                @if (pessoal.controls.cpf.hasError("required")) {
                  <mat-error>CPF é obrigatório</mat-error>
                }
              </mat-form-field>

              <mat-form-field appearance="outline" class="md:col-span-3">
                <mat-label>Nome do aluno</mat-label>
                <input matInput formControlName="nome" />
                @if (pessoal.controls.nome.hasError("required")) {
                  <mat-error>Nome é obrigatório</mat-error>
                }
              </mat-form-field>

              @if (alunoExistente) {
                <p class="md:col-span-4 text-sm text-blue-700 mt-0 mb-3">
                  Aluno já cadastrado (código {{ alunoExistente.codigo }}) — dados carregados; o
                  que você alterar aqui atualiza o cadastro.
                </p>
              }

              <mat-form-field appearance="outline">
                <mat-label>Gênero</mat-label>
                <mat-select formControlName="genero">
                  <mat-option value="">—</mat-option>
                  @for (g of generos; track g) {
                    <mat-option [value]="g">{{ g }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Data de nascimento</mat-label>
                <input matInput type="date" formControlName="dataNascimento" />
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Estado de nascimento</mat-label>
                <mat-select formControlName="estadoNascimento">
                  <mat-option value="">—</mat-option>
                  @for (uf of ufs; track uf) {
                    <mat-option [value]="uf">{{ uf }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Cidade de nascimento</mat-label>
                <input matInput formControlName="cidadeNascimento" />
              </mat-form-field>

              <mat-form-field appearance="outline" class="md:col-span-2">
                <mat-label>Nome da mãe</mat-label>
                <input matInput formControlName="nomeMae" />
              </mat-form-field>

              <mat-form-field appearance="outline" class="md:col-span-2">
                <mat-label>Agente educacional</mat-label>
                <mat-select formControlName="agenteEducacionalId">
                  <mat-option value="">—</mat-option>
                  @for (a of agentes; track a.id) {
                    <mat-option [value]="a.id">{{ a.nome }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </div>
            <div class="flex justify-end">
              <button mat-stroked-button matStepperNext type="button">Próxima</button>
            </div>
          </form>
        </mat-step>

        <mat-step [stepControl]="contato" label="Contato e endereço">
          <form [formGroup]="contato" class="pt-3">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              <div>
                <p class="text-xs font-medium text-gray-600 border-b pb-1 mb-3">CONTATO</p>
                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Telefone</mat-label>
                  <input matInput formControlName="telefone2" placeholder="(00) 0000-0000" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Celular</mat-label>
                  <input matInput formControlName="telefone1" placeholder="(00) 00000-0000" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>E-mail</mat-label>
                  <input matInput type="email" formControlName="email" />
                  @if (contato.controls.email.hasError("email")) {
                    <mat-error>E-mail inválido</mat-error>
                  }
                </mat-form-field>
              </div>

              <div>
                <p class="text-xs font-medium text-gray-600 border-b pb-1 mb-3">ENDEREÇO</p>
                <div class="grid grid-cols-3 gap-x-3">
                  <mat-form-field appearance="outline">
                    <mat-label>CEP</mat-label>
                    <input matInput formControlName="cep" placeholder="00000-000" (blur)="buscarCep()" />
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="col-span-2">
                    <mat-label>Endereço</mat-label>
                    <input matInput formControlName="endereco" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Número</mat-label>
                    <input matInput formControlName="numero" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Complemento</mat-label>
                    <input matInput formControlName="complemento" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Bairro</mat-label>
                    <input matInput formControlName="bairro" />
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="col-span-2">
                    <mat-label>Cidade</mat-label>
                    <input matInput formControlName="cidade" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Estado</mat-label>
                    <mat-select formControlName="estado">
                      <mat-option value="">—</mat-option>
                      @for (uf of ufs; track uf) {
                        <mat-option [value]="uf">{{ uf }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                </div>
              </div>
            </div>
            <div class="flex justify-between">
              <button mat-stroked-button matStepperPrevious type="button">Anterior</button>
              <button mat-stroked-button matStepperNext type="button">Próxima</button>
            </div>
          </form>
        </mat-step>

        <mat-step [stepControl]="cursoForm" label="Curso e pagamento">
          <form [formGroup]="cursoForm" class="pt-3">
            <p class="text-xs font-medium text-gray-600 border-b pb-1 mb-3">
              INFORMAÇÕES DO CURSO DE MATRÍCULA
            </p>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-x-4">
              <mat-form-field appearance="outline">
                <mat-label>Nível de ensino</mat-label>
                <mat-select formControlName="nivel" (selectionChange)="cursoForm.controls.cursoId.setValue('')">
                  <mat-option value="">Todos</mat-option>
                  @for (n of niveis; track n) {
                    <mat-option [value]="n">{{ n }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="md:col-span-2">
                <mat-label>Campus/Curso</mat-label>
                <mat-select formControlName="cursoId">
                  @for (c of cursosFiltrados(); track c.id) {
                    <mat-option [value]="c.id">{{ c.codigo }} — {{ c.nome }}</mat-option>
                  }
                </mat-select>
                @if (cursoForm.controls.cursoId.hasError("required")) {
                  <mat-error>Selecione um curso</mat-error>
                }
              </mat-form-field>
            </div>

            <p class="text-xs font-medium text-gray-600 border-b pb-1 mb-3 mt-2">
              INFORMAÇÕES DE PAGAMENTO
            </p>
            @if (!cursoSelecionado()) {
              <p class="text-sm text-gray-500">Selecione o curso para ver as cobranças.</p>
            }
            @for (linha of linhas; track linha.tipo.id) {
              <div class="grid grid-cols-2 md:grid-cols-6 gap-3 items-center bg-gray-50 rounded p-3 mb-2">
                <div>
                  <p class="text-xs text-gray-500 m-0">Gerar</p>
                  <mat-checkbox
                    [(ngModel)]="linha.gerar"
                    [ngModelOptions]="{ standalone: true }"
                    [disabled]="linha.tipo.obrigatorio"
                  ></mat-checkbox>
                </div>
                <div class="md:col-span-2">
                  <p class="text-xs text-gray-500 m-0">Título</p>
                  <span>{{ linha.tipo.nome }} ({{ linha.tipo.obrigatorio ? "Obrigatório" : "Opcional" }})</span>
                </div>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Pagamento</mat-label>
                  <mat-select
                    [(ngModel)]="linha.numeroParcelas"
                    [ngModelOptions]="{ standalone: true }"
                    [disabled]="!linha.gerar"
                  >
                    @for (n of linha.tipo.opcoesParcelas; track n) {
                      <mat-option [value]="n">{{ rotuloParcelamento(linha, n) }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Vencimento</mat-label>
                  <input
                    matInput
                    type="date"
                    [(ngModel)]="linha.primeiroVencimento"
                    [ngModelOptions]="{ standalone: true }"
                    [disabled]="!linha.gerar"
                  />
                </mat-form-field>
                <div>
                  @if (linha.editandoValor) {
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>Valor</mat-label>
                      <input
                        matInput
                        type="number"
                        min="0"
                        step="0.01"
                        [(ngModel)]="linha.valorEditado"
                        [ngModelOptions]="{ standalone: true }"
                      />
                    </mat-form-field>
                  } @else {
                    <p class="text-xs text-gray-500 m-0">Valor</p>
                    <span>
                      {{ valorEfetivo(linha) !== null ? (valorEfetivo(linha) | currency: "BRL") : "—" }}
                    </span>
                    <button
                      mat-icon-button
                      type="button"
                      aria-label="Alterar valor"
                      [disabled]="!linha.gerar"
                      (click)="linha.editandoValor = true"
                    >
                      <mat-icon>edit</mat-icon>
                    </button>
                  }
                </div>
              </div>
            }
            @if (linhas.length > 0) {
              <p class="text-sm text-right m-0 mt-2">
                Total a gerar: <strong>{{ totalGeral() | currency: "BRL" }}</strong>
              </p>
            }

            <div class="flex justify-between mt-3">
              <button mat-stroked-button matStepperPrevious type="button">Anterior</button>
              <button
                mat-raised-button
                color="primary"
                type="button"
                [disabled]="enviando"
                (click)="enviar()"
              >
                <mat-icon>save</mat-icon> Enviar dados
              </button>
            </div>
          </form>
        </mat-step>
      </mat-stepper>
    </div>
  `,
})
export class MatriculaWizardComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  private readonly alunosService = inject(AlunosService);
  private readonly cursosService = inject(CursosService);
  private readonly matriculasService = inject(MatriculasService);
  private readonly tiposService = inject(TiposCobrancaService);

  readonly ufs = UFS;
  readonly generos = GENEROS;

  enviando = false;
  alunoExistente: { id: string; codigo: string | null } | null = null;
  agentes: AgenteEducacional[] = [];
  cursos: Curso[] = [];
  niveis: string[] = [];
  tipos: TipoCobranca[] = [];
  linhas: LinhaCobranca[] = [];

  readonly pessoal = this.fb.nonNullable.group({
    cpf: ["", [Validators.required, (c: { value: string }) => (!c.value || validarCpf(c.value) ? null : { cpf: true })]],
    nome: ["", Validators.required],
    genero: [""],
    dataNascimento: [""],
    estadoNascimento: [""],
    cidadeNascimento: [""],
    nomeMae: [""],
    agenteEducacionalId: [""],
  });

  readonly contato = this.fb.nonNullable.group({
    telefone1: [""],
    telefone2: [""],
    email: ["", Validators.email],
    cep: [""],
    endereco: [""],
    numero: [""],
    complemento: [""],
    bairro: [""],
    cidade: [""],
    estado: [""],
  });

  readonly cursoForm = this.fb.nonNullable.group({
    nivel: [""],
    cursoId: ["", Validators.required],
  });

  ngOnInit(): void {
    this.pessoal.controls.agenteEducacionalId.setValue(this.auth.usuario()?.id ?? "");
    this.matriculasService.listarAgentes().subscribe((a) => (this.agentes = a));
    this.cursosService.listar({ situacao: true, pageSize: 100 }).subscribe((res) => {
      this.cursos = res.data;
      this.niveis = [...new Set(res.data.map((c) => c.grauEnsino).filter((g): g is string => !!g))].sort();
    });
    this.tiposService.listar().subscribe((tipos) => {
      this.tipos = tipos;
      this.linhas = tipos.map((tipo) => ({
        tipo,
        gerar: tipo.obrigatorio,
        numeroParcelas: tipo.opcoesParcelas[0] ?? 1,
        primeiroVencimento: hojeIso(),
        valorEditado: null,
        editandoValor: false,
      }));
    });
  }

  cursosFiltrados(): Curso[] {
    const nivel = this.cursoForm.controls.nivel.value;
    return nivel ? this.cursos.filter((c) => c.grauEnsino === nivel) : this.cursos;
  }

  cursoSelecionado(): Curso | undefined {
    return this.cursos.find((c) => c.id === this.cursoForm.controls.cursoId.value);
  }

  valorBase(linha: LinhaCobranca): number | null {
    // valorPadrao do curso chega como string (Decimal serializado) — converte.
    const doCurso = this.cursoSelecionado()?.valorPadrao;
    return linha.tipo.usaValorDoCurso
      ? doCurso == null
        ? null
        : Number(doCurso)
      : linha.tipo.valorPadrao;
  }

  valorEfetivo(linha: LinhaCobranca): number | null {
    return linha.valorEditado ?? this.valorBase(linha);
  }

  rotuloParcelamento(linha: LinhaCobranca, n: number): string {
    const valor = this.valorEfetivo(linha);
    if (valor === null) return `${n}x`;
    const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return `${n} x ${fmt(valor / n)} = ${fmt(valor)}`;
  }

  totalGeral(): number {
    return this.linhas
      .filter((l) => l.gerar)
      .reduce((soma, l) => soma + (this.valorEfetivo(l) ?? 0), 0);
  }

  /** Ao sair do CPF: se o aluno já existe, carrega os dados dele. */
  buscarAluno(): void {
    const cpf = this.pessoal.controls.cpf.value;
    if (!cpf || !validarCpf(cpf) || this.alunoExistente) return;
    const digitos = normalizarCpf(cpf);
    this.alunosService.listar({ busca: digitos, pageSize: 5 }).subscribe((res) => {
      const aluno = res.data.find((a) => a.cpf === digitos);
      if (!aluno) return;
      this.alunoExistente = { id: aluno.id, codigo: aluno.codigo ?? null };
      this.pessoal.patchValue({
        nome: aluno.nome,
        genero: aluno.genero ?? "",
        dataNascimento: aluno.dataNascimento ? aluno.dataNascimento.substring(0, 10) : "",
        estadoNascimento: aluno.estadoNascimento ?? "",
        cidadeNascimento: aluno.cidadeNascimento ?? "",
        nomeMae: aluno.nomeMae ?? "",
        agenteEducacionalId: aluno.agenteEducacionalId ?? this.pessoal.controls.agenteEducacionalId.value,
      });
      this.contato.patchValue({
        telefone1: aluno.telefone1 ?? "",
        telefone2: aluno.telefone2 ?? "",
        email: aluno.email ?? "",
        cep: aluno.cep ?? "",
        endereco: aluno.endereco ?? "",
        numero: aluno.numero ?? "",
        complemento: aluno.complemento ?? "",
        bairro: aluno.bairro ?? "",
        cidade: aluno.cidade ?? "",
        estado: aluno.estado ?? "",
      });
    });
  }

  /** Preenche o endereço pelo CEP (ViaCEP) — se falhar, o usuário digita. */
  async buscarCep(): Promise<void> {
    const cep = this.contato.controls.cep.value.replace(/\D/g, "");
    if (cep.length !== 8) return;
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const dados = await resposta.json();
      if (dados.erro) return;
      this.contato.patchValue({
        endereco: dados.logradouro ?? "",
        bairro: dados.bairro ?? "",
        cidade: dados.localidade ?? "",
        estado: dados.uf ?? "",
      });
    } catch {
      // Sem internet/serviço fora: segue com preenchimento manual.
    }
  }

  private limpar<T extends Record<string, string>>(obj: T): Record<string, string> {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== ""));
  }

  enviar(): void {
    if (this.pessoal.invalid || this.contato.invalid) {
      this.pessoal.markAllAsTouched();
      this.contato.markAllAsTouched();
      this.snackBar.open("Revise os dados dos passos 1 e 2", "Fechar", { duration: 4000 });
      return;
    }
    if (this.cursoForm.invalid) {
      this.cursoForm.markAllAsTouched();
      return;
    }
    const geradas = this.linhas.filter((l) => l.gerar);
    const semValor = geradas.find((l) => this.valorEfetivo(l) === null);
    if (semValor) {
      this.snackBar.open(`${semValor.tipo.nome}: informe o valor (clique em editar)`, "Fechar", {
        duration: 5000,
      });
      return;
    }

    this.enviando = true;
    const { cpf, agenteEducacionalId, ...pessoais } = this.pessoal.getRawValue();
    const dadosAluno = {
      ...this.limpar(pessoais),
      ...this.limpar(this.contato.getRawValue()),
      ...(agenteEducacionalId ? { agenteEducacionalId } : {}),
    } as AlunoPayload;

    const aluno$ = this.alunoExistente
      ? this.alunosService.atualizar(this.alunoExistente.id, dadosAluno)
      : this.alunosService.criar({ ...dadosAluno, cpf: normalizarCpf(cpf) });

    aluno$.subscribe({
      next: (aluno) => {
        this.matriculasService
          .criar({
            alunoId: aluno.id,
            cursoId: this.cursoForm.controls.cursoId.value,
            agenteEducacionalId: agenteEducacionalId || undefined,
            cobrancas: geradas.map((l) => ({
              tipoCobrancaId: l.tipo.id,
              ...(l.valorEditado !== null ? { valor: l.valorEditado } : {}),
              numeroParcelas: l.numeroParcelas,
              primeiroVencimento: l.primeiroVencimento,
            })),
          })
          .subscribe({
            next: (matricula) => {
              this.snackBar.open(
                `Matrícula ${matricula.numeroMatricula} criada — anexe os documentos`,
                "Fechar",
                { duration: 6000 },
              );
              this.router.navigate(["/matriculas", matricula.id]);
            },
            error: () => (this.enviando = false),
          });
      },
      error: () => (this.enviando = false),
    });
  }
}
