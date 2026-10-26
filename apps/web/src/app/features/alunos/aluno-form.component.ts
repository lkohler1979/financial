import { DatePipe } from "@angular/common";
import { Component, computed, inject, OnInit, signal } from "@angular/core";
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
import { AuthService } from "../../core/auth/auth.service";
import { AlunosService } from "../../core/services/alunos.service";
import { AuditoriaService } from "../../core/services/auditoria.service";
import { MatriculasService } from "../../core/services/matriculas.service";
import { Aluno, AlunoPayload, ResumoAluno } from "../../core/models/aluno.model";
import { Auditoria } from "../../core/models/auditoria.model";
import {
  AgenteEducacional,
  classeSituacaoMatricula,
  Matricula,
  rotuloSituacaoMatricula,
} from "../../core/models/matricula.model";
import { DocumentosMatriculaComponent } from "../matriculas/documentos-matricula.component";
import { formatarCpf, validarCpf } from "../../shared/utils/cpf.util";
import { iniciaisDe } from "../../shared/utils/iniciais";
import { TitulosAlunoComponent } from "./titulos-aluno.component";

function cpfValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  return validarCpf(control.value) ? null : { cpf: true };
}

const UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
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

type Aba = "dados" | "matriculas" | "financeiro" | "documentos" | "historico";

const ROTULO_ACAO = {
  CRIACAO: "Criação",
  ATUALIZACAO: "Atualização",
  EXCLUSAO: "Exclusão",
} as const;

/**
 * Cadastro do aluno (padrão docs/especificacao): título e código, abas (Dados cadastrais,
 * Matrículas, Financeiro, Documentos, Histórico), seções em cartão, resumo do aluno ao lado e
 * rodapé fixo com Cancelar / Salvar alterações.
 */
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
    TitulosAlunoComponent,
    DocumentosMatriculaComponent,
  ],
  template: `
    <div class="ef-page">
      <a
        routerLink="/alunos"
        class="mb-3 inline-flex items-center gap-2 text-sm font-medium text-brand-700 no-underline hover:underline"
      >
        <mat-icon class="!h-5 !w-5 !text-[20px]">arrow_back</mat-icon> Voltar para alunos
      </a>

      <div class="ef-page-header !mb-2">
        <div>
          <h1 class="ef-title">{{ editando ? "Cadastro do aluno" : "Novo aluno" }}</h1>
          <p class="ef-subtitle">
            {{
              editando
                ? "Mantenha os dados do aluno organizados e atualizados."
                : "Preencha os dados do aluno para criar o cadastro."
            }}
          </p>
        </div>
        @if (codigo) {
          <span class="rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-muted">
            Código <strong class="ml-1 text-ink">{{ codigo }}</strong>
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
            Dados cadastrais
          </button>
          <button
            type="button"
            role="tab"
            class="ef-tab"
            [attr.aria-selected]="aba() === 'matriculas'"
            (click)="aba.set('matriculas')"
          >
            Matrículas ({{ matriculas.length }})
          </button>
          @if (auth.temPerfil("ADMINISTRADOR", "FINANCEIRO")) {
            <button
              type="button"
              role="tab"
              class="ef-tab"
              [attr.aria-selected]="aba() === 'financeiro'"
              (click)="aba.set('financeiro')"
            >
              Financeiro
            </button>
          }
          <button
            type="button"
            role="tab"
            class="ef-tab"
            [attr.aria-selected]="aba() === 'documentos'"
            (click)="aba.set('documentos')"
          >
            Documentos
          </button>
          @if (auth.temPerfil("ADMINISTRADOR")) {
            <button
              type="button"
              role="tab"
              class="ef-tab"
              [attr.aria-selected]="aba() === 'historico'"
              (click)="abrirHistorico()"
            >
              Histórico
            </button>
          }
        </div>
      }

      @if (carregando) {
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      }

      <!-- ===== Dados cadastrais ===== -->
      <div
        [class.hidden]="aba() !== 'dados'"
        class="grid items-start gap-5 lg:grid-cols-[1fr_320px]"
      >
        <form
          [formGroup]="form"
          (ngSubmit)="salvar()"
          class="ef-card min-w-0 p-6"
          aria-label="Dados do aluno"
        >
          <h2 class="ef-card-title"><mat-icon>person</mat-icon> Dados pessoais</h2>
          <div class="grid grid-cols-1 gap-x-4 md:grid-cols-6">
            <mat-form-field appearance="outline" class="md:col-span-6">
              <mat-label>Nome completo</mat-label>
              <input matInput formControlName="nome" />
              @if (form.controls.nome.hasError("required")) {
                <mat-error>Nome é obrigatório</mat-error>
              }
            </mat-form-field>

            @if (editando) {
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="md:col-span-2">
                <mat-label>CPF *</mat-label>
                <input matInput [value]="cpfExibido()" readonly aria-readonly="true" />
                <button
                  matSuffix
                  mat-icon-button
                  type="button"
                  [attr.aria-label]="cpfVisivel() ? 'Ocultar CPF' : 'Mostrar CPF'"
                  [title]="cpfVisivel() ? 'Ocultar CPF' : 'Mostrar CPF'"
                  (click)="cpfVisivel.set(!cpfVisivel())"
                >
                  <mat-icon>{{ cpfVisivel() ? "lock_open" : "lock" }}</mat-icon>
                </button>
                <mat-hint>Dados protegidos</mat-hint>
              </mat-form-field>
            } @else {
              <mat-form-field appearance="outline" class="md:col-span-2">
                <mat-label>CPF</mat-label>
                <input matInput formControlName="cpf" maxlength="14" />
                @if (form.controls.cpf.hasError("required")) {
                  <mat-error>CPF é obrigatório</mat-error>
                }
                @if (form.controls.cpf.hasError("cpf")) {
                  <mat-error>CPF inválido</mat-error>
                }
              </mat-form-field>
            }

            <mat-form-field appearance="outline" class="md:col-span-2">
              <mat-label>Data de nascimento</mat-label>
              <input matInput type="date" formControlName="dataNascimento" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="md:col-span-2">
              <mat-label>Gênero</mat-label>
              <mat-select formControlName="genero">
                <mat-option value="">—</mat-option>
                @for (g of generos; track g) {
                  <mat-option [value]="g">{{ g }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline" class="md:col-span-2">
              <mat-label>Tipo de pessoa</mat-label>
              <input matInput formControlName="tipoPessoa" placeholder="Ex.: Pessoa física" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="md:col-span-2">
              <mat-label>Naturalidade (cidade)</mat-label>
              <input
                matInput
                formControlName="cidadeNascimento"
                placeholder="Cidade de nascimento"
              />
            </mat-form-field>

            <mat-form-field appearance="outline" class="md:col-span-2">
              <mat-label>UF de nascimento</mat-label>
              <mat-select formControlName="estadoNascimento">
                <mat-option value="">—</mat-option>
                @for (uf of ufs; track uf) {
                  <mat-option [value]="uf">{{ uf }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline" class="md:col-span-3">
              <mat-label>Nome da mãe</mat-label>
              <input matInput formControlName="nomeMae" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="md:col-span-3">
              <mat-label>Nome do pai</mat-label>
              <input matInput formControlName="nomePai" />
            </mat-form-field>
          </div>

          <hr class="my-4 border-0 border-t border-line" />
          <h2 class="ef-card-title"><mat-icon>call</mat-icon> Contato</h2>
          <div class="grid grid-cols-1 gap-x-4 md:grid-cols-6">
            <mat-form-field appearance="outline" class="md:col-span-3">
              <mat-label>E-mail</mat-label>
              <input matInput type="email" formControlName="email" />
              @if (form.controls.email.hasError("email")) {
                <mat-error>E-mail inválido</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline" class="md:col-span-2">
              <mat-label>Celular</mat-label>
              <input matInput formControlName="telefone1" placeholder="(00) 00000-0000" />
            </mat-form-field>

            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="md:col-span-1">
              <mat-label>Telefone</mat-label>
              <input matInput formControlName="telefone2" placeholder="(00) 0000-0000" />
              <mat-hint>Opcional</mat-hint>
            </mat-form-field>
          </div>

          <hr class="my-4 border-0 border-t border-line" />
          <h2 class="ef-card-title"><mat-icon>location_on</mat-icon> Endereço</h2>
          <div class="grid grid-cols-1 gap-x-4 md:grid-cols-6">
            <mat-form-field appearance="outline" class="md:col-span-2">
              <mat-label>CEP</mat-label>
              <input matInput formControlName="cep" placeholder="00000-000" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="md:col-span-4">
              <mat-label>Endereço</mat-label>
              <input matInput formControlName="endereco" placeholder="Rua, avenida ou logradouro" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="md:col-span-1">
              <mat-label>Número</mat-label>
              <input matInput formControlName="numero" />
            </mat-form-field>

            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="md:col-span-3">
              <mat-label>Complemento</mat-label>
              <input matInput formControlName="complemento" placeholder="Apartamento, sala, etc." />
              <mat-hint>Opcional</mat-hint>
            </mat-form-field>

            <mat-form-field appearance="outline" class="md:col-span-2">
              <mat-label>Bairro</mat-label>
              <input matInput formControlName="bairro" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="md:col-span-4">
              <mat-label>Cidade</mat-label>
              <input matInput formControlName="cidade" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="md:col-span-2">
              <mat-label>Estado (UF)</mat-label>
              <mat-select formControlName="estado">
                <mat-option value="">—</mat-option>
                @for (uf of ufs; track uf) {
                  <mat-option [value]="uf">{{ uf }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>

          <hr class="my-4 border-0 border-t border-line" />
          <h2 class="ef-card-title"><mat-icon>badge</mat-icon> Documento e profissão</h2>
          <div class="grid grid-cols-1 gap-x-4 md:grid-cols-6">
            <mat-form-field appearance="outline" class="md:col-span-2">
              <mat-label>Tipo do documento</mat-label>
              <mat-select formControlName="tipoDocumentoIdentificacao">
                <mat-option value="">—</mat-option>
                @for (t of tiposDocumentoIdentificacao; track t) {
                  <mat-option [value]="t">{{ t }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline" class="md:col-span-2">
              <mat-label>Identificador</mat-label>
              <input matInput formControlName="numeroDocumentoIdentificacao" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="md:col-span-2">
              <mat-label>Profissão</mat-label>
              <input matInput formControlName="profissao" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="md:col-span-3">
              <mat-label>Empresa</mat-label>
              <input matInput formControlName="empresa" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="md:col-span-3">
              <mat-label>Necessidades especiais</mat-label>
              <input matInput formControlName="necessidadesEspeciais" />
            </mat-form-field>
          </div>

          <hr class="my-4 border-0 border-t border-line" />
          <h2 class="ef-card-title"><mat-icon>campaign</mat-icon> Captação</h2>
          <div class="grid grid-cols-1 gap-x-4 md:grid-cols-6">
            <mat-form-field appearance="outline" class="md:col-span-2">
              <mat-label>Origem do cadastro</mat-label>
              <mat-select formControlName="origemCadastro">
                <mat-option value="">—</mat-option>
                @for (o of origensCadastro; track o) {
                  <mat-option [value]="o">{{ o }}</mat-option>
                }
              </mat-select>
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

            <mat-form-field appearance="outline" class="md:col-span-2">
              <mat-label>Mediador</mat-label>
              <input matInput formControlName="mediador" />
            </mat-form-field>
          </div>

          <div class="ef-form-footer">
            <span class="text-sm text-muted"
              ><span class="text-red-600">*</span> Campos obrigatórios</span
            >
            <span class="flex-1"></span>
            <a mat-stroked-button routerLink="/alunos">Cancelar</a>
            <button mat-flat-button color="primary" type="submit" [disabled]="salvando">
              <mat-icon>check</mat-icon> {{ editando ? "Salvar alterações" : "Criar aluno" }}
            </button>
          </div>
        </form>

        @if (editando && resumo(); as r) {
          <aside class="grid gap-3" aria-label="Resumo do aluno">
            <section class="ef-card p-5">
              <div class="flex items-center gap-4">
                <span class="ef-avatar ef-avatar-lg">{{ iniciais() }}</span>
                <div class="min-w-0">
                  <p class="m-0 break-words text-lg font-semibold leading-tight">
                    {{ form.controls.nome.value }}
                  </p>
                  <p class="m-0 text-sm text-muted">Código {{ codigo || "—" }}</p>
                </div>
              </div>

              <hr class="my-4 border-0 border-t border-line" />
              <h2 class="ef-card-title !mb-3"><mat-icon>school</mat-icon> Resumo acadêmico</h2>
              <dl class="m-0 grid gap-3 text-sm">
                <div>
                  <dt class="text-muted">Total de matrículas</dt>
                  <dd class="m-0 text-base font-medium">{{ r.totalMatriculas }}</dd>
                </div>
                <div>
                  <dt class="text-muted">Curso atual</dt>
                  <dd class="m-0 text-base font-medium">
                    {{ r.ultimaMatricula?.cursoNome || "—" }}
                  </dd>
                </div>
              </dl>

              <hr class="my-4 border-0 border-t border-line" />
              <h2 class="ef-card-title !mb-3">
                <mat-icon>credit_card</mat-icon> Situação financeira
              </h2>
              <div [class]="caixaSituacao(r).classe" data-testid="situacao-financeira">
                <mat-icon>{{ caixaSituacao(r).icone }}</mat-icon>
                <div class="leading-tight">
                  <p class="m-0 font-semibold">{{ caixaSituacao(r).titulo }}</p>
                  <p class="m-0 text-xs">{{ caixaSituacao(r).detalhe }}</p>
                </div>
              </div>
              @if (auth.temPerfil("ADMINISTRADOR", "FINANCEIRO")) {
                <button
                  type="button"
                  class="mt-3 inline-flex items-center gap-1 border-0 bg-transparent p-0 text-sm font-medium text-brand-700 hover:underline"
                  (click)="aba.set('financeiro')"
                >
                  Ver financeiro <mat-icon class="!h-5 !w-5 !text-[20px]">arrow_forward</mat-icon>
                </button>
              }
            </section>

            @if (atualizadoEm) {
              <section
                class="flex items-center gap-3 rounded-lg bg-[#eef2f4] p-4 text-sm text-muted"
              >
                <mat-icon>schedule</mat-icon>
                <span>
                  Atualizado em<br />
                  <strong class="font-medium text-ink">{{
                    atualizadoEm | date: "dd/MM/yyyy 'às' HH:mm"
                  }}</strong>
                </span>
              </section>
            }
          </aside>
        }
      </div>

      <!-- ===== Matrículas ===== -->
      @if (editando && id && aba() === "matriculas") {
        <section class="ef-card p-6">
          <div class="mb-3 flex items-center">
            <h2 class="ef-card-title !mb-0"><mat-icon>event_note</mat-icon> Matrículas / cursos</h2>
            <a
              mat-flat-button
              color="primary"
              class="ml-auto"
              [routerLink]="['/matriculas/cadastro']"
              [queryParams]="{ alunoId: id }"
            >
              <mat-icon>add</mat-icon> Adicionar curso
            </a>
          </div>
          <div class="overflow-x-auto">
            <table class="ef-table">
              <thead>
                <tr>
                  <th>Matrícula</th>
                  <th>Curso</th>
                  <th>Data</th>
                  <th>Situação</th>
                  <th>Agente educacional</th>
                  <th class="w-[1%]"></th>
                </tr>
              </thead>
              <tbody>
                @for (m of matriculas; track m.id) {
                  <tr>
                    <td class="whitespace-nowrap">{{ m.numeroMatricula || "—" }}</td>
                    <td>{{ m.curso?.nome }}</td>
                    <td class="whitespace-nowrap">
                      {{ m.dataMatricula ? (m.dataMatricula | date: "dd/MM/yyyy" : "UTC") : "—" }}
                    </td>
                    <td>
                      <span
                        class="whitespace-nowrap rounded px-2 py-0.5 text-xs"
                        [class]="classeSituacao(m.situacao)"
                        >{{ rotuloSituacao(m.situacao) }}</span
                      >
                    </td>
                    <td>{{ m.agenteEducacional?.nome || "—" }}</td>
                    <td class="whitespace-nowrap text-right">
                      @if (auth.temPerfil("ADMINISTRADOR")) {
                        <a
                          mat-stroked-button
                          class="mr-1 !h-9"
                          [routerLink]="['/cobranca/matriculas', m.id]"
                          >Cobrança</a
                        >
                      }
                      <a
                        mat-icon-button
                        [routerLink]="['/matriculas', m.id]"
                        aria-label="Abrir matrícula"
                      >
                        <mat-icon>edit</mat-icon>
                      </a>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td class="py-4 text-muted" colspan="6">Este aluno ainda não tem matrícula.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      <!-- ===== Financeiro ===== -->
      @if (editando && aba() === "financeiro") {
        <app-titulos-aluno [embutido]="true" />
      }

      <!-- ===== Documentos ===== -->
      @if (editando && aba() === "documentos") {
        <div class="grid gap-4">
          @for (m of matriculas; track m.id) {
            <section class="ef-card p-6">
              <h2 class="ef-card-title !mb-0">
                <mat-icon>folder_open</mat-icon> {{ m.curso?.nome }}
                <span class="text-sm font-normal text-muted">{{ m.numeroMatricula }}</span>
              </h2>
              <app-documentos-matricula [matriculaId]="m.id" />
            </section>
          } @empty {
            <p class="ef-card m-0 p-6 text-muted">
              Os documentos ficam em cada matrícula, e este aluno ainda não tem matrícula.
            </p>
          }
        </div>
      }

      <!-- ===== Histórico ===== -->
      @if (editando && aba() === "historico") {
        <section class="ef-card p-6">
          <h2 class="ef-card-title"><mat-icon>history</mat-icon> Histórico do cadastro</h2>
          <div class="overflow-x-auto">
            <table class="ef-table">
              <thead>
                <tr>
                  <th>Data e hora</th>
                  <th>Usuário</th>
                  <th>Ação</th>
                  <th>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                @for (h of historico(); track h.id) {
                  <tr>
                    <td class="whitespace-nowrap">{{ h.data | date: "dd/MM/yyyy HH:mm" }}</td>
                    <td>{{ h.usuario?.nome || "—" }}</td>
                    <td>
                      <span class="ef-pill" [class.ef-pill-ok]="h.acao === 'CRIACAO'">{{
                        rotuloAcao(h.acao)
                      }}</span>
                    </td>
                    <td class="text-muted">{{ detalheHistorico(h) }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td class="py-4 text-muted" colspan="4">
                      {{ carregandoHistorico() ? "Carregando…" : "Nenhum registro de alteração." }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </div>
  `,
})
export class AlunoFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(AlunosService);
  private readonly matriculasService = inject(MatriculasService);
  private readonly auditoriaService = inject(AuditoriaService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  readonly auth = inject(AuthService);

  readonly ufs = UFS;
  readonly generos = GENEROS;
  readonly tiposDocumentoIdentificacao = TIPOS_DOCUMENTO_IDENTIFICACAO;
  readonly origensCadastro = ORIGENS_CADASTRO;

  editando = false;
  carregando = false;
  salvando = false;
  codigo: string | null = null;
  atualizadoEm: string | null = null;
  agentes: AgenteEducacional[] = [];
  id: string | null = null;
  matriculas: Matricula[] = [];
  protected readonly rotuloSituacao = rotuloSituacaoMatricula;
  protected readonly classeSituacao = classeSituacaoMatricula;

  readonly aba = signal<Aba>("dados");
  readonly resumo = signal<ResumoAluno | null>(null);
  readonly historico = signal<Auditoria[]>([]);
  readonly carregandoHistorico = signal(false);
  /** O CPF aparece mascarado (***.***.***-**) até o usuário pedir para mostrar. */
  readonly cpfVisivel = signal(false);
  private readonly cpfDoAluno = signal("");
  private readonly nome = signal("");

  readonly cpfExibido = computed(() =>
    this.cpfVisivel() ? formatarCpf(this.cpfDoAluno()) : "***.***.***-**",
  );
  readonly iniciais = computed(() => iniciaisDe(this.nome()));

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
    this.form.controls.nome.valueChanges.subscribe((n) => this.nome.set(n ?? ""));

    if (this.editando && this.id) {
      // CPF é a identidade do aluno: não editável após a criação.
      this.form.controls.cpf.disable();
      this.carregando = true;
      this.matriculasService
        .listar({ alunoId: this.id, pageSize: 50 })
        .subscribe((res) => (this.matriculas = res.data));
      this.carregarResumo();
      this.service.buscarPorId(this.id).subscribe({
        next: (aluno) => {
          this.preencher(aluno);
          this.carregando = false;
        },
        error: () => (this.carregando = false),
      });
    }
  }

  private preencher(aluno: Aluno): void {
    this.codigo = aluno.codigo ?? null;
    this.atualizadoEm = aluno.atualizadoEm ?? null;
    this.cpfDoAluno.set(aluno.cpf);
    this.nome.set(aluno.nome);
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
  }

  private carregarResumo(): void {
    if (this.id) this.service.resumo(this.id).subscribe((r) => this.resumo.set(r));
  }

  /** Caixa colorida da situação financeira do cartão lateral. */
  caixaSituacao(r: ResumoAluno): {
    classe: string;
    icone: string;
    titulo: string;
    detalhe: string;
  } {
    const base = "flex items-center gap-3 rounded-lg border p-3 ";
    switch (r.situacaoFinanceira) {
      case "EM_ATRASO":
        return {
          classe: base + "border-red-200 bg-[var(--ef-bad-bg)] text-[var(--ef-bad)]",
          icone: "error_outline",
          titulo: "Em atraso",
          detalhe:
            r.parcelasVencidas === 1
              ? "1 parcela vencida."
              : `${r.parcelasVencidas} parcelas vencidas.`,
        };
      case "EM_DIA":
        return {
          classe: base + "border-green-200 bg-[var(--ef-ok-bg)] text-[var(--ef-ok)]",
          icone: "check_circle_outline",
          titulo: "Em dia",
          detalhe: "Nenhuma parcela vencida.",
        };
      default:
        return {
          classe: base + "border-line bg-[var(--ef-neutral-bg)] text-[var(--ef-neutral)]",
          icone: "info",
          titulo: "Sem matrícula",
          detalhe: "O aluno ainda não tem matrícula.",
        };
    }
  }

  abrirHistorico(): void {
    this.aba.set("historico");
    if (!this.id || this.historico().length > 0) return;
    this.carregandoHistorico.set(true);
    this.auditoriaService
      .listar({ entidade: "Aluno", entidadeId: this.id, pageSize: 50 })
      .subscribe({
        next: (r) => {
          this.historico.set(r.data);
          this.carregandoHistorico.set(false);
        },
        error: () => this.carregandoHistorico.set(false),
      });
  }

  rotuloAcao(acao: Auditoria["acao"]): string {
    return ROTULO_ACAO[acao];
  }

  /** "Campos alterados: nome, email" para atualizações; vazio para os demais. */
  detalheHistorico(h: Auditoria): string {
    const detalhes = h.detalhes as { camposAlterados?: string[] } | null | undefined;
    return detalhes?.camposAlterados?.length
      ? `Campos alterados: ${detalhes.camposAlterados.join(", ")}`
      : "—";
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
