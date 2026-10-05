import { Component, inject } from "@angular/core";
import { Router } from "@angular/router";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { AlunoAuthService } from "../../core/auth/aluno-auth.service";

function formatarCpf(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

/** Acesso do aluno: CPF + data de nascimento. */
@Component({
  selector: "app-portal-login",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
  ],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <mat-card class="w-full max-w-sm">
        <mat-card-header>
          <mat-card-title class="text-xl font-medium">Área do aluno</mat-card-title>
          <mat-card-subtitle>Entre com seu CPF e data de nascimento</mat-card-subtitle>
        </mat-card-header>

        @if (entrando) {
          <mat-progress-bar mode="indeterminate"></mat-progress-bar>
        }

        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="entrar()" class="flex flex-col gap-1 pt-2">
            <mat-form-field appearance="outline">
              <mat-label>CPF</mat-label>
              <input
                matInput
                formControlName="cpf"
                inputmode="numeric"
                autocomplete="off"
                maxlength="14"
                (input)="mascarar()"
              />
              @if (form.controls.cpf.hasError("required") || form.controls.cpf.hasError("minlength")) {
                <mat-error>Informe o CPF completo</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Data de nascimento</mat-label>
              <input matInput type="date" formControlName="dataNascimento" />
              @if (form.controls.dataNascimento.hasError("required")) {
                <mat-error>Informe a data de nascimento</mat-error>
              }
            </mat-form-field>

            @if (mensagemErro) {
              <p class="text-red-600 text-sm mb-2">{{ mensagemErro }}</p>
            }

            <button mat-raised-button color="primary" type="submit" class="w-full" [disabled]="entrando">
              Entrar
            </button>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `,
})
export class PortalLoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly alunoAuth = inject(AlunoAuthService);
  private readonly router = inject(Router);

  entrando = false;
  mensagemErro = "";

  readonly form = this.fb.nonNullable.group({
    cpf: ["", [Validators.required, Validators.minLength(14)]],
    dataNascimento: ["", Validators.required],
  });

  mascarar(): void {
    const { cpf } = this.form.controls;
    cpf.setValue(formatarCpf(cpf.value), { emitEvent: false });
  }

  entrar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.entrando = true;
    this.mensagemErro = "";
    const { cpf, dataNascimento } = this.form.getRawValue();
    this.alunoAuth.login(cpf, dataNascimento).subscribe({
      next: () => this.router.navigate(["/aluno"]),
      error: (erro) => {
        this.entrando = false;
        this.mensagemErro = erro.error?.mensagem ?? "CPF ou data de nascimento inválidos";
      },
    });
  }
}
