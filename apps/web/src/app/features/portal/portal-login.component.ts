import { Component, inject } from "@angular/core";
import { Router } from "@angular/router";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { AlunoAuthService } from "../../core/auth/aluno-auth.service";

/** Máscara de CPF (até 11 dígitos) ou CNPJ (12 a 14 dígitos), conforme o que for digitado. */
function formatarDocumento(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

/**
 * Acesso à área do aluno: CPF + data de nascimento, ou — para empresa que paga
 * a matrícula (CNPJ) — CNPJ + número da matrícula.
 */
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
          <mat-card-subtitle>
            {{ ehCnpj() ? "Entre com o CNPJ e o número da matrícula" : "Entre com seu CPF e data de nascimento" }}
          </mat-card-subtitle>
        </mat-card-header>

        @if (entrando) {
          <mat-progress-bar mode="indeterminate"></mat-progress-bar>
        }

        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="entrar()" class="flex flex-col gap-1 pt-2">
            <mat-form-field appearance="outline">
              <mat-label>CPF ou CNPJ</mat-label>
              <input
                matInput
                formControlName="documento"
                inputmode="numeric"
                autocomplete="off"
                maxlength="18"
                (input)="mascarar()"
              />
              @if (form.controls.documento.invalid) {
                <mat-error>Informe o CPF ou CNPJ completo</mat-error>
              }
            </mat-form-field>

            @if (ehCnpj()) {
              <mat-form-field appearance="outline">
                <mat-label>Número da matrícula</mat-label>
                <input matInput formControlName="numeroMatricula" autocomplete="off" />
                <mat-hint>Uma matrícula paga por esta empresa</mat-hint>
              </mat-form-field>
            } @else {
              <mat-form-field appearance="outline">
                <mat-label>Data de nascimento</mat-label>
                <input matInput type="date" formControlName="dataNascimento" />
              </mat-form-field>
            }

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
    documento: ["", [Validators.required, Validators.minLength(14)]],
    dataNascimento: [""],
    numeroMatricula: [""],
  });

  /** Mais de 11 dígitos = CNPJ (o segundo fator passa a ser o número da matrícula). */
  ehCnpj(): boolean {
    return this.form.controls.documento.value.replace(/\D/g, "").length > 11;
  }

  mascarar(): void {
    const { documento } = this.form.controls;
    documento.setValue(formatarDocumento(documento.value), { emitEvent: false });
  }

  entrar(): void {
    const { documento, dataNascimento, numeroMatricula } = this.form.getRawValue();
    const cnpj = this.ehCnpj();
    const digitos = documento.replace(/\D/g, "");
    if (this.form.controls.documento.invalid || (cnpj ? digitos.length !== 14 : digitos.length !== 11)) {
      this.form.markAllAsTouched();
      this.mensagemErro = "Informe o CPF (11 dígitos) ou CNPJ (14 dígitos) completo";
      return;
    }
    if (cnpj ? !numeroMatricula.trim() : !dataNascimento) {
      this.mensagemErro = cnpj ? "Informe o número da matrícula" : "Informe a data de nascimento";
      return;
    }

    this.entrando = true;
    this.mensagemErro = "";
    const segundoFator = cnpj ? { numeroMatricula: numeroMatricula.trim() } : { dataNascimento };
    this.alunoAuth.login(documento, segundoFator).subscribe({
      next: () => this.router.navigate(["/aluno"]),
      error: (erro) => {
        this.entrando = false;
        this.mensagemErro = erro.error?.mensagem ?? "Dados de acesso inválidos";
      },
    });
  }
}
