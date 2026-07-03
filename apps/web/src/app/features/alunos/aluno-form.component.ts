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
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSnackBar } from "@angular/material/snack-bar";
import { AlunosService } from "../../core/services/alunos.service";
import { AlunoPayload } from "../../core/models/aluno.model";
import { validarCpf } from "../../shared/utils/cpf.util";

function cpfValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  return validarCpf(control.value) ? null : { cpf: true };
}

@Component({
  selector: "app-aluno-form",
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
  ],
  template: `
    <div class="flex items-center gap-2 mb-4">
      <a mat-icon-button routerLink="/alunos" aria-label="Voltar"
        ><mat-icon>arrow_back</mat-icon></a
      >
      <h1 class="text-2xl font-medium m-0">{{ editando ? "Editar aluno" : "Novo aluno" }}</h1>
    </div>

    @if (carregando) {
      <mat-progress-bar mode="indeterminate"></mat-progress-bar>
    }

    <form [formGroup]="form" (ngSubmit)="salvar()" class="bg-white rounded shadow-sm p-6 max-w-3xl">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4">
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

        <mat-form-field appearance="outline">
          <mat-label>Nome</mat-label>
          <input matInput formControlName="nome" />
          @if (form.controls.nome.hasError("required")) {
            <mat-error>Nome é obrigatório</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Tipo de pessoa</mat-label>
          <input matInput formControlName="tipoPessoa" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>E-mail</mat-label>
          <input matInput type="email" formControlName="email" />
          @if (form.controls.email.hasError("email")) {
            <mat-error>E-mail inválido</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Telefone 1</mat-label>
          <input matInput formControlName="telefone1" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Telefone 2</mat-label>
          <input matInput formControlName="telefone2" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>CEP</mat-label>
          <input matInput formControlName="cep" />
        </mat-form-field>

        <mat-form-field appearance="outline">
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

        <mat-form-field appearance="outline">
          <mat-label>Cidade</mat-label>
          <input matInput formControlName="cidade" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Estado (UF)</mat-label>
          <input matInput formControlName="estado" maxlength="2" />
        </mat-form-field>
      </div>

      <div class="flex justify-end gap-2 mt-2">
        <a mat-button routerLink="/alunos">Cancelar</a>
        <button mat-raised-button color="primary" type="submit" [disabled]="salvando">
          Salvar
        </button>
      </div>
    </form>
  `,
})
export class AlunoFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(AlunosService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  editando = false;
  carregando = false;
  salvando = false;
  private id: string | null = null;

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
  });

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get("id");
    this.editando = !!this.id;

    if (this.editando && this.id) {
      // CPF é a identidade do aluno: não editável após a criação.
      this.form.controls.cpf.disable();
      this.carregando = true;
      this.service.buscarPorId(this.id).subscribe({
        next: (aluno) => {
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
    // Remove campos vazios do payload.
    const payload: AlunoPayload = {};
    for (const [chave, valor] of Object.entries(bruto)) {
      if (valor !== "" && valor !== null) (payload as Record<string, unknown>)[chave] = valor;
    }

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
