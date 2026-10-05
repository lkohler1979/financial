import { DatePipe } from "@angular/common";
import { Component, inject, OnInit } from "@angular/core";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSnackBar } from "@angular/material/snack-bar";
import { AlunosService } from "../../core/services/alunos.service";
import { MatriculasService } from "../../core/services/matriculas.service";
import { AlunoPayload } from "../../core/models/aluno.model";
import {
  AgenteEducacional,
  classeSituacaoMatricula,
  Matricula,
  rotuloSituacaoMatricula,
} from "../../core/models/matricula.model";
import { validarCpf } from "../../shared/utils/cpf.util";

function cpfValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  return validarCpf(control.value) ? null : { cpf: true };
}

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR",
  "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];
const GENEROS = ["Feminino", "Masculino", "Outro", "Prefiro não informar"];
const TIPOS_DOCUMENTO_IDENTIFICACAO = ["RG", "CNH", "Passaporte", "RNE", "Outro"];
const ORIGENS_CADASTRO = [
  "Instagram",
  "Facebook",
  "Google",
  "WhatsApp",
  "Site",
  "Indicação",
  "E-mail marketing",
  "Outro",
];

@Component({
  selector: "app-aluno-form",
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressBarModule,
  ],
  template: `
    <div class="flex items-center gap-2 mb-4">
      <a mat-icon-button routerLink="/alunos" aria-label="Voltar"
        ><mat-icon>arrow_back</mat-icon></a
      >
      <h1 class="text-2xl font-medium m-0">{{ editando ? "Editar aluno" : "Novo aluno" }}</h1>
      @if (codigo) {
        <span class="ml-2 px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-sm">
          Código {{ codigo }}
        </span>
      }
    </div>

    @if (carregando) {
      <mat-progress-bar mode="indeterminate"></mat-progress-bar>
    }

    <form [formGroup]="form" (ngSubmit)="salvar()" class="bg-white rounded shadow-sm p-6 max-w-4xl">
      <p class="text-xs font-medium text-gray-600 border-b pb-1 mb-3">DADOS PESSOAIS</p>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-x-4">
        <mat-form-field appearance="outline">
          <mat-label>CPF</mat-label>
          <input matInput formControlName="cpf" maxlength="14" />
          @if (form.controls.cpf.hasError("required")) {
            <mat-error>CPF é obrigatório</mat-error>
          }
          @if (form.controls.cpf.hasError("cpf")) {
            <mat-error>CPF inválido</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="md:col-span-2">
          <mat-label>Nome do aluno</mat-label>
          <input matInput formControlName="nome" />
          @if (form.controls.nome.hasError("required")) {
            <mat-error>Nome é obrigatório</mat-error>
          }
        </mat-form-field>

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
          <mat-label>Tipo de pessoa</mat-label>
          <input matInput formControlName="tipoPessoa" />
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

        <mat-form-field appearance="outline">
          <mat-label>Nome da mãe</mat-label>
          <input matInput formControlName="nomeMae" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Nome do pai</mat-label>
          <input matInput formControlName="nomePai" />
        </mat-form-field>
      </div>

      <p class="text-xs font-medium text-gray-600 border-b pb-1 mb-3 mt-2">CONTATO</p>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-x-4">
        <mat-form-field appearance="outline">
          <mat-label>Telefone</mat-label>
          <input matInput formControlName="telefone2" placeholder="(00) 0000-0000" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Celular</mat-label>
          <input matInput formControlName="telefone1" placeholder="(00) 00000-0000" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>E-mail</mat-label>
          <input matInput type="email" formControlName="email" />
          @if (form.controls.email.hasError("email")) {
            <mat-error>E-mail inválido</mat-error>
          }
        </mat-form-field>
      </div>

      <p class="text-xs font-medium text-gray-600 border-b pb-1 mb-3 mt-2">ENDEREÇO</p>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-x-4">
        <mat-form-field appearance="outline">
          <mat-label>CEP</mat-label>
          <input matInput formControlName="cep" placeholder="00000-000" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="md:col-span-3">
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

        <mat-form-field appearance="outline" class="md:col-span-2">
          <mat-label>Bairro</mat-label>
          <input matInput formControlName="bairro" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="md:col-span-3">
          <mat-label>Cidade</mat-label>
          <input matInput formControlName="cidade" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Estado (UF)</mat-label>
          <mat-select formControlName="estado">
            <mat-option value="">—</mat-option>
            @for (uf of ufs; track uf) {
              <mat-option [value]="uf">{{ uf }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>

      <p class="text-xs font-medium text-gray-600 border-b pb-1 mb-3 mt-2">
        OUTRO DOCUMENTO PARA IDENTIFICAÇÃO
      </p>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-x-4">
        <mat-form-field appearance="outline">
          <mat-label>Tipo do documento</mat-label>
          <mat-select formControlName="tipoDocumentoIdentificacao">
            <mat-option value="">—</mat-option>
            @for (t of tiposDocumentoIdentificacao; track t) {
              <mat-option [value]="t">{{ t }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Identificador</mat-label>
          <input matInput formControlName="numeroDocumentoIdentificacao" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Profissão</mat-label>
          <input matInput formControlName="profissao" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="md:col-span-2">
          <mat-label>Empresa</mat-label>
          <input matInput formControlName="empresa" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Necessidades especiais</mat-label>
          <input matInput formControlName="necessidadesEspeciais" />
        </mat-form-field>
      </div>

      <p class="text-xs font-medium text-gray-600 border-b pb-1 mb-3 mt-2">CAPTAÇÃO</p>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-x-4">
        <mat-form-field appearance="outline">
          <mat-label>Origem do cadastro</mat-label>
          <mat-select formControlName="origemCadastro">
            <mat-option value="">—</mat-option>
            @for (o of origensCadastro; track o) {
              <mat-option [value]="o">{{ o }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Agente educacional</mat-label>
          <mat-select formControlName="agenteEducacionalId">
            <mat-option value="">—</mat-option>
            @for (a of agentes; track a.id) {
              <mat-option [value]="a.id">{{ a.nome }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Mediador</mat-label>
          <input matInput formControlName="mediador" />
        </mat-form-field>
      </div>

      <div class="flex justify-end gap-2 mt-2">
        <a mat-button routerLink="/alunos">Cancelar</a>
        <button mat-raised-button color="primary" type="submit" [disabled]="salvando">
          Salvar
        </button>
      </div>
    </form>

    @if (editando && id) {
      <section class="bg-white rounded shadow-sm p-6 max-w-4xl mt-4">
        <div class="flex items-center mb-3">
          <p class="text-sm font-medium text-gray-700 m-0">Matrículas / cursos</p>
          <a mat-flat-button color="primary" class="ml-auto" [routerLink]="['/matriculas/cadastro']" [queryParams]="{ alunoId: id }">
            <mat-icon>add</mat-icon> Adicionar curso
          </a>
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-400">
              <th class="py-1 pr-2">Matrícula</th>
              <th class="pr-2">Curso</th>
              <th class="pr-2">Data</th>
              <th class="pr-2">Situação</th>
              <th class="pr-2">Agente educacional</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (m of matriculas; track m.id) {
              <tr class="border-t">
                <td class="py-1 pr-2 whitespace-nowrap">{{ m.numeroMatricula || "—" }}</td>
                <td class="pr-2">{{ m.curso?.nome }}</td>
                <td class="pr-2 whitespace-nowrap">{{ m.dataMatricula ? (m.dataMatricula | date: "dd/MM/yyyy") : "—" }}</td>
                <td class="pr-2">
                  <span class="px-2 py-0.5 rounded text-xs whitespace-nowrap" [class]="classeSituacao(m.situacao)">{{ rotuloSituacao(m.situacao) }}</span>
                </td>
                <td class="pr-2">{{ m.agenteEducacional?.nome || "—" }}</td>
                <td class="text-right">
                  <a mat-icon-button [routerLink]="['/matriculas', m.id]" aria-label="Abrir matrícula">
                    <mat-icon>edit</mat-icon>
                  </a>
                </td>
              </tr>
            } @empty {
              <tr><td class="py-3 text-gray-500" colspan="6">Este aluno ainda não tem matrícula.</td></tr>
            }
          </tbody>
        </table>
      </section>
    }
  `,
})
export class AlunoFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(AlunosService);
  private readonly matriculasService = inject(MatriculasService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  readonly ufs = UFS;
  readonly generos = GENEROS;
  readonly tiposDocumentoIdentificacao = TIPOS_DOCUMENTO_IDENTIFICACAO;
  readonly origensCadastro = ORIGENS_CADASTRO;

  editando = false;
  carregando = false;
  salvando = false;
  codigo: string | null = null;
  agentes: AgenteEducacional[] = [];
  id: string | null = null;
  matriculas: Matricula[] = [];
  protected readonly rotuloSituacao = rotuloSituacaoMatricula;
  protected readonly classeSituacao = classeSituacaoMatricula;

  readonly form = this.fb.group({
    cpf: ["", [Validators.required, cpfValidator]],
    nome: ["", [Validators.required]],
    tipoPessoa: [""],
    email: ["", [Validators.email]],
    telefone1: [""],
    telefone2: [""],
    cep: [""],
    endereco: [""],
    numero: [""],
    complemento: [""],
    bairro: [""],
    cidade: [""],
    estado: [""],
    genero: [""],
    dataNascimento: [""],
    estadoNascimento: [""],
    cidadeNascimento: [""],
    nomeMae: [""],
    nomePai: [""],
    tipoDocumentoIdentificacao: [""],
    numeroDocumentoIdentificacao: [""],
    profissao: [""],
    empresa: [""],
    necessidadesEspeciais: [""],
    origemCadastro: [""],
    mediador: [""],
    agenteEducacionalId: [""],
  });

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get("id");
    this.editando = !!this.id;
    this.matriculasService.listarAgentes().subscribe((agentes) => (this.agentes = agentes));

    if (this.editando && this.id) {
      // CPF é a identidade do aluno: não editável após a criação.
      this.form.controls.cpf.disable();
      this.carregando = true;
      this.matriculasService
        .listar({ alunoId: this.id, pageSize: 50 })
        .subscribe((res) => (this.matriculas = res.data));
      this.service.buscarPorId(this.id).subscribe({
        next: (aluno) => {
          this.codigo = aluno.codigo ?? null;
          this.form.patchValue({
            cpf: aluno.cpf,
            nome: aluno.nome,
            tipoPessoa: aluno.tipoPessoa ?? "",
            email: aluno.email ?? "",
            telefone1: aluno.telefone1 ?? "",
            telefone2: aluno.telefone2 ?? "",
            cep: aluno.cep ?? "",
            endereco: aluno.endereco ?? "",
            numero: aluno.numero ?? "",
            complemento: aluno.complemento ?? "",
            bairro: aluno.bairro ?? "",
            cidade: aluno.cidade ?? "",
            estado: aluno.estado ?? "",
            genero: aluno.genero ?? "",
            dataNascimento: aluno.dataNascimento ? aluno.dataNascimento.substring(0, 10) : "",
            estadoNascimento: aluno.estadoNascimento ?? "",
            cidadeNascimento: aluno.cidadeNascimento ?? "",
            nomeMae: aluno.nomeMae ?? "",
            nomePai: aluno.nomePai ?? "",
            tipoDocumentoIdentificacao: aluno.tipoDocumentoIdentificacao ?? "",
            numeroDocumentoIdentificacao: aluno.numeroDocumentoIdentificacao ?? "",
            profissao: aluno.profissao ?? "",
            empresa: aluno.empresa ?? "",
            necessidadesEspeciais: aluno.necessidadesEspeciais ?? "",
            origemCadastro: aluno.origemCadastro ?? "",
            mediador: aluno.mediador ?? "",
            agenteEducacionalId: aluno.agenteEducacionalId ?? "",
          });
          this.carregando = false;
        },
        error: () => (this.carregando = false),
      });
    }
  }

  salvar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.salvando = true;
    const bruto = this.form.getRawValue();
    // Remove campos vazios do payload — exceto o agente educacional na edição,
    // onde "" significa "desvincular".
    const payload: AlunoPayload = {};
    for (const [chave, valor] of Object.entries(bruto)) {
      if (valor !== "" && valor !== null) (payload as Record<string, unknown>)[chave] = valor;
    }
    if (this.editando && bruto.agenteEducacionalId === "") payload.agenteEducacionalId = "";

    const requisicao =
      this.editando && this.id
        ? // CPF não é enviado na atualização.
          this.service.atualizar(this.id, { ...payload, cpf: undefined })
        : this.service.criar(payload);

    requisicao.subscribe({
      next: () => {
        this.snackBar.open("Aluno salvo", "Fechar", { duration: 3000 });
        this.router.navigate(["/alunos"]);
      },
      error: () => (this.salvando = false),
    });
  }
}
