import { CurrencyPipe } from "@angular/common";
import { Component, inject, OnInit, ViewChild } from "@angular/core";
import { forkJoin } from "rxjs";
import { FormsModule, ReactiveFormsModule, Validators, FormBuilder } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSelectModule } from "@angular/material/select";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatStepper, MatStepperModule } from "@angular/material/stepper";
import { SacadoMatriculaComponent } from "./sacado-matricula.component";
import { SacadoPayload } from "../../core/models/sacado.model";
import { AuthService } from "../../core/auth/auth.service";
import { Aluno, AlunoPayload } from "../../core/models/aluno.model";
import { Curso } from "../../core/models/curso.model";
import { AgenteEducacional } from "../../core/models/matricula.model";
import { CupomValidado } from "../../core/models/cupom.model";
import {
  FormaPagamento,
  ROTULO_FORMA_PAGAMENTO,
  TipoCobranca,
} from "../../core/models/tipo-cobranca.model";
import { CuponsService } from "../../core/services/cupons.service";
import { AlunosService } from "../../core/services/alunos.service";
import { CursosService } from "../../core/services/cursos.service";
import { MatriculasService } from "../../core/services/matriculas.service";
import { TiposCobrancaService } from "../../core/services/tipos-cobranca.service";
import { formatarCpf, normalizarCpf, validarCpf } from "../../shared/utils/cpf.util";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR",
  "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];
const GENEROS = ["Feminino", "Masculino", "Outro", "Prefiro não informar"];

/** Uma linha da tela de pagamento — um tipo de cobrança (Mensalidade, Taxa...). */
interface LinhaCobranca {
  tipo: TipoCobranca;
  gerar: boolean;
  formaPagamento: FormaPagamento | null;
  numeroParcelas: number;
  primeiroVencimento: string;
  valorEditado: number | null;
  editandoValor: boolean;
  observacoes: string;
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
    SacadoMatriculaComponent,
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
              <div class="grid grid-cols-2 md:grid-cols-7 gap-3 items-center bg-gray-50 rounded p-3 mb-2">
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
                  <mat-label>Forma</mat-label>
                  <mat-select
                    [(ngModel)]="linha.formaPagamento"
                    [ngModelOptions]="{ standalone: true }"
                    [disabled]="!linha.gerar"
                  >
                    @for (f of formas; track f) {
                      <mat-option [value]="f">{{ rotuloForma(f) }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
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
                    @if (descontoAplicado(linha)) {
                      <span class="text-xs text-gray-400 line-through block">
                        {{ valorEfetivo(linha) | currency: "BRL" }}
                      </span>
                    }
                    <span>
                      {{ valorFinal(linha) !== null ? (valorFinal(linha) | currency: "BRL") : "—" }}
                    </span>
                    <span class="text-xs text-green-700 block">
                      {{ descontoAplicado(linha) ? "Cupom " + cupom?.codigo : "" }}
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
                <div class="col-span-2 md:col-span-7">
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-full">
                    <mat-label>Obs. do título (opcional)</mat-label>
                    <input
                      matInput
                      maxlength="1000"
                      [(ngModel)]="linha.observacoes"
                      [ngModelOptions]="{ standalone: true }"
                      [disabled]="!linha.gerar"
                    />
                  </mat-form-field>
                </div>
              </div>
            }
            <app-sacado-matricula (alterado)="aoMudarSacado($event)"></app-sacado-matricula>

            <p class="text-xs font-medium text-gray-600 border-b pb-1 mb-3 mt-4">CUPOM DE DESCONTO</p>
            <div class="flex flex-wrap items-center gap-3">
              @if (cupom) {
                <span class="text-sm">
                  Cupom <strong>{{ cupom.codigo }}</strong>
                  ({{ cupom.tipoDesconto === "PERCENTUAL" ? cupom.valor + "%" : (cupom.valor | currency: "BRL") }}
                  de desconto) aplicado
                </span>
                <button mat-stroked-button type="button" (click)="removerCupom()">Remover cupom</button>
              } @else {
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Digite aqui o seu cupom</mat-label>
                  <input
                    matInput
                    [(ngModel)]="cupomDigitado"
                    [ngModelOptions]="{ standalone: true }"
                    (keydown.enter)="$event.preventDefault(); aplicarCupom()"
                  />
                </mat-form-field>
                <button mat-raised-button color="primary" type="button" (click)="aplicarCupom()">
                  Usar cupom de desconto
                </button>
              }
            </div>

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
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  private readonly alunosService = inject(AlunosService);
  private readonly cursosService = inject(CursosService);
  private readonly matriculasService = inject(MatriculasService);
  private readonly tiposService = inject(TiposCobrancaService);
  private readonly cuponsService = inject(CuponsService);

  formas: FormaPagamento[] = [];
  /** Responsável financeiro diferente do aluno (null = o próprio aluno). */
  sacado: SacadoPayload | null = null;
  sacadoValido = true;
  cupom: CupomValidado | null = null;
  cupomDigitado = "";

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

  @ViewChild("stepper") private stepper?: MatStepper;

  aoMudarSacado(evento: { sacado: SacadoPayload | null; valido: boolean }): void {
    this.sacado = evento.sacado;
    this.sacadoValido = evento.valido;
  }

  ngOnInit(): void {
    // "Adicionar curso" na ficha do aluno: abre o cadastro já com o aluno carregado,
    // direto no passo de curso e pagamento.
    const alunoId = this.route.snapshot.queryParamMap.get("alunoId");
    if (alunoId) this.carregarAlunoPorId(alunoId);
    this.pessoal.controls.agenteEducacionalId.setValue(this.auth.usuario()?.id ?? "");
    this.matriculasService.listarAgentes().subscribe((a) => (this.agentes = a));
    this.cursosService.listar({ situacao: true, pageSize: 100 }).subscribe((res) => {
      this.cursos = res.data;
      this.niveis = [...new Set(res.data.map((c) => c.grauEnsino).filter((g): g is string => !!g))].sort();
    });
    forkJoin([this.tiposService.listar(), this.tiposService.formasPagamento()]).subscribe(([todos, formas]) => {
      this.formas = formas;
      // Renegociação etc. nascem de outro fluxo — não aparecem no cadastro.
      const tipos = todos.filter((t) => t.disponivelNoCadastro);
      this.tipos = tipos;
      this.linhas = tipos.map((tipo) => ({
        tipo,
        gerar: tipo.obrigatorio,
        formaPagamento:
          tipo.formaPagamentoPadrao && formas.includes(tipo.formaPagamentoPadrao)
            ? tipo.formaPagamentoPadrao
            : (formas[0] ?? null),
        numeroParcelas: tipo.opcoesParcelas[0] ?? 1,
        primeiroVencimento: hojeIso(),
        valorEditado: null,
        editandoValor: false,
        observacoes: "",
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

  rotuloForma(f: FormaPagamento): string {
    return ROTULO_FORMA_PAGAMENTO[f];
  }

  /** Valor depois do cupom (só nos tipos que aceitam) — mesma conta da API. */
  valorFinal(linha: LinhaCobranca): number | null {
    const valor = this.valorEfetivo(linha);
    if (valor === null || !this.cupom || !linha.tipo.aceitaCupom) return valor;
    const c = this.cupom;
    const final = c.tipoDesconto === "PERCENTUAL" ? valor * (1 - Number(c.valor) / 100) : valor - Number(c.valor);
    return Math.round(final * 100) / 100;
  }

  descontoAplicado(linha: LinhaCobranca): boolean {
    return !!this.cupom && linha.tipo.aceitaCupom && linha.gerar;
  }

  aplicarCupom(): void {
    const codigo = this.cupomDigitado.trim();
    if (!codigo) return;
    this.cuponsService.validar(codigo).subscribe({
      next: (cupom) => {
        this.cupom = cupom;
        this.cupomDigitado = "";
        this.snackBar.open("Cupom aplicado", "Fechar", { duration: 3000 });
      },
      error: (erro) =>
        this.snackBar.open(erro?.error?.mensagem ?? "Cupom inválido", "Fechar", { duration: 5000 }),
    });
  }

  removerCupom(): void {
    this.cupom = null;
  }

  rotuloParcelamento(linha: LinhaCobranca, n: number): string {
    const valor = this.valorFinal(linha);
    if (valor === null) return `${n}x`;
    const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return `${n} x ${fmt(valor / n)} = ${fmt(valor)}`;
  }

  totalGeral(): number {
    return this.linhas
      .filter((l) => l.gerar)
      .reduce((soma, l) => soma + (this.valorFinal(l) ?? 0), 0);
  }

  private carregarAlunoPorId(id: string): void {
    this.alunosService.buscarPorId(id).subscribe((aluno) => {
      this.preencherAluno(aluno);
      // Passos 1 e 2 já vêm preenchidos: marca como concluídos e vai ao passo 3.
      setTimeout(() => {
        const passos = this.stepper?.steps.toArray() ?? [];
        passos[0] && (passos[0].completed = true);
        passos[1] && (passos[1].completed = true);
        if (this.stepper) this.stepper.selectedIndex = 2;
      });
    });
  }

  /** Ao sair do CPF: se o aluno já existe, carrega os dados dele. */
  buscarAluno(): void {
    const cpf = this.pessoal.controls.cpf.value;
    if (!cpf || !validarCpf(cpf) || this.alunoExistente) return;
    const digitos = normalizarCpf(cpf);
    this.alunosService.listar({ busca: digitos, pageSize: 5 }).subscribe((res) => {
      const aluno = res.data.find((a) => a.cpf === digitos);
      if (!aluno) return;
      this.preencherAluno(aluno);
    });
  }

  private preencherAluno(aluno: Aluno): void {
    {
      this.alunoExistente = { id: aluno.id, codigo: aluno.codigo ?? null };
      this.pessoal.controls.cpf.setValue(formatarCpf(aluno.cpf));
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
    }
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
    if (!this.sacadoValido) {
      this.snackBar.open("Revise os dados do responsável financeiro (CPF/CNPJ e nome)", "Fechar", { duration: 5000 });
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
              ...(l.formaPagamento ? { formaPagamento: l.formaPagamento } : {}),
              ...(l.observacoes.trim() ? { observacoes: l.observacoes.trim() } : {}),
            })),
            ...(this.cupom ? { cupomCodigo: this.cupom.codigo } : {}),
            ...(this.sacado ? { sacado: this.sacado } : {}),
          })
          .subscribe({
            next: (matricula) => {
              const emissao = matricula.emissaoCobrancas;
              const aviso = emissao?.falhas.length
                ? ` Atenção: ${emissao.falhas.length} cobrança(s) não puderam ser emitidas (${emissao.falhas[0].erro}) — emita pela Ficha de Cobrança.`
                : emissao?.emitidas
                  ? ` ${emissao.emitidas} cobrança(s) emitida(s); as demais saem perto do vencimento ou a pedido do aluno.`
                  : "";
              this.snackBar.open(
                `Matrícula ${matricula.numeroMatricula} criada — anexe os documentos.${aviso}`,
                "Fechar",
                { duration: aviso ? 12000 : 6000 },
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
